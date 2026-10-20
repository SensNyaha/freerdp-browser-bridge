import test from 'node:test';
import assert from 'node:assert/strict';
import { readViewerPipelineObservation } from '../../scripts/viewer-pipeline-observation.mjs';

const sample = {
  rdpChecks: 100,
  paints: 90,
  encodedFrames: 15,
  encodeMeanUs: 20000,
  encodeP95Us: 30000,
  encodeMaxUs: 35000,
  maxReadBatch: 64,
  maxReadBatchUs: 5000,
};

test('preview pipeline evidence projects eight native scalars and owns its snapshot', async () => {
  const reply = { ...sample, private: 'synthetic-private-native-data' };
  let calls = 0;
  const result = await readViewerPipelineObservation({
    async pipelineStats() {
      ++calls;
      return reply;
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, sample);
  reply.encodeMaxUs = 99999;
  assert.equal(result.encodeMaxUs, sample.encodeMaxUs);
  assert.ok(!JSON.stringify(result).includes('private'));
});

test('preview pipeline unavailable errors remain absent without leaking details or retrying', async () => {
  for (const asynchronous of [false, true]) {
    let calls = 0;
    const result = await readViewerPipelineObservation({
      pipelineStats() {
        ++calls;
        const error = new Error('synthetic-private-query-error');
        if (asynchronous) return Promise.reject(error);
        throw error;
      },
    });
    assert.equal(calls, 1);
    assert.equal(result, null);
  }
  const empty = Object.fromEntries(
    Object.keys(sample).map((field) => [field, 0]),
  );
  assert.deepEqual(
    await readViewerPipelineObservation({ pipelineStats: async () => empty }),
    empty,
  );
});

test('preview pipeline rejects missing unsafe negative and inconsistent scalar evidence', async () => {
  const invalid = [
    undefined,
    null,
    {},
    ...Object.keys(sample).map((field) => ({ ...sample, [field]: undefined })),
  ];
  for (const value of [
    NaN,
    Infinity,
    -1,
    0.5,
    Number.MAX_SAFE_INTEGER + 1,
    1n,
    '5',
  ])
    invalid.push({ ...sample, encodeMeanUs: value });
  invalid.push(
    { ...sample, encodeMeanUs: sample.encodeMaxUs + 1 },
    { ...sample, encodeP95Us: sample.encodeMaxUs + 1 },
    { ...sample, maxReadBatch: sample.rdpChecks + 1 },
  );
  for (const reply of invalid)
    assert.equal(
      await readViewerPipelineObservation({ pipelineStats: async () => reply }),
      null,
    );
});

test('preview pipeline awaits its one native request through settlement', async () => {
  let complete;
  let calls = 0;
  let settled = false;
  const pending = readViewerPipelineObservation({
    pipelineStats() {
      ++calls;
      return new Promise((resolve) => {
        complete = resolve;
      });
    },
  }).then((result) => {
    settled = true;
    return result;
  });
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(settled, false);
  complete(sample);
  assert.deepEqual(await pending, sample);
  assert.equal(calls, 1);
});
