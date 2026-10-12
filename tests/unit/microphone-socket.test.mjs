import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { installMicrophoneMedia } from '../../apps/bridge-api/dist/microphone.js';
import { encodeMicrophoneRecord } from '../../packages/protocol/dist/index.js';
import { eventually } from '../fixtures/session-worker.mjs';
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const wire = (sequence = 1, epoch = 1n) =>
  encodeMicrophoneRecord(
    { epoch, timestampUs: 0n, discontinuity: true, pcm: Buffer.alloc(3840) },
    sequence,
  );
const command = (type = 'start', requestSeq = 1) => ({
  v: 1,
  type: 'microphone.' + type,
  data: { requestSeq },
});
function fixture(deadlines, metrics) {
  const ws = new EventEmitter();
  ws.readyState = 1;
  ws.bufferedAmount = 0;
  ws.terminate = () => {
    ws.readyState = 3;
    ws.emit('close');
  };
  let listener;
  let snapshot = {
    granted: false,
    retiring: false,
    state: {
      enabled: true,
      availability: 'ready',
      revision: 1n,
      epoch: 1n,
      timestampUs: 0n,
    },
  };
  const calls = { samples: 0, stop: 0, off: 0 },
    outputs = [],
    failures = [];
  const publish = (patch = {}, statePatch) => {
    snapshot = {
      ...snapshot,
      ...patch,
      ...(statePatch
        ? {
            state: {
              ...snapshot.state,
              revision: snapshot.state.revision + 1n,
              timestampUs: snapshot.state.timestampUs + 1n,
              ...statePatch,
            },
          }
        : {}),
    };
    listener?.(snapshot);
  };
  const lease = {
    microphoneCodec: 'pcm',
    get microphoneSnapshot() {
      return snapshot;
    },
    onMicrophone(fn) {
      listener = fn;
      return () => {
        ++calls.off;
        listener = undefined;
      };
    },
    startMicrophone() {
      publish({ granted: true, retiring: false });
      return true;
    },
    async stopMicrophone() {
      ++calls.stop;
      publish({ granted: false, retiring: false });
      return true;
    },
    async sendMicrophone(bytes) {
      ++calls.samples;
      return { sequence: bytes.readUInt32BE(12), result: 'accepted' };
    },
  };
  const send = (type, data) => outputs.push({ type, data });
  const create = () =>
    installMicrophoneMedia(
      ws,
      lease,
      send,
      (code) => failures.push(code),
      deadlines,
      metrics,
    );
  return {
    ws,
    lease,
    calls,
    outputs,
    failures,
    publish,
    create,
    get snapshot() {
      return snapshot;
    },
  };
}

function metricProbe() {
  const values = {
    packets: 0,
    bytes: 0,
    retirements: 0,
    failures: [],
    decisions: [],
    observations: [],
  };
  return {
    values,
    metrics: {
      received() {},
      decision(operation, result) {
        values.decisions.push([operation, result]);
      },
      observe(operation) {
        values.observations.push(operation);
      },
      packetStorage(change, bytes) {
        values.packets += change;
        values.bytes += bytes;
      },
      retirement(change) {
        values.retirements += change;
      },
      failure(reason) {
        values.failures.push(reason);
      },
    },
  };
}

test('microphone metrics: deadline retirement retains unfinished packet/stop ownership until real promise settlement', async () => {
  for (const operation of ['packet', 'stop']) {
    const probe = metricProbe(),
      pending = deferred(),
      stopped = deferred();
    const f = fixture({ packetMs: 20, stopMs: 20 }, probe.metrics);
    f.lease.sendMicrophone = () => pending.promise;
    f.lease.stopMicrophone = () => stopped.promise;
    const route = f.create();
    route.start();
    route.command(command());
    if (operation === 'packet') route.receive(wire());
    else route.command(command('stop', 2));
    await eventually(() => f.failures.length === 1);
    assert.deepEqual(probe.values.failures, [
      operation === 'packet' ? 'packet_deadline' : 'stop_deadline',
    ]);
    assert.equal(probe.values.packets, operation === 'packet' ? 1 : 0);
    assert.equal(probe.values.bytes, operation === 'packet' ? 3876 : 0);
    assert.equal(probe.values.retirements, operation === 'stop' ? 1 : 0);
    pending.resolve({ sequence: 1, result: 'accepted' });
    stopped.resolve(true);
    await tick();
    assert.equal(probe.values.packets, 0);
    assert.equal(probe.values.bytes, 0);
    assert.equal(probe.values.retirements, 0);
    assert.deepEqual(probe.values.observations, []);
    assert.deepEqual(probe.values.decisions, [['start', 'started']]);
    route.close();
    assert.equal(probe.values.failures.length, 1);
  }
});

