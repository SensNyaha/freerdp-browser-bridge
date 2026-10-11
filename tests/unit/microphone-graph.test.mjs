import test from 'node:test';
import assert from 'node:assert/strict';
import { MicrophoneGraph } from '../../apps/reference-harness/microphone-graph.js';
import { MicrophoneSender } from '../../apps/reference-harness/microphone-sender.js';
import { parseMicrophoneRecord } from '../../apps/reference-harness/microphone-wire.js';
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};
async function fixture(retirementMs = 1000) {
  let now = 0,
    authorized = true;
  const wire = [],
    posted = [],
    calls = {
      faults: 0,
      contextClosed: 0,
      retired: 0,
      sourceConnected: 0,
      sourceDisconnected: 0,
      nodeConnected: 0,
      nodeDisconnected: 0,
      portClosed: 0,
    },
    listeners = new Map();
  const context = {
    sampleRate: 48000,
    state: 'running',
    destination: {},
    audioWorklet: { addModule: () => Promise.resolve() },
    addEventListener: (type, value) => listeners.set(type, value),
    removeEventListener: (type) => listeners.delete(type),
    createMediaStreamSource: () => ({
      connect: () => ++calls.sourceConnected,
      disconnect: () => ++calls.sourceDisconnected,
    }),
    close: () => {
      ++calls.contextClosed;
      return Promise.resolve();
    },
  };
  const node = {
    port: {
      postMessage: (value) => posted.push(value),
      close: () => ++calls.portClosed,
      onmessage: undefined,
    },
    addEventListener: (type, value) => listeners.set(type, value),
    removeEventListener: (type) => listeners.delete(type),
    connect: () => ++calls.nodeConnected,
    disconnect: () => ++calls.nodeDisconnected,
  };
  const sender = new MicrophoneSender({
    send: (record) => {
      wire.push(record.slice(0));
      return true;
    },
    revoke: () => {},
  });
  sender.status(
    {
      granted: true,
      retiring: false,
      source: {
        enabled: true,
        availability: 'ready',
        revision: '1',
        epoch: '1',
        timestampUs: '0',
      },
    },
    0,
  );
  const token = sender.authorize(0);
  const backend = {
    authorized: () => authorized,
    retire: () => {
      ++calls.retired;
      return Promise.resolve();
    },
    failed: () => ++calls.faults,
  };
  const graph = new MicrophoneGraph(context, {}, 1n, token, sender, backend, {
    now: () => now,
    retirementMs,
    createNode: () => node,
  });
  await tick();
  const emit = (data) => node.port.onmessage?.({ data });
  return {
    graph,
    sender,
    node,
    context,
    backend,
    token,
    wire,
    posted,
    calls,
    listeners,
    emit,
    now: (value) => {
      now = value;
    },
    authorized: (value) => {
      authorized = value;
    },
    ready: async () => {
      emit({ type: 'ready', accepted: true });
      assert.equal(await graph.ready, true);
    },
    packet: (id = 1, timestampUs = 0n) => ({
      type: 'packet',
      id,
      epoch: 1n,
      timestampUs,
      pcm: new Uint8Array(3840).fill(id).buffer,
    }),
  };
}

test('microphone graph: Worklet ready precedes stream connection; port credit copies/wipes PCM and is independent of network ACK', async () => {
  const f = await fixture();
  assert.equal(f.calls.sourceConnected, 0);
  await f.ready();
  assert.equal(f.calls.sourceConnected, 1);
  const first = f.packet();
  f.now(10);
  f.emit(first);
  assert.ok(new Uint8Array(first.pcm).every((value) => value === 0));
  assert.equal(parseMicrophoneRecord(f.wire[0]).pcm[0], 1);
  assert.deepEqual(f.posted[0], { type: 'ack', id: 1 });
  f.now(20);
  f.emit(f.packet(2, 20000n));
  f.now(30);
  f.emit(f.packet(3, 40000n));
  assert.equal(f.wire.length, 1);
  assert.equal(f.sender.stats.pendingBytes, 3840);
  assert.equal(f.posted.filter((value) => value.type === 'ack').length, 3);
  f.sender.acknowledge({ sequence: 1, epoch: '1', status: 'accepted' }, 30);
  assert.equal(parseMicrophoneRecord(f.wire[1]).pcm[0], 3);
  assert.equal(parseMicrophoneRecord(f.wire[1]).discontinuity, true);
  f.graph.stats.lastPacketId = 99;
  assert.equal(f.graph.stats.lastPacketId, 3);
  await f.graph.close();
  assert.equal(f.listeners.size, 0);
  assert.equal(f.calls.contextClosed, 1);
  assert.equal(f.calls.retired, 1);
  assert.equal(f.calls.portClosed, 1);
  assert.equal(f.sender.stats.pendingBytes, 0);
});

test('microphone graph: source/grant loss, context/processor loss and stalled port fail closed and notify track owner once', async () => {
  for (const mode of [
    'authority',
    'context',
    'processor',
    'portDeadline',
    'clock',
  ]) {
    const f = await fixture();
    await f.ready();
    if (mode === 'authority') {
      f.authorized(false);
      f.graph.poll();
    }
    if (mode === 'context') {
      f.context.state = 'suspended';
      f.listeners.get('statechange')();
    }
    if (mode === 'processor') f.listeners.get('processorerror')();
    if (mode === 'portDeadline') {
      f.now(1999);
      assert.equal(f.graph.poll(), true);
      f.now(2000);
      f.graph.poll();
    }
    if (mode === 'clock') {
      f.now(20);
      f.graph.poll();
      f.now(19);
      f.graph.poll();
    }
    await f.graph.close();
    assert.equal(f.graph.stats.closed, true, mode);
    assert.equal(f.calls.faults, 1, mode);
    assert.equal(f.calls.retired, 1, mode);
    assert.equal(f.graph.poll(), false, mode);
  }
});

