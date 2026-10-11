import test from 'node:test';
import assert from 'node:assert/strict';
import { MicrophoneOwner } from '../../apps/reference-harness/microphone-owner.js';
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture(deadlines) {
  const permission = deferred(),
    ready = deferred(),
    events = [],
    listeners = new Map();
  let controller = true,
    eligible = true,
    granted = false,
    token;
  const calls = {
    contexts: 0,
    closed: 0,
    tracksStopped: 0,
    graphs: 0,
    starts: 0,
    stops: 0,
    failed: 0,
    changed: 0,
  };
  const track = {
    kind: 'audio',
    readyState: 'live',
    stop() {
      ++calls.tracksStopped;
      this.readyState = 'ended';
    },
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
  };
  const context = {
    sampleRate: 48000,
    state: 'suspended',
    resume() {
      events.push('resume');
      this.state = 'running';
      return Promise.resolve();
    },
    close() {
      ++calls.closed;
      this.state = 'closed';
      return Promise.resolve();
    },
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
  };
  const client = {
    stats: { closed: false },
    get source() {
      return {
        granted,
        retiring: false,
        source: { availability: eligible ? 'ready' : 'waiting', epoch: 1n },
      };
    },
    async start(epoch) {
      assert.equal(epoch, 1n);
      ++calls.starts;
      events.push('grant');
      granted = true;
      return true;
    },
    async stop() {
      ++calls.stops;
      granted = false;
      token = undefined;
    },
    authorize: () => {
      token = Symbol('test permission');
      return token;
    },
    authorized: (value) => granted && value === token,
    sender: {},
  };
  const api = {
    gesture: () => true,
    request: () => {
      events.push('permission');
      return permission.promise;
    },
    context: () => {
      ++calls.contexts;
      events.push('context');
      return context;
    },
    graph(value) {
      assert.equal(value, context);
      ++calls.graphs;
      events.push('graph');
      return {
        ready: ready.promise,
        stats: { ready: true },
        close: () => context.close(),
      };
    },
  };
  const backend = {
    controller: () => controller,
    changed: () => ++calls.changed,
    failed: () => ++calls.failed,
  };
  const owner = new MicrophoneOwner(client, backend, api, deadlines);
  return {
    owner,
    api,
    backend,
    context,
    client,
    track,
    stream: { getTracks: () => [track] },
    permission,
    ready,
    calls,
    events,
    listeners,
    controller: (value) => {
      controller = value;
    },
    eligible: (value) => {
      eligible = value;
    },
  };
}

test('microphone startup owner: gesture/controller/source gate precedes context; context resume and permission precede grant/graph', async () => {
  const f = fixture();
  f.controller(false);
  assert.equal(await f.owner.start(), false);
  f.controller(true);
  f.eligible(false);
  assert.equal(await f.owner.start(), false);
  f.eligible(true);
  assert.equal(f.calls.contexts, 0);
  const started = f.owner.start();
  assert.deepEqual(f.events, ['context', 'resume', 'permission']);
  assert.equal(await f.owner.start(), false);
  f.permission.resolve(f.stream);
  await tick();
  f.ready.resolve(true);
  assert.equal(await started, true);
  assert.deepEqual(f.events, [
    'context',
    'resume',
    'permission',
    'grant',
    'graph',
  ]);
  await f.owner.stop();
  assert.equal(f.track.readyState, 'ended');
  assert.equal(f.context.state, 'closed');
  assert.equal(f.calls.stops, 1);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.owner.stats.preparing, false);
  await f.owner.close();
  assert.equal(await f.owner.start(), false);
});

test('microphone startup owner: denied permission closes prepared context without requesting grant or graph', async () => {
  const f = fixture(),
    started = f.owner.start();
  f.permission.reject(new Error('private device details'));
  assert.equal(await started, false);
  assert.equal(f.context.state, 'closed');
  assert.equal(f.calls.closed, 1);
  assert.equal(f.calls.starts, 0);
  assert.equal(f.calls.graphs, 0);
  assert.equal(f.owner.stats.failed, false);
  await f.owner.close();
});

test('microphone startup owner: stop/timeout while permission pending closes context, blocks another prompt and stops late track', async () => {
  for (const mode of ['stop', 'timeout', 'controller']) {
    const f = fixture({ permissionMs: 20, retirementMs: 100 });
    const started = f.owner.start();
    if (mode === 'stop') await f.owner.stop();
    if (mode === 'controller') {
      f.controller(false);
      f.owner.changed();
    }
    assert.equal(await started, false);
    assert.equal(f.context.state, 'closed');
    assert.equal(f.owner.stats.permissionPending, true);
    assert.equal(await f.owner.start(), false);
    f.permission.resolve(f.stream);
    await tick();
    assert.equal(f.track.readyState, 'ended');
    assert.equal(f.calls.starts, 0);
    assert.equal(f.calls.closed, 1);
    await f.owner.close();
  }
});

