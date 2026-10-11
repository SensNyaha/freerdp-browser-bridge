import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Kind,
  ProtocolError,
  PacketDecoder,
  encodePacket,
  decodeHeader,
  encodeMicrophoneState,
  decodeMicrophoneState,
  validateMicrophoneStateProgress,
} from '../../packages/protocol/dist/index.js';

const state = {
  enabled: true,
  availability: 'ready',
  revision: 1n,
  epoch: 4n,
  timestampUs: 100n,
};
const golden = Buffer.from(
  '00010102000000000000000100000000000000040000000000000064020201000000bb8003c00000',
  'hex',
);
test('microphone state: golden normalized input profile and structural boundaries', () => {
  assert.deepEqual(encodeMicrophoneState(state), golden);
  assert.deepEqual(decodeMicrophoneState(golden), state);
  for (let n = 0; n < 40; n++)
    assert.throws(
      () => decodeMicrophoneState(golden.subarray(0, n)),
      ProtocolError,
    );
  assert.throws(
    () => decodeMicrophoneState(Buffer.concat([golden, Buffer.alloc(1)])),
    ProtocolError,
  );
  for (const at of [
    0, 1, 2, 3, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39,
  ]) {
    const bytes = Buffer.from(golden);
    bytes[at] = 255;
    assert.throws(() => decodeMicrophoneState(bytes), ProtocolError);
  }
  for (const value of [null, {}, new Uint8Array(golden)])
    assert.throws(() => decodeMicrophoneState(value), ProtocolError);
  for (const availability of [
    'unavailable',
    'waiting',
    'ready',
    'suspended',
    'closed',
    'failed',
  ]) {
    const value = { ...state, availability };
    assert.deepEqual(
      decodeMicrophoneState(encodeMicrophoneState(value)),
      value,
    );
  }
  for (const value of [
    { ...state, enabled: false },
    { ...state, epoch: 0n },
    { ...state, revision: 0n },
    { ...state, timestampUs: 0xffffffffffffffffn },
    { ...state, availability: 'other' },
  ])
    assert.throws(() => encodeMicrophoneState(value), ProtocolError);
  const off = {
    enabled: false,
    availability: 'unavailable',
    revision: 1n,
    epoch: 0n,
    timestampUs: 0n,
  };
  assert.deepEqual(decodeMicrophoneState(encodeMicrophoneState(off)), off);
});
test('microphone state: progressive input epochs revisions clocks and immutable enablement', () => {
  validateMicrophoneStateProgress(undefined, state);
  const next = { ...state, revision: 2n, epoch: 5n, timestampUs: 200n };
  validateMicrophoneStateProgress(state, next);
  validateMicrophoneStateProgress(state, {
    ...state,
    revision: 2n,
    availability: 'closed',
  });
  for (const value of [
    state,
    { ...next, revision: 0n },
    { ...next, epoch: 3n },
    { ...next, timestampUs: 99n },
    { ...next, enabled: false, epoch: 0n, availability: 'unavailable' },
  ])
    assert.throws(
      () => validateMicrophoneStateProgress(state, value),
      ProtocolError,
    );
});
test('microphone state framing: exact body zero unsolicited ID and fragmentation', () => {
  const packet = { kind: Kind.MicrophoneState, requestId: 0n, payload: golden };
  const wire = encodePacket(packet);
  assert.throws(
    () => encodePacket({ ...packet, requestId: 1n }),
    ProtocolError,
  );
  for (const length of [0, 39, 41, 0xffffffff]) {
    const header = Buffer.from(wire.subarray(0, 24));
    header.writeUInt32BE(length, 20);
    assert.throws(() => decodeHeader(header), ProtocolError);
    assert.throws(
      () => new PacketDecoder().push(header, () => assert.fail()),
      ProtocolError,
    );
  }
  for (let split = 0; split <= wire.length; split++) {
    const packets = [],
      decoder = new PacketDecoder();
    decoder.push(wire.subarray(0, split), (p) => packets.push(p));
    decoder.push(wire.subarray(split), (p) => packets.push(p));
    decoder.finish();
    assert.deepEqual(packets, [packet]);
  }
});
