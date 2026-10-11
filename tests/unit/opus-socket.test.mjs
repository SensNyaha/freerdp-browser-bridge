import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  installOpusMedia,
  installPcmMedia,
} from '../../apps/bridge-api/dist/audio.js';

const state = (revision = 1n, availability = 'ready', epoch = 1n) => ({
  type: 'state',
  state: {
    enabled: true,
    availability,
    revision,
    epoch,
    timestampUs: revision,
  },
});
const config = (epoch = 1n) => ({
  type: 'config',
  config: {
    codec: 'opus',
    epoch,
    sampleRate: 48000,
    channels: 2,
    packetFrames: 960,
    lookaheadFrames: 312,
  },
});
// TOC/framing fixture only; no entropy decode or remote/audible acceptance.
const packet = (time = 0n, discontinuity = true, epoch = 1n) => ({
  type: 'packet',
  packet: {
    epoch,
    timestampUs: time,
    frames: 960,
    silenceFrames: 0,
    discontinuity,
    encoded: Buffer.from([0xfc, 0xff, 0xfe]),
  },
});
const settle = () => new Promise((done) => setImmediate(done));
function fixture(ready = true) {
  const ws = new EventEmitter();
  Object.assign(ws, { readyState: 1, bufferedAmount: 0, records: [] });
  ws.send = (record, _options, done) => {
    ws.records.push(Buffer.from(record));
    done();
  };
  let listener,
    unsubscribed = 0;
  const calls = [],
    failures = [];
  const lease = {
    audio: {
      codec: 'opus',
      state: state(1n, ready ? 'ready' : 'waiting').state,
      ...(ready ? { config: config().config } : {}),
    },
    audioFailed: false,
    onAudio(fn) {
      listener = fn;
      return () => {
        listener = undefined;
        unsubscribed++;
      };
    },
    async resetAudio(epoch) {
      calls.push(epoch);
      return 'scheduled';
    },
  };
  return {
    ws,
    lease,
    calls,
    failures,
    emit(event) {
      listener?.(event);
    },
    get unsubscribed() {
      return unsubscribed;
    },
    install(metrics) {
      return installOpusMedia(
        ws,
        lease,
        (code) => failures.push(code),
        metrics,
      );
    },
  };
}

test('Opus socket: ready-source attachment schedules one native reset and preserves old credit until new epoch media', async (t) => {
  t.mock.method(performance, 'now', () => 0);
  const f = fixture(),
    route = f.install();
  try {
    route.start();
    await settle();
    assert.deepEqual(f.calls, [1n]);
    assert.equal(f.ws.records.length, 1);
    assert.equal(f.ws.records[0][5], 9);
    f.emit(packet(0n)); // Old native generation must never reach the socket.
    f.emit(state(2n, 'waiting', 2n));
    f.emit(state(3n, 'ready', 2n));
    f.emit(config(2n));
    const fresh = packet(20000n, true, 2n);
    f.emit(fresh);
    fresh.packet.encoded.fill(0);
    assert.equal(f.ws.records.length, 1);
    route.acknowledge(0);
    route.acknowledge(1);
    route.acknowledge(2);
    assert.deepEqual(
      f.ws.records.map((r) => r[5]),
      [9, 9, 3, 4],
    );
    assert.deepEqual(
      f.ws.records.map((r) => r.readUInt32BE(12)),
      [0, 1, 2, 3],
    );
    assert.deepEqual(
      f.ws.records[3].subarray(28),
      Buffer.from([0xfc, 0xff, 0xfe]),
    );
    assert.equal(f.ws.records[3].readBigUInt64BE(16), 20000n);
    assert.equal(f.ws.records[3].readUInt16BE(6), 2);
    route.acknowledge(3);
    assert.deepEqual(f.failures, []);
    assert.deepEqual(f.calls, [1n]);
  } finally {
    route.close();
  }
  assert.equal(f.unsubscribed, 1);
});

test('Opus socket: overflow discards prediction and requests native epoch without rewriting transmitted bytes or ACK', async (t) => {
  t.mock.method(performance, 'now', () => 0);
  const f = fixture(false),
    route = f.install();
  try {
    route.start();
    route.acknowledge(0);
    f.emit(state(2n));
    f.emit(config());
    f.emit(packet());
    route.acknowledge(1);
    route.acknowledge(2);
    assert.equal(f.ws.records[3][5], 4);
    const transmitted = Buffer.from(f.ws.records[3]);
    f.emit(packet(20000n, false));
    f.emit(packet(40000n, false));
    await settle();
    assert.deepEqual(f.calls, [1n]);
    f.emit(packet(60000n, false));
    f.emit(state(3n, 'waiting', 2n));
    f.emit(state(4n, 'ready', 2n));
    f.emit(config(2n));
    f.emit(packet(80000n, true, 2n));
    assert.deepEqual(f.ws.records[3], transmitted);
    route.acknowledge(3);
    route.acknowledge(4);
    route.acknowledge(5);
    route.acknowledge(6);
    assert.equal(f.ws.records[6].readBigUInt64BE(16), 80000n);
    assert.deepEqual(f.failures, []);
  } finally {
    route.close();
  }
});