test('microphone startup owner: controller/source loss during graph startup stops tracks before pending initialization completes', async () => {
  for (const mode of ['controller', 'source']) {
    const f = fixture();
    const started = f.owner.start();
    f.permission.resolve(f.stream);
    await tick();
    if (mode === 'controller') f.controller(false);
    else f.eligible(false);
    f.owner.changed();
    assert.equal(f.track.readyState, 'ended');
    assert.equal(await f.owner.start(), false);
    f.ready.resolve(true);
    assert.equal(await started, false);
    await f.owner.stop();
    assert.equal(f.calls.closed, 1);
    assert.equal(f.calls.stops, 1);
    assert.equal(f.owner.stats.preparing, false);
    await f.owner.close();
  }
});

test('microphone startup owner: resume/context/graph failures close owned resources with sanitized failure and no reacquisition', async () => {
  for (const mode of ['resume', 'rate', 'listener', 'graph']) {
    const f = fixture();
    if (mode === 'resume')
      f.context.resume = () =>
        Promise.reject(new Error('private context details'));
    if (mode === 'rate') f.context.sampleRate = 44100;
    if (mode === 'listener')
      f.context.addEventListener = () => {
        throw new Error('private listener details');
      };
    if (mode === 'graph')
      f.api.graph = () => {
        throw new Error('private graph details');
      };
    const started = f.owner.start();
    f.permission.resolve(f.stream);
    assert.equal(await started, false, mode);
    assert.equal(f.context.state, 'closed', mode);
    assert.equal(f.owner.stats.failed, true, mode);
    assert.equal(await f.owner.start(), false, mode);
    await f.owner.close().catch(() => {});
  }
});

test('microphone startup owner: finite retirement deadline rejects hung cleanup, preserves closed admission and joins duplicate stop', async () => {
  const f = fixture({ permissionMs: 1000, retirementMs: 20 }),
    closing = deferred();
  f.context.close = () => {
    ++f.calls.closed;
    return closing.promise;
  };
  const started = f.owner.start();
  f.permission.reject(new Error('denied'));
  assert.equal(await started, false);
  assert.equal(f.owner.stats.failed, true);
  assert.equal(await f.owner.start(), false);
  assert.equal(f.calls.closed, 1);
  closing.resolve();
  await tick();
  await f.owner.close().catch(() => {});
});

test('microphone startup owner: reentrant context creation and changed callback cannot overlap startup or retain a late context', async () => {
  for (const mode of ['context', 'changed']) {
    const f = fixture();
    let stopped;
    if (mode === 'context')
      f.api.context = () => {
        ++f.calls.contexts;
        stopped = f.owner.stop();
        return f.context;
      };
    else
      f.backend.changed = () => {
        stopped = f.owner.stop();
      };
    const started = f.owner.start();
    f.permission.resolve(f.stream);
    f.ready.resolve(true);
    assert.equal(await started, false, mode);
    await stopped;
    assert.equal(f.context.state, 'closed', mode);
    assert.equal(f.calls.closed, 1, mode);
    assert.equal(f.calls.contexts, 1, mode);
    assert.equal(f.owner.stats.preparing, false, mode);
    await f.owner.close();
  }
});

test('microphone startup owner: graph observes revoked authority before owner poll; real graph/client/cleanup faults remain terminal', async () => {
  for (const mode of ['controller', 'grant', 'graph', 'client', 'cleanup']) {
    const f = fixture();
    let graphBackend;
    f.api.graph = (_context, _stream, _epoch, _token, _sender, backend) => {
      ++f.calls.graphs;
      graphBackend = backend;
      return {
        ready: Promise.resolve(true),
        stats: { ready: true },
        close: () =>
          mode === 'cleanup'
            ? Promise.reject(new Error('synthetic cleanup failure'))
            : f.context.close(),
      };
    };
    const started = f.owner.start();
    f.permission.resolve(f.stream);
    assert.equal(await started, true, mode);
    if (['controller', 'cleanup'].includes(mode)) f.controller(false);
    if (mode === 'grant') await f.client.stop();
    if (mode === 'client') {
      f.client.stats.failed = true;
      f.controller(false);
    }
    graphBackend.failed(); // No owner.changed()/timer has observed the loss yet.
    assert.equal(f.track.readyState, 'ended', mode);
    if (['controller', 'grant'].includes(mode)) {
      await f.owner.stop();
      assert.equal(f.calls.failed, 0, mode);
      assert.equal(f.owner.stats.failed, false, mode);
      assert.equal(f.context.state, 'closed', mode);
    } else {
      await f.owner.stop().catch(() => {});
      assert.equal(f.owner.stats.failed, true, mode);
      assert.equal(f.calls.failed, 1, mode);
      assert.equal(await f.owner.start(), false, mode);
    }
    await f.owner.close().catch(() => {});
  }
});
