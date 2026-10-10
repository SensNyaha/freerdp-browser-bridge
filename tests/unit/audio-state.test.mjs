import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Kind,
  PacketDecoder,
  ProtocolError,
  encodePacket,
  encodePcmAudioState,
  decodePcmAudioState,
  validatePcmAudioStateProgress,
} from '../../packages/protocol/dist/index.js';
const bytes = Buffer.from(
  '000101020000000000000001000000000000000900000000000f4240020201000000bb8003c00000',
  'hex',
);
const ready = {
  enabled: true,
  availability: 'ready',
  revision: 1n,
  epoch: 9n,
  timestampUs: 1000000n,
};
test('PCM state: independent fixed vector and stop/disabled metadata do not require sample packets', () => {
  assert.deepEqual(decodePcmAudioState(bytes), ready);
  assert.deepEqual(encodePcmAudioState(ready), bytes);
  const closed = {
    ...ready,
    revision: 2n,
    availability: 'closed',
    timestampUs: 1020000n,
  };
  assert.deepEqual(decodePcmAudioState(encodePcmAudioState(closed)), closed);
  const disabled = {
    enabled: false,
    availability: 'unavailable',
    revision: 1n,
    epoch: 0n,
    timestampUs: 0n,
  };
  const encoded = encodePcmAudioState(disabled);
  assert.deepEqual(encoded.subarray(28), Buffer.alloc(12));
  assert.deepEqual(decodePcmAudioState(encoded), disabled);
});
test('PCM state: exact framing before allocation, malformed descriptor flags and all mode/flag values refuse', () => {
  for (let length = 0; length < 40; ++length)
    assert.throws(
      () => decodePcmAudioState(bytes.subarray(0, length)),
      ProtocolError,
    );
  assert.throws(
    () => decodePcmAudioState(Buffer.concat([bytes, Buffer.alloc(1)])),
    ProtocolError,
  );
  for (let value = 2; value < 256; ++value) {
    const bad = Buffer.from(bytes);
    bad[2] = value;
    assert.throws(() => decodePcmAudioState(bad), ProtocolError);
  }
  for (let value = 6; value < 256; ++value) {
    const bad = Buffer.from(bytes);
    bad[3] = value;
    assert.throws(() => decodePcmAudioState(bad), ProtocolError);
  }
  for (const index of [0, 1, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39]) {
    const bad = Buffer.from(bytes);
    bad[index] ^= 1;
    assert.throws(() => decodePcmAudioState(bad), ProtocolError);
  }
  for (const bad of [
    { revision: 0n },
    { epoch: 0n },
    { enabled: false },
    { timestampUs: 0xffffffffffffffffn },
    { revision: 1 },
    { availability: 'unknown' },
  ])
    assert.throws(
      () => encodePcmAudioState({ ...ready, ...bad }),
      ProtocolError,
    );
  const record = encodePacket({
    kind: Kind.AudioState,
    requestId: 0n,
    payload: bytes,
  });
  for (let split = 0; split <= record.length; ++split) {
    const parser = new PacketDecoder();
    const records = [];
    parser.push(record.subarray(0, split), (value) => records.push(value));
    parser.push(record.subarray(split), (value) => records.push(value));
    parser.finish();
    assert.equal(records.length, 1);
    assert.deepEqual(decodePcmAudioState(records[0].payload), ready);
  }
  for (const length of [39, 41, 0xffffffff]) {
    const header = Buffer.from(record.subarray(0, 24));
    header.writeUInt32BE(length, 20);
    assert.throws(
      () =>
        new PacketDecoder().push(header, () => assert.fail('oversized state')),
      ProtocolError,
    );
  }
});
test('PCM state: source progress refuses replay epoch/clock regression and opt-in mutation', () => {
  validatePcmAudioStateProgress(undefined, ready);
  for (const mode of [
    'unavailable',
    'waiting',
    'suspended',
    'closed',
    'failed',
  ])
    validatePcmAudioStateProgress(ready, {
      ...ready,
      availability: mode,
      revision: 2n,
    });
  for (const bad of [
    { revision: 1n },
    { revision: 0n },
    { epoch: 8n },
    { timestampUs: 999999n },
    { enabled: false, epoch: 0n, availability: 'unavailable' },
  ])
    assert.throws(
      () =>
        validatePcmAudioStateProgress(ready, {
          ...ready,
          revision: 2n,
          ...bad,
        }),
      ProtocolError,
    );
});