test('Opus socket: reset refuses are retried at bounded intervals and scheduled completion grants no invented media', async (t) => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const f = fixture(),
    replies = ['busy', 'stale', 'unavailable', 'scheduled'];
  f.lease.resetAudio = async (epoch) => {
    f.calls.push(epoch);
    return replies.shift();
  };
  const route = f.install();
  try {
    route.start();
    await settle();
    route.acknowledge(0);
    now = 99;
    route.canSendVideo();
    await settle();
    assert.equal(f.calls.length, 1);
    for (now of [100, 200, 300]) {
      route.canSendVideo();
      await settle();
    }
    assert.equal(f.calls.length, 4);
    now = 1000;
    route.canSendVideo();
    await settle();
    assert.equal(f.calls.length, 4);
    assert.equal(f.ws.records.length, 1);
    now = 2000;
    route.canSendVideo();
    assert.deepEqual(f.failures, ['MEDIA_FAILED']);
    assert.equal(f.unsubscribed, 1);
  } finally {
    route.close();
  }
});

test('Opus socket: one unresolved reset stays bounded and late completion after retirement grants no authority', async (t) => {
  let now = 0,
    resolve;
  t.mock.method(performance, 'now', () => now);
  const f = fixture();
  f.lease.resetAudio = (epoch) => {
    f.calls.push(epoch);
    return new Promise((done) => {
      resolve = done;
    });
  };
  const route = f.install();
  try {
    route.start();
    await settle();
    route.acknowledge(0);
    for (now of [100, 500, 1999]) {
      route.canSendVideo();
      await settle();
    }
    assert.equal(f.calls.length, 1);
    now = 2000;
    route.canSendVideo();
    assert.deepEqual(f.failures, ['MEDIA_FAILED']);
    resolve('scheduled');
    await settle();
    assert.deepEqual(f.failures, ['MEDIA_FAILED']);
    assert.equal(f.ws.records.length, 1);
    assert.equal(f.unsubscribed, 1);
  } finally {
    route.close();
    resolve?.('scheduled');
  }
});

test('Opus socket: close before deferred dispatch cancels reset; completion faults are sanitized and retire once', async (t) => {
  t.mock.method(performance, 'now', () => 0);
  const cancelled = fixture(),
    closed = cancelled.install();
  closed.start();
  closed.close();
  await settle();
  assert.deepEqual(cancelled.calls, []);
  assert.equal(cancelled.unsubscribed, 1);
  for (const result of ['invalid', 'throw']) {
    const f = fixture();
    f.lease.resetAudio = async () => {
      if (result === 'throw') throw new Error('secret-reset-sentinel');
      return 'unknown';
    };
    const route = f.install();
    try {
      route.start();
      await settle();
      assert.deepEqual(f.failures, ['MEDIA_FAILED']);
      assert.equal(f.unsubscribed, 1);
      route.close();
      await settle();
      assert.equal(f.failures.length, 1);
    } finally {
      route.close();
    }
  }
});

test('Opus socket: waiting source makes no reset, wrong profiles and duplicate ACK fail only the consumer', async (t) => {
  t.mock.method(performance, 'now', () => 0);
  const f = fixture(false),
    route = f.install();
  try {
    route.start();
    await settle();
    route.acknowledge(0);
    assert.deepEqual(f.calls, []);
    assert.throws(() => installPcmMedia(f.ws, f.lease, () => {}), {
      code: 'MEDIA_NOT_IMPLEMENTED',
    });
    f.emit({ type: 'config', config: { ...config().config, codec: 'pcm' } });
    assert.deepEqual(f.failures, ['MEDIA_FAILED']);
  } finally {
    route.close();
  }
  const duplicate = fixture(false),
    other = duplicate.install();
  try {
    other.start();
    other.acknowledge(0);
    other.acknowledge(0);
    assert.deepEqual(duplicate.failures, ['MEDIA_PROTOCOL_ERROR']);
    assert.equal(duplicate.unsubscribed, 1);
  } finally {
    other.close();
  }
});

test('Opus socket: fresh waiting epoch ends recovery and balanced bounded storage retires on socket close', async (t) => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const f = fixture(),
    held = { credit: 0, pending: 0, flight: 0 };
  const route = f.install({
    storage(credit, pending, flight) {
      held.credit += credit;
      held.pending += pending;
      held.flight += flight;
    },
    queued() {},
    discarded() {},
    observe() {},
    failure() {
      assert.fail();
    },
  });
  try {
    route.start();
    await settle();
    route.acknowledge(0);
    f.emit(state(2n, 'waiting', 2n));
    route.acknowledge(1);
    now = 5000;
    route.canSendVideo();
    await settle();
    assert.deepEqual(f.calls, [1n]);
    assert.deepEqual(f.failures, []);
    assert.deepEqual(held, { credit: 0, pending: 0, flight: 0 });
    f.emit(state(3n, 'ready', 2n));
    f.emit(config(2n));
    f.emit(packet(20000n, true, 2n));
    assert.equal(held.credit, 1);
    assert.equal(held.pending, 3);
    f.ws.emit('close');
    assert.deepEqual(held, { credit: 0, pending: 0, flight: 0 });
    assert.equal(f.unsubscribed, 1);
  } finally {
    route.close();
  }
});
