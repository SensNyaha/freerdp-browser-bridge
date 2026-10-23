import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Kind,
  encodePacket,
  decodePipelineStats,
  ProtocolError,
} from '../../packages/protocol/dist/index.js';
test('pipeline counters have a fixed bounded payload and safe numeric timing values', () => {
  const p = Buffer.alloc(64);
  [100, 90, 15, 20000, 30000, 35000, 64, 5000].forEach((v, i) =>
    p.writeBigUInt64BE(BigInt(v), i * 8),
  );
  assert.deepEqual(decodePipelineStats(p), {
    rdpChecks: 100,
    paints: 90,
    encodedFrames: 15,
    encodeMeanUs: 20000,
    encodeP95Us: 30000,
    encodeMaxUs: 35000,
    maxReadBatch: 64,
    maxReadBatchUs: 5000,
  });
  assert.equal(
    encodePacket({ kind: Kind.PipelineStatsAck, requestId: 1n, payload: p })
      .length,
    88,
  );
  assert.throws(
    () =>
      encodePacket({
        kind: Kind.PipelineStatsAck,
        requestId: 1n,
        payload: Buffer.alloc(65),
      }),
    ProtocolError,
  );
  assert.throws(() => decodePipelineStats(p.subarray(0, 63)), ProtocolError);
  p.writeBigUInt64BE(2n ** 63n);
  assert.throws(() => decodePipelineStats(p), ProtocolError);
  p.writeBigUInt64BE(100n);
  p.writeBigUInt64BE(50000n, 24);
  assert.throws(() => decodePipelineStats(p), ProtocolError);
});
