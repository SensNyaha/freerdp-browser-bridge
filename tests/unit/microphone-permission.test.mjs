import test from 'node:test';
import assert from 'node:assert/strict';
import { MicrophonePermission } from '../../apps/reference-harness/microphone-permission.js';
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
function track(kind = 'audio') {
  const listeners = new Set();
  return {
    kind,
    readyState: 'live',
    stopped: 0,
    listeners,
    stop() {
      ++this.stopped;
      this.readyState = 'ended';
    },
    addEventListener(type, listener) {
      assert.equal(type, 'ended');
      listeners.add(listener);
    },
    removeEventListener(type, listener) {
      assert.equal(type, 'ended');
      listeners.delete(listener);
    },
    end() {
      this.readyState = 'ended';
      for (const listener of [...listeners]) listener();
    },
  };
}
function fixture(timeout = 1000, retirement = 1000) {
  const permission = deferred(),
    activation = deferred(),
    audio = track();
  const stream = { getTracks: () => [audio] };
  const calls = { requested: 0, begun: 0, closed: 0 };
  let eligible = true,
    gesture = true,
    current = true;
  const scope = {
    ready: activation.promise,
    current: () => current,
    close() {
      ++calls.closed;
      return Promise.resolve();
    },
  };
  const api = {
    gesture: () => gesture,
    request() {
      ++calls.requested;
      return permission.promise;
    },
  };
  const backend = {
    eligible: () => eligible,
    begin(value, epoch) {
      assert.equal(value, stream);
      assert.equal(epoch, 1n);
      ++calls.begun;
      return scope;
    },
  };
  const owner = new MicrophonePermission(backend, api, timeout, retirement);
  return {
    owner,
    api,
    backend,
    scope,
    calls,
    stream,
    audio,
    permission,
    activation,
    eligible(value) {
      eligible = value;
    },
    gesture(value) {
      gesture = value;
    },
    current(value) {
      current = value;
    },
  };
}

test('microphone permission: explicit gesture/current eligibility precede the sole request, activation follows permission, stop clears tracks/listeners', async () => {
  const f = fixture();
  f.gesture(false);
  assert.equal(await f.owner.start(1n), false);
  f.gesture(true);
  f.eligible(false);
  assert.equal(await f.owner.start(1n), false);
  for (const epoch of [0n, 1, 1n << 64n])
    assert.equal(await f.owner.start(epoch), false);
  assert.equal(f.calls.requested, 0);
  f.eligible(true);
  const started = f.owner.start(1n);
  assert.equal(await f.owner.start(1n), false);
  assert.equal(f.calls.requested, 1);
  assert.equal(f.calls.begun, 0);
  f.permission.resolve(f.stream);
  await tick();
  assert.equal(f.calls.begun, 1);
  assert.equal(f.audio.listeners.size, 1);
  assert.equal(f.owner.stats.active, false);
  f.activation.resolve(true);
  assert.equal(await started, true);
  assert.equal(f.owner.poll(), true);
  f.owner.stats.granted = 99;
  assert.equal(f.owner.stats.granted, 1);
  assert.equal(await f.owner.stop(), true);
  assert.equal(f.audio.stopped, 1);
  assert.equal(f.audio.listeners.size, 0);
  assert.equal(f.calls.closed, 1);
  assert.equal(f.owner.stats.active, false);
  assert.equal(await f.owner.close(), true);
  assert.equal(await f.owner.start(1n), false);
});

test('microphone permission: cancelled or timed-out browser request stops late streams and prevents overlapping prompts', async () => {
  for (const mode of ['stop', 'timeout', 'close']) {
    const f = fixture(20);
    const started = f.owner.start(1n);
    if (mode === 'stop') await f.owner.stop();
    if (mode === 'close') await f.owner.close();
    assert.equal(await started, false);
    assert.equal(f.owner.stats.permissionPending, true);
    assert.equal(await f.owner.start(1n), false);
    f.permission.resolve(f.stream);
    await tick();
    assert.equal(f.audio.stopped, 1, mode);
    assert.equal(f.calls.begun, 0, mode);
    assert.equal(f.owner.stats.permissionPending, false);
    await f.owner.close();
  }
});

test('microphone permission: request denial/exception is sanitized, malformed or multiple tracks are stopped without activation', async () => {
  for (const mode of [
    'denied',
    'throw',
    'empty',
    'video',
    'multiple',
    'ended',
  ]) {
    const f = fixture();
    const second = track();
    if (mode === 'throw')
      f.api.request = () => {
        throw new Error('private device details');
      };
    const started = f.owner.start(1n);
    if (mode === 'denied')
      f.permission.reject(new Error('private device details'));
    else if (mode === 'empty') f.permission.resolve({ getTracks: () => [] });
    else if (mode === 'multiple')
      f.permission.resolve({ getTracks: () => [f.audio, second] });
    else if (mode !== 'throw') {
      if (mode === 'video') f.audio.kind = 'video';
      if (mode === 'ended') f.audio.readyState = 'ended';
      f.permission.resolve(f.stream);
    }
    assert.equal(await started, false, mode);
    assert.equal(f.calls.begun, 0, mode);
    if (['video', 'multiple', 'ended'].includes(mode))
      assert.equal(f.audio.stopped, 1);
    if (mode === 'multiple') assert.equal(second.stopped, 1);
    assert.equal(f.owner.stats.active, false);
    await f.owner.close();
  }
});