test('microphone graph: malformed/replayed port records never submit or return credit; duplicate ready also closes', async () => {
  for (const bad of [
    null,
    { type: 'fault' },
    { type: 'result', id: 1, accepted: true },
    { type: 'ready', accepted: true },
    { type: 'packet', id: 0 },
    {
      type: 'packet',
      id: 1,
      epoch: 1n,
      timestampUs: 0n,
      pcm: new ArrayBuffer(3841),
    },
  ]) {
    const f = await fixture();
    await f.ready();
    f.emit(bad);
    await f.graph.close();
    assert.equal(f.wire.length, 0);
    assert.equal(f.posted.filter((value) => value.type === 'ack').length, 0);
    assert.equal(f.calls.faults, 1);
  }
  const f = await fixture();
  await f.ready();
  f.emit(f.packet());
  f.emit(f.packet());
  await f.graph.close();
  assert.equal(f.wire.length, 1);
  assert.equal(f.posted.filter((value) => value.type === 'ack').length, 1);
});

test('microphone graph: main-thread sender deadline closes even when Worklet keeps supplying fresh packets', async () => {
  const f = await fixture();
  await f.ready();
  f.emit(f.packet());
  f.now(1900);
  f.emit(f.packet(2, 20000n));
  f.now(2000);
  f.graph.poll();
  await f.graph.close();
  assert.equal(f.sender.stats.closed, true);
  assert.equal(f.calls.faults, 1);
  assert.equal(f.wire.length, 1);
});

test('microphone graph: disposal joins context, native retirement and initialization; hung/error cleanup rejects a sanitized finite result', async () => {
  for (const mode of ['held', 'timeout', 'throw', 'unknown']) {
    const f = await fixture(20),
      held = deferred();
    await f.ready();
    f.backend.retire = () => {
      ++f.calls.retired;
      if (mode === 'throw') throw new Error('private retirement details');
      if (mode === 'unknown') return Promise.resolve(true);
      return held.promise;
    };
    const closing = f.graph.close();
    assert.equal(f.graph.close(), closing);
    assert.equal(f.node.port.onmessage, null);
    if (mode === 'held') {
      held.resolve();
      await closing;
    } else
      await assert.rejects(closing, /^Error: Microphone graph cleanup failed$/);
    held.resolve();
    await tick();
    assert.equal(f.calls.retired, 1, mode);
  }
});

test('microphone graph: cancelled module load cannot create late nodes, and reentrant capture cleanup cannot return stale port credit', async () => {
  const f = await fixture();
  await f.ready();
  f.sender.offer = () => {
    void f.graph.close();
    return false;
  };
  const samples = f.packet();
  f.emit(samples);
  await f.graph.close();
  assert.ok(new Uint8Array(samples.pcm).every((value) => value === 0));
  assert.equal(f.posted.filter((value) => value.type === 'ack').length, 0);
  assert.equal(f.calls.contextClosed, 1);
  const held = deferred(),
    context = {
      ...f.context,
      state: 'running',
      audioWorklet: { addModule: () => held.promise },
    };
  let nodes = 0;
  const graph = new MicrophoneGraph(
    context,
    {},
    1n,
    f.token,
    f.sender,
    {
      authorized: () => true,
      retire: () => Promise.resolve(),
      failed: () => {},
    },
    {
      createNode: () => {
        ++nodes;
        return f.node;
      },
      now: () => 0,
    },
  );
  const closing = graph.close();
  assert.equal(await graph.ready, false);
  held.resolve();
  await closing;
  assert.equal(nodes, 0);
  for (const phase of ['node', 'source']) {
    const lateCalls = { disconnected: 0, portClosed: 0, connected: 0 };
    const lateSource = {
      connect: () => ++lateCalls.connected,
      disconnect: () => ++lateCalls.disconnected,
    };
    const lateNode = {
      ...f.node,
      port: {
        ...f.node.port,
        onmessage: undefined,
        close: () => ++lateCalls.portClosed,
      },
      disconnect: () => ++lateCalls.disconnected,
    };
    let lateGraph;
    const lateContext = {
      ...f.context,
      state: 'running',
      createMediaStreamSource: () => {
        void lateGraph.close();
        return lateSource;
      },
    };
    lateGraph = new MicrophoneGraph(
      lateContext,
      {},
      1n,
      f.token,
      f.sender,
      {
        authorized: () => true,
        retire: () => Promise.resolve(),
        failed: () => {},
      },
      {
        now: () => 0,
        createNode: () => {
          if (phase === 'node') void lateGraph.close();
          return lateNode;
        },
      },
    );
    await tick();
    if (phase === 'source')
      lateNode.port.onmessage({ data: { type: 'ready', accepted: true } });
    assert.equal(await lateGraph.ready, false);
    await lateGraph.close();
    assert.equal(lateCalls.connected, 0, phase);
    assert.equal(lateCalls.disconnected, phase === 'node' ? 1 : 2, phase);
    assert.equal(lateCalls.portClosed, 1, phase);
  }
});