test('microphone metrics: synchronous backend failure and malformed completion release gauges without success timings', async () => {
  for (const operation of ['packet', 'stop', 'invalid']) {
    const probe = metricProbe(),
      f = fixture(undefined, probe.metrics),
      route = f.create();
    route.start();
    route.command(command());
    if (operation === 'stop') {
      f.lease.stopMicrophone = () => {
        throw new Error('Private backend detail');
      };
      route.command(command('stop', 2));
    } else {
      f.lease.sendMicrophone = () => {
        if (operation === 'packet') throw new Error('Private backend detail');
        return Promise.resolve({
          sequence: 1,
          result: 'Private invalid result',
        });
      };
      route.receive(wire());
    }
    await tick();
    assert.equal(probe.values.packets, 0);
    assert.equal(probe.values.bytes, 0);
    assert.equal(probe.values.retirements, 0);
    assert.deepEqual(probe.values.observations, []);
    assert.deepEqual(probe.values.failures, [
      operation === 'packet'
        ? 'admission'
        : operation === 'stop'
          ? 'retirement'
          : 'protocol',
    ]);
    assert.equal(f.failures.length, 1);
    route.close();
  }
});

test('microphone socket: preparation has no automatic grant; explicit start, bounded packet ACK and separate control result', async () => {
  const f = fixture(),
    route = f.create();
  assert.deepEqual(f.outputs, []);
  route.start();
  assert.equal(f.outputs.at(-1).type, 'microphone.state');
  assert.equal(f.outputs.at(-1).data.source.epoch, '1');
  route.receive(wire());
  assert.equal(f.outputs.at(-1).data.status, 'unavailable');
  assert.equal(f.calls.samples, 0);
  assert.equal(route.command({ type: 'media.ack' }), false);
  route.command(command());
  assert.deepEqual(f.outputs.at(-1), {
    type: 'microphone.result',
    data: { requestSeq: 1, status: 'started' },
  });
  route.receive(wire(2));
  await tick();
  assert.deepEqual(f.outputs.at(-1), {
    type: 'microphone.ack',
    data: { sequence: 2, epoch: '1', status: 'accepted' },
  });
  assert.equal(f.calls.samples, 1);
  route.close();
  route.close();
  assert.equal(f.calls.off, 1);
  assert.equal(f.calls.stop, 1);
  assert.equal(f.ws.listenerCount('close'), 0);
});

test('microphone socket: one sample flight consumes busy attempts and current source authority overrides late accepted ACK', async () => {
  for (const change of ['epoch', 'waiting', 'revoke']) {
    const f = fixture(),
      pending = deferred();
    f.lease.sendMicrophone = () => {
      ++f.calls.samples;
      return pending.promise;
    };
    const route = f.create();
    route.start();
    route.command(command());
    route.receive(wire());
    route.receive(wire(2));
    assert.equal(f.outputs.at(-1).data.status, 'busy');
    assert.equal(f.calls.samples, 1);
    if (change === 'epoch') f.publish({}, { epoch: 2n });
    if (change === 'waiting') f.publish({}, { availability: 'waiting' });
    if (change === 'revoke') f.publish({ granted: false, retiring: true });
    pending.resolve({ sequence: 1, result: 'accepted' });
    await tick();
    assert.equal(
      f.outputs.at(-1).data.status,
      change === 'epoch' ? 'stale' : 'unavailable',
    );
    route.receive(wire(3));
    assert.equal(
      f.outputs.at(-1).data.status,
      change === 'epoch' ? 'stale' : 'unavailable',
    );
    assert.equal(f.calls.samples, 1);
    route.close();
  }
});

test('microphone socket: stop revokes immediately, stays one-flight and waits for retirement before replying', async () => {
  const f = fixture(),
    stopped = deferred(),
    packet = deferred();
  f.lease.stopMicrophone = () => {
    ++f.calls.stop;
    f.publish({ granted: false, retiring: true });
    return stopped.promise;
  };
  f.lease.sendMicrophone = () => packet.promise;
  const route = f.create();
  route.start();
  route.command(command());
  route.receive(wire());
  route.command(command('stop', 2));
  assert.equal(f.outputs.at(-1).data.granted, false);
  route.command(command('start', 3));
  assert.deepEqual(f.outputs.at(-1).data, { requestSeq: 3, status: 'busy' });
  route.command(command('stop', 4));
  assert.equal(f.calls.stop, 1);
  packet.resolve({ sequence: 1, result: 'accepted' });
  await tick();
  assert.equal(f.outputs.at(-1).data.status, 'unavailable');
  f.publish({ retiring: false }, { epoch: 2n });
  stopped.resolve(true);
  await tick();
  assert.deepEqual(f.outputs.at(-1).data, { requestSeq: 2, status: 'stopped' });
  route.command(command('start', 5));
  assert.equal(f.outputs.at(-1).data.status, 'started');
  route.close();
});