test('microphone permission: eligibility loss before permission and grant/track loss during activation or active capture revoke once', async () => {
  for (const mode of [
    'beforePermission',
    'duringActivation',
    'ended',
    'activeLoss',
  ]) {
    const f = fixture();
    const started = f.owner.start(1n);
    if (mode === 'beforePermission') f.eligible(false);
    f.permission.resolve(f.stream);
    await tick();
    if (mode === 'duringActivation') {
      f.current(false);
      f.owner.poll();
    }
    if (mode === 'ended') f.audio.end();
    f.activation.resolve(true);
    assert.equal(await started, mode === 'activeLoss', mode);
    if (mode === 'activeLoss') {
      f.current(false);
      assert.equal(f.owner.poll(), false);
    }
    assert.equal(f.audio.stopped, 1, mode);
    assert.equal(f.audio.listeners.size, 0, mode);
    await f.owner.stop();
    assert.equal(f.calls.closed, mode === 'beforePermission' ? 0 : 1, mode);
    await f.owner.close();
  }
});

test('microphone permission: cancelled activation cannot enable its successor; unresolved activation blocks another prompt', async () => {
  const f = fixture();
  const started = f.owner.start(1n);
  f.permission.resolve(f.stream);
  await tick();
  assert.equal(await f.owner.stop(), true);
  assert.equal(await started, false);
  assert.equal(f.owner.stats.activationPending, true);
  assert.equal(await f.owner.start(1n), false);
  f.activation.resolve(true);
  await tick();
  assert.equal(f.owner.stats.activationPending, false);
  assert.equal(f.owner.stats.active, false);
  assert.equal(f.owner.stats.granted, 0);
  const freshAudio = track(),
    freshStream = { getTracks: () => [freshAudio] },
    freshReady = deferred();
  f.api.request = () => Promise.resolve(freshStream);
  f.backend.begin = () => ({
    ready: freshReady.promise,
    current: () => true,
    close: () => Promise.resolve(),
  });
  const fresh = f.owner.start(2n);
  await tick();
  freshReady.resolve(true);
  assert.equal(await fresh, true);
  assert.equal(f.owner.stats.granted, 1);
  await f.owner.close();
  assert.equal(freshAudio.stopped, 1);
  assert.equal(f.audio.stopped, 1);
});

test('microphone permission: retirement joins duplicate stop, bounds hung/failed cleanup and never reacquires after failure', async () => {
  for (const mode of ['held', 'timeout', 'throw', 'reject', 'unknown']) {
    const f = fixture(1000, 20),
      closing = deferred();
    f.scope.close = () => {
      ++f.calls.closed;
      if (mode === 'throw') throw new Error('private close details');
      if (mode === 'reject')
        return Promise.reject(new Error('private close details'));
      if (mode === 'unknown') return Promise.resolve(true);
      return closing.promise;
    };
    const started = f.owner.start(1n);
    f.permission.resolve(f.stream);
    await tick();
    f.activation.resolve(true);
    assert.equal(await started, true);
    const stopped = f.owner.stop();
    assert.equal(f.audio.stopped, 1);
    assert.equal(await f.owner.start(1n), false);
    if (mode === 'held') {
      assert.equal(f.owner.stop(), stopped);
      closing.resolve();
    }
    assert.equal(await stopped, mode === 'held', mode);
    assert.equal(f.calls.closed, 1, mode);
    if (mode !== 'held') {
      assert.equal(f.owner.stats.failed, true);
      assert.equal(await f.owner.start(1n), false);
    }
    closing.resolve();
    await tick();
    await f.owner.close();
  }
});

test('microphone permission: invalid activation and authority/track cleanup exceptions latch a payload-free fault', async () => {
  for (const mode of [
    'invalidScope',
    'unknownReady',
    'currentThrow',
    'stopThrow',
    'removeThrow',
  ]) {
    const f = fixture();
    if (mode === 'invalidScope')
      f.backend.begin = () => ({ close: () => Promise.resolve() });
    if (mode === 'currentThrow')
      f.scope.current = () => {
        throw new Error('private grant details');
      };
    if (mode === 'stopThrow')
      f.audio.stop = () => {
        throw new Error('private track details');
      };
    if (mode === 'removeThrow')
      f.audio.removeEventListener = () => {
        throw new Error('private track details');
      };
    const started = f.owner.start(1n);
    f.permission.resolve(f.stream);
    await tick();
    f.activation.resolve(mode === 'unknownReady' ? 'unknown' : true);
    assert.equal(
      await started,
      ['stopThrow', 'removeThrow'].includes(mode),
      mode,
    );
    await f.owner.stop();
    assert.equal(f.owner.stats.failed, true, mode);
    assert.equal(f.owner.stats.faults, 1, mode);
    assert.equal(await f.owner.start(1n), false);
    await f.owner.close();
  }
});

test('microphone permission: reentrant request/begin/current/close cannot overlap prompts or resurrect cancelled scope', async () => {
  for (const mode of ['request', 'begin', 'current', 'close']) {
    const f = fixture(),
      refused = [];
    if (mode === 'request')
      f.api.request = () => {
        void f.owner.stop();
        refused.push(f.owner.start(1n));
        return f.permission.promise;
      };
    if (mode === 'begin')
      f.backend.begin = () => {
        void f.owner.stop();
        refused.push(f.owner.start(1n));
        return f.scope;
      };
    if (mode === 'current')
      f.scope.current = () => {
        void f.owner.stop();
        refused.push(f.owner.start(1n));
        return true;
      };
    if (mode === 'close')
      f.scope.close = () => {
        ++f.calls.closed;
        refused.push(f.owner.start(1n));
        return Promise.resolve();
      };
    const started = f.owner.start(1n);
    f.permission.resolve(f.stream);
    await tick();
    f.activation.resolve(true);
    assert.equal(await started, mode === 'close', mode);
    await f.owner.stop();
    for (const promise of refused) assert.equal(await promise, false, mode);
    assert.equal(f.audio.stopped, 1, mode);
    assert.equal(f.owner.stats.active, false, mode);
    await f.owner.close();
  }
});
