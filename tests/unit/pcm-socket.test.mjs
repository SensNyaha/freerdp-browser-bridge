import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { installPcmMedia } from '../../apps/bridge-api/dist/audio.js';

function fixture() {
  const ws = new EventEmitter();
  ws.readyState = 1;
  ws.bufferedAmount = 1;
  ws.records = [];
  ws.send = (record, _options, done) => {
    ws.records.push(Buffer.from(record));
    done();
  };
  let listener,
    unsubscribed = 0;
  const lease = {
    audio: {
      state: {
        enabled: true,
        availability: 'waiting',
        revision: 1n,
        epoch: 1n,
        timestampUs: 0n,
      },
    },
    audioFailed: false,
    onAudio(fn) {
      listener = fn;
      return () => {
        listener = undefined;
        unsubscribed++;
      };
    },
  };
  return {
    ws,
    lease,
    get unsubscribed() {
      return unsubscribed;
    },
    emit(event) {
      listener?.(event);
    },
  };
}

test('PCM socket owner: sustained local backlog has an absolute two-second admission deadline and retires subscription', (t) => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const f = fixture(),
    failures = [];
  const route = installPcmMedia(f.ws, f.lease, (code) => failures.push(code));
  try {
    route.start();
    now = 1999;
    f.emit({
      type: 'state',
      state: { ...f.lease.audio.state, revision: 2n, timestampUs: 1n },
    });
    assert.equal(route.canSendVideo(), false);
    assert.deepEqual(failures, []);
    now = 2000;
    assert.equal(route.canSendVideo(), false);
    assert.deepEqual(failures, ['MEDIA_FAILED']);
    assert.equal(f.ws.records.length, 0);
    assert.equal(f.unsubscribed, 1);
    route.close();
    route.acknowledge(0);
    assert.equal(f.unsubscribed, 1);
    assert.deepEqual(failures, ['MEDIA_FAILED']);
  } finally {
    route.close();
  }
});

test('PCM socket owner: writable recovery sends state before video and consumer fault retires metadata/credit', (t) => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const f = fixture(),
    failures = [];
  const route = installPcmMedia(f.ws, f.lease, (code) => failures.push(code));
  try {
    route.start();
    now = 10;
    f.ws.bufferedAmount = 0;
    assert.equal(Boolean(route.canSendVideo()), true);
    assert.equal(f.ws.records.length, 1);
    assert.equal(f.ws.records[0][5], 9);
    assert.equal(f.ws.records[0].readUInt32BE(12), 0);
    route.acknowledge(0);
    f.lease.audioFailed = true;
    assert.equal(route.canSendVideo(), false);
    assert.deepEqual(failures, ['MEDIA_FAILED']);
    assert.equal(f.unsubscribed, 1);
  } finally {
    route.close();
  }
});

test('PCM socket metrics: admission deadline, consumer loss and throwing local write balance storage and count retirement once', (t) => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  for (const mode of ['admission_deadline', 'consumer', 'write']) {
    now = 0;
    const f = fixture(),
      failures = [],
      retired = [],
      observations = [];
    const held = { credit: 0, pending: 0, flight: 0 };
    f.lease.audio.state.availability = 'ready';
    f.lease.audio.config = {
      epoch: 1n,
      codec: 'pcm',
      sampleRate: 48000,
      channels: 2,
      sampleFormat: 's16le',
      packetFrames: 960,
    };
    if (mode !== 'admission_deadline') f.ws.bufferedAmount = 0;
    if (mode === 'write')
      f.ws.send = () => {
        throw new Error('local write');
      };
    const route = installPcmMedia(f.ws, f.lease, () => {}, {
      storage(credit, pending, flight) {
        held.credit += credit;
        held.pending += pending;
        held.flight += flight;
      },
      queued() {},
      observe(stage) {
        observations.push(stage);
      },
      discarded(reason, packets) {
        if (reason === 'retirement') retired.push(packets);
      },
      failure(reason) {
        failures.push(reason);
      },
    });
    try {
      f.emit({
        type: 'packet',
        packet: {
          epoch: 1n,
          timestampUs: 0n,
          frames: 960,
          silenceFrames: 0,
          discontinuity: true,
          pcm: Buffer.alloc(3840),
        },
      });
      assert.equal(held.pending, 3840);
      route.start();
      if (mode === 'admission_deadline') {
        now = 2000;
        route.canSendVideo();
      }
      if (mode === 'consumer') {
        f.lease.audioFailed = true;
        route.canSendVideo();
      }
      assert.deepEqual(failures, [mode === 'write' ? 'consumer' : mode]);
      assert.deepEqual(held, { credit: 0, pending: 0, flight: 0 });
      assert.deepEqual(retired, [1]);
      assert.equal(observations.includes('receiver_credit'), false);
      assert.equal(f.unsubscribed, 1);
      route.close();
      route.close();
      assert.deepEqual(retired, [1]);
      assert.deepEqual(held, { credit: 0, pending: 0, flight: 0 });
    } finally {
      route.close();
    }
  }
});