test('microphone socket: exact body, sequence/control replay and unknown backend completions fail without payload disclosure', async () => {
  for (const mode of [
    'short',
    'replay',
    'command',
    'unknown',
    'mismatch',
    'throw',
    'before-start',
  ]) {
    const f = fixture(),
      route = f.create();
    if (mode !== 'before-start') route.start();
    if (['unknown', 'mismatch', 'throw'].includes(mode)) {
      route.command(command());
      f.lease.sendMicrophone = async () => {
        if (mode === 'throw') throw new Error('private diagnostic');
        return {
          sequence: mode === 'mismatch' ? 99 : 1,
          result: mode === 'unknown' ? 'unknown' : 'accepted',
        };
      };
    }
    route.receive(mode === 'short' ? Buffer.alloc(2) : wire());
    if (mode === 'replay') route.receive(wire());
    if (mode === 'command') {
      route.command(command());
      route.command(command());
    }
    await tick();
    assert.equal(f.failures.length, 1, mode);
    assert.equal(JSON.stringify(f.failures).includes('private'), false);
    assert.equal(f.calls.off, 1);
    route.close();
  }
});

test('microphone socket: packet/stop deadlines retire once; late completion and source callbacks cannot reopen output', async () => {
  for (const kind of ['packet', 'stop']) {
    const deadlines = { packetMs: 25, stopMs: 25 },
      f = fixture(deadlines),
      pending = deferred();
    if (kind === 'packet') f.lease.sendMicrophone = () => pending.promise;
    else
      f.lease.stopMicrophone = () => {
        ++f.calls.stop;
        return pending.promise;
      };
    const route = f.create();
    route.start();
    route.command(command());
    deadlines.packetMs = 2000;
    deadlines.stopMs = 4000; // Validated configuration is owned.
    if (kind === 'packet') route.receive(wire());
    else route.command(command('stop', 2));
    await eventually(() => f.failures.length === 1);
    assert.equal(
      f.failures[0],
      kind === 'packet'
        ? 'MICROPHONE_PACKET_DEADLINE'
        : 'MICROPHONE_STOP_DEADLINE',
    );
    const count = f.outputs.length;
    pending.resolve(
      kind === 'packet' ? { sequence: 1, result: 'accepted' } : true,
    );
    f.publish({}, { epoch: 2n });
    await tick();
    route.start();
    route.receive(wire(2));
    route.close();
    assert.equal(f.outputs.length, count);
    assert.equal(f.calls.off, 1);
  }
});

test('microphone socket: status mutation, unrequested grant and receiver/stop faults close admission', async () => {
  for (const mode of ['source', 'grant', 'stop', 'send', 'backlog']) {
    const f = fixture(),
      route =
        mode === 'send'
          ? installMicrophoneMedia(
              f.ws,
              f.lease,
              () => {
                throw new Error('private transport diagnostic');
              },
              (code) => f.failures.push(code),
            )
          : f.create();
    if (mode === 'backlog') f.ws.bufferedAmount = 65536;
    route.start();
    if (mode === 'source')
      f.publish({}, { revision: 1n, timestampUs: 0n, epoch: 2n });
    if (mode === 'grant') f.publish({ granted: true });
    if (mode === 'stop') {
      f.lease.stopMicrophone = async () => false;
      route.command(command('stop'));
      await tick();
    }
    assert.equal(f.failures.length, 1, mode);
    assert.equal(JSON.stringify(f.failures).includes('private'), false);
    route.close();
    assert.equal(f.calls.off, 1);
  }
});

test('microphone socket: socket close, partial registration and invalid deadlines retire owned notification handles', () => {
  const f = fixture(),
    route = f.create();
  route.start();
  f.ws.readyState = 3;
  f.ws.emit('close');
  route.close();
  assert.equal(f.calls.off, 1);
  assert.equal(f.calls.stop, 1);
  assert.equal(f.ws.listenerCount('close'), 0);
  assert.throws(() => f.create(), { code: 'MEDIA_FAILED' });
  for (const deadlines of [
    { packetMs: 19, stopMs: 25 },
    { packetMs: 25, stopMs: 4001 },
  ])
    assert.throws(() => fixture(deadlines).create(), { code: 'MEDIA_FAILED' });
  const partial = fixture();
  partial.lease.onMicrophone = (listener) => {
    listener({ ...partial.snapshot, granted: true }); // Invalid synchronous delivery before registration returns.
    return () => {
      ++partial.calls.off;
    };
  };
  assert.throws(() => partial.create(), { code: 'MEDIA_FAILED' });
  assert.equal(partial.calls.off, 1);
  assert.equal(partial.calls.stop, 1);
});
