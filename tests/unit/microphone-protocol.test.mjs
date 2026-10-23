import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Kind,
  PacketDecoder,
  ProtocolError,
  encodePacket,
  decodeHeader,
  encodeMicrophonePcm,
  decodeMicrophonePcm,
  encodeMicrophoneResult,
  decodeMicrophoneResult,
  encodePcmAudioPacket,
} from '../../packages/protocol/dist/index.js';

function golden() {
  const bytes = Buffer.alloc(3864);
  Buffer.from(
    '010203c000000000010203040506070800000000000f42400080ff7f',
    'hex',
  ).copy(bytes);
  return bytes;
}
test('microphone PCM: independent golden capture profile and borrowed little-endian samples', () => {
  const bytes = golden();
  const packet = decodeMicrophonePcm(bytes);
  assert.equal(packet.epoch, 0x0102030405060708n);
  assert.equal(packet.timestampUs, 1000000n);
  assert.equal(packet.discontinuity, true);
  assert.equal(packet.pcm.length, 3840);
  assert.equal(packet.pcm.readInt16LE(0), -32768);
  assert.equal(packet.pcm.readInt16LE(2), 32767);
  assert.deepEqual(encodeMicrophonePcm(packet), bytes);
  bytes[24] = 42;
  assert.equal(packet.pcm[0], 42);
  const outputSilence = encodePcmAudioPacket({
    epoch: 1n,
    timestampUs: 0n,
    frames: 0,
    silenceFrames: 960,
    discontinuity: true,
    pcm: Buffer.alloc(3840),
  });
  assert.throws(() => decodeMicrophonePcm(outputSilence), ProtocolError);
});
test('microphone PCM: exact size schema flags frame counts and reserved bytes', () => {
  const bytes = golden();
  for (let n = 0; n < bytes.length; n++)
    assert.throws(
      () => decodeMicrophonePcm(bytes.subarray(0, n)),
      ProtocolError,
    );
  assert.throws(
    () => decodeMicrophonePcm(Buffer.concat([bytes, Buffer.alloc(1)])),
    ProtocolError,
  );
  for (const at of [0, 1, 2, 3, 4, 5, 6, 7]) {
    for (let value = 0; value < 256; value++) {
      const bad = Buffer.from(bytes);
      bad[at] = value;
      if (value === bytes[at] || (at === 1 && value === 0))
        assert.doesNotThrow(() => decodeMicrophonePcm(bad));
      else assert.throws(() => decodeMicrophonePcm(bad), ProtocolError);
    }
  }
  for (const bad of [null, {}, new Uint8Array(bytes)])
    assert.throws(() => decodeMicrophonePcm(bad), ProtocolError);
});
test('microphone PCM: nonzero u64 epoch capture time and payload refusal without input disclosure', () => {
  const packet = decodeMicrophonePcm(golden());
  for (const epoch of [0n, -1n, 1n << 64n, 1, null])
    assert.throws(
      () => encodeMicrophonePcm({ ...packet, epoch }),
      ProtocolError,
    );
  for (const timestampUs of [
    -1n,
    0xffffffffffffffffn - 19999n,
    1n << 64n,
    1,
    null,
  ])
    assert.throws(
      () => encodeMicrophonePcm({ ...packet, timestampUs }),
      ProtocolError,
    );
  for (const pcm of [
    Buffer.alloc(3839),
    Buffer.alloc(3841),
    null,
    new Uint8Array(3840),
  ])
    assert.throws(() => encodeMicrophonePcm({ ...packet, pcm }), ProtocolError);
  for (const discontinuity of [0, null, 'true'])
    assert.throws(
      () => encodeMicrophonePcm({ ...packet, discontinuity }),
      ProtocolError,
    );
  const max = {
    ...packet,
    epoch: 0xffffffffffffffffn,
    timestampUs: 0xffffffffffffffffn - 20000n,
  };
  assert.deepEqual(decodeMicrophonePcm(encodeMicrophonePcm(max)), max);
  const zero = golden();
  zero.fill(0, 8, 16);
  assert.throws(() => decodeMicrophonePcm(zero), {
    message: 'Invalid worker IPC record',
  });
});
test('microphone results: exhaustive status schema reserved and exact-length validation', () => {
  const statuses = ['accepted', 'stale', 'unavailable', 'busy', 'invalid'];
  for (let code = 0; code < 256; code++) {
    const bytes = Buffer.from([1, code, 0, 0]);
    if (code < statuses.length) {
      assert.equal(decodeMicrophoneResult(bytes), statuses[code]);
      assert.deepEqual(encodeMicrophoneResult(statuses[code]), bytes);
    } else assert.throws(() => decodeMicrophoneResult(bytes), ProtocolError);
  }
  for (const value of [null, 0, 'other'])
    assert.throws(() => encodeMicrophoneResult(value), ProtocolError);
  for (const value of [
    null,
    {},
    Buffer.alloc(0),
    Buffer.alloc(3),
    Buffer.alloc(5),
    Buffer.from([0, 2, 0, 0]),
    Buffer.from([1, 2, 1, 0]),
    Buffer.from([1, 2, 0, 1]),
  ])
    assert.throws(() => decodeMicrophoneResult(value), ProtocolError);
});
test('microphone framing: preallocation limits nonzero correlation and all stream splits', () => {
  for (const [kind, payload] of [
    [Kind.MicrophonePcm, golden()],
    [Kind.MicrophoneResult, encodeMicrophoneResult('unavailable')],
  ]) {
    assert.throws(
      () => encodePacket({ kind, requestId: 0n, payload }),
      ProtocolError,
    );
    const packet = { kind, requestId: 0xffffffffffffffffn, payload };
    const wire = encodePacket(packet);
    for (const length of [
      0,
      payload.length - 1,
      payload.length + 1,
      0xffffffff,
    ]) {
      const header = Buffer.from(wire.subarray(0, 24));
      header.writeUInt32BE(length, 20);
      assert.throws(() => decodeHeader(header), ProtocolError);
      assert.throws(
        () => new PacketDecoder().push(header, () => assert.fail()),
        ProtocolError,
      );
    }
    const zero = Buffer.from(wire.subarray(0, 24));
    zero.writeBigUInt64BE(0n, 12);
    assert.throws(() => decodeHeader(zero), ProtocolError);
    for (let split = 0; split <= wire.length; split++) {
      const records = [],
        decoder = new PacketDecoder();
      decoder.push(wire.subarray(0, split), (p) => records.push(p));
      decoder.push(wire.subarray(split), (p) => records.push(p));
      decoder.finish();
      assert.deepEqual(records, [packet]);
    }
  }
});
