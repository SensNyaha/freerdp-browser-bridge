import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ViewerSoak,
  processResidentReceipt,
  mediaCredit,
  workerResidentLimitBytes,
} from '../../scripts/viewer-soak.mjs';

const view = (values = {}) => ({
  closed: false,
  frames: 4,
  bytes: 1000,
  width: 1920,
  height: 1080,
  codec: 'h264',
  queuedFrames: 0,
  queuedBytes: 0,
  decoderQueueSize: 0,
  mediaBufferedBytes: 0,
  decodeP95Ms: 5,
  ...values,
});

test('soak Windows memory parser: versioned scalar metadata, bounds and no extra fields', () => {
  assert.equal(
    processResidentReceipt('{"v":1,"bytes":12345,"error":0}\n'),
    12345,
  );
  for (const text of [
    'not JSON',
    '[]',
    'null',
    '{"v":2,"bytes":12345,"error":0}',
    '{"v":1,"bytes":0,"error":0}',
    '{"v":1,"bytes":12345,"error":5}',
    '{"v":1,"bytes":12345,"error":0,"pid":123}',
    '{"v":1,"bytes":9007199254740992,"error":0}',
    'x'.repeat(129),
  ])
    assert.throws(
      () => processResidentReceipt(text),
      /LAB_PROCESS_SAMPLE_INVALID/,
    );
});

test('soak credit parser: exact codec and one bounded credit series; counters are not gauges', () => {
  const metrics =
    'bridge_media_frames_queued_total{codec="h264"} 1234\n' +
    'bridge_media_frames_in_flight{codec="h264"} 1\n' +
    'bridge_media_frames_in_flight{codec="jpeg"} 0\n';
  assert.equal(mediaCredit(metrics, 'h264'), 1);
  assert.equal(mediaCredit(metrics, 'jpeg'), 0);
  for (const text of [
    '',
    metrics + 'bridge_media_frames_in_flight{codec="h264"} 0',
    metrics.replace(
      'bridge_media_frames_in_flight{codec="h264"} 1',
      'bridge_media_frames_in_flight{codec="h264"} 2',
    ),
  ])
    assert.throws(() => mediaCredit(text, 'h264'), /LAB_SOAK_CREDIT_INVALID/);
});

test('soak aggregates keep fixed storage, copied snapshots and explicit sampled memory-budget failure', () => {
  const soak = new ViewerSoak();
  soak.observe(0, view(), 12345, 56789, 0);
  const first = soak.snapshot();
  first.maxQueuedFrames = 99;
  for (let i = 1; i < 64; i++)
    soak.observe(
      i * 30000,
      view({ frames: i + 4, bytes: i * 1000 + 1000, queuedFrames: 1 }),
      workerResidentLimitBytes + 1,
      56789,
      1,
    );
  const result = soak.snapshot();
  assert.equal(result.observations, 64);
  assert.equal(result.maxQueuedFrames, 1);
  assert.equal(result.maxWorkerResidentBytes, workerResidentLimitBytes + 1);
  assert.equal(result.workerMemoryBudgetPassed, false);
  assert.equal(first.observations, 1);
  assert.throws(() => soak.observe(64 * 30000, view(), 12345, 56789, 0));
});

test('soak observation rejects lifecycle, backward progress and excessive queues before committing a sample', () => {
  for (const mutation of [
    { closed: true },
    { error: 'failure' },
    { frames: 3 },
    { bytes: 999 },
    { codec: 'jpeg' },
    { width: 1280 },
    { queuedFrames: 6 },
    { queuedBytes: 8 * 1024 * 1024 + 8193 },
    { decoderQueueSize: 2 },
    { mediaBufferedBytes: 16385 },
    { decodeP95Ms: NaN },
  ]) {
    const soak = new ViewerSoak();
    soak.observe(0, view(), 1000, 2000, 0);
    assert.throws(() => soak.observe(30000, view(mutation), 1000, 2000, 0));
    assert.equal(soak.snapshot().observations, 1);
  }
  const soak = new ViewerSoak();
  soak.observe(100, view(), 1000, 2000, 0);
  assert.throws(() => soak.observe(100, view(), 1000, 2000, 0));
  assert.throws(() => soak.observe(101, view(), 1000, 2000, 2));
});
