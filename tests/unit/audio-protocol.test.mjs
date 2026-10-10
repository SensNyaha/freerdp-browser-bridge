import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Kind,
  PacketDecoder,
  ProtocolError,
  encodePacket,
  decodeHeader,
  encodePcmAudioConfig,
  decodePcmAudioConfig,
  encodePcmAudioPacket,
  decodePcmAudioPacket,
  encodePcmAudioRecords,
} from '../../packages/protocol/dist/index.js';

const configBytes = Buffer.from(
  '010202010000bb8003c000000000000000000001',
  'hex',
);
const config = {
  epoch: 1n,
  codec: 'pcm',
  sampleRate: 48000,
  channels: 2,
  sampleFormat: 's16le',
  packetFrames: 960,
};
function packetBytes() {
  const bytes = Buffer.alloc(3864);
  Buffer.from(
    '0102000203be0000000000000000000100000000000f42400080ff7fffff0000',
    'hex',
  ).copy(bytes);
  return bytes;
}
test('PCM audio config: independent golden layout, profile and epoch bounds', () => {
  assert.deepEqual(decodePcmAudioConfig(configBytes), config);
  assert.deepEqual(encodePcmAudioConfig(config), configBytes);
  for (let size = 0; size < 20; size++)
    assert.throws(
      () => decodePcmAudioConfig(configBytes.subarray(0, size)),
      ProtocolError,
    );
  assert.throws(
    () => decodePcmAudioConfig(Buffer.concat([configBytes, Buffer.alloc(1)])),
    ProtocolError,
  );
  for (const at of [0, 1, 2, 3, 4, 7, 8, 9, 10, 11]) {
    const bad = Buffer.from(configBytes);
    bad[at] ^= 255;
    assert.throws(() => decodePcmAudioConfig(bad), ProtocolError);
  }
  const zero = Buffer.from(configBytes);
  zero.fill(0, 12);
  assert.throws(() => decodePcmAudioConfig(zero), ProtocolError);
  for (const value of [0n, -1n, 1n << 64n, 1, '1'])
    assert.throws(
      () => encodePcmAudioConfig({ ...config, epoch: value }),
      ProtocolError,
    );
  for (const [key, value] of [
    ['codec', 'opus'],
    ['sampleRate', 44100],
    ['channels', 1],
    ['sampleFormat', 'f32le'],
    ['packetFrames', 480],
  ])
    assert.throws(
      () => encodePcmAudioConfig({ ...config, [key]: value }),
      ProtocolError,
    );
  assert.equal(
    decodePcmAudioConfig(
      encodePcmAudioConfig({ ...config, epoch: (1n << 64n) - 1n }),
    ).epoch,
    (1n << 64n) - 1n,
  );
});
test('PCM audio packet: sample endian, frame accounting, silence and fixed-size bounds', () => {
  const bytes = packetBytes();
  const packet = decodePcmAudioPacket(bytes);
  assert.equal(packet.epoch, 1n);
  assert.equal(packet.timestampUs, 1000000n);
  assert.equal(packet.frames, 2);
  assert.equal(packet.silenceFrames, 958);
  assert.equal(packet.discontinuity, true);
  assert.equal(packet.pcm.readInt16LE(0), -32768);
  assert.equal(packet.pcm.readInt16LE(2), 32767);
  assert.equal(packet.pcm.readInt16LE(4), -1);
  assert.equal(packet.pcm.buffer, bytes.buffer);
  assert.deepEqual(encodePcmAudioPacket(packet), bytes);
  for (let size = 0; size < bytes.length; size++)
    assert.throws(
      () => decodePcmAudioPacket(bytes.subarray(0, size)),
      ProtocolError,
    );
  for (const at of [0, 1, 2, 3, 4, 5, 6, 7, 3863]) {
    const bad = Buffer.from(bytes);
    bad[at] ^= 255;
    assert.throws(() => decodePcmAudioPacket(bad), ProtocolError);
  }
  for (const [key, value] of [
    ['epoch', 0n],
    ['timestampUs', -1n],
    ['timestampUs', (1n << 64n) - 1n],
    ['frames', 961],
    ['frames', 0.5],
    ['silenceFrames', 0],
    ['discontinuity', 1],
    ['pcm', Buffer.alloc(3839)],
    ['pcm', new Uint8Array(3840)],
  ])
    assert.throws(
      () => encodePcmAudioPacket({ ...packet, [key]: value }),
      ProtocolError,
    );
  const badTail = Buffer.from(packet.pcm);
  badTail[3839] = 1;
  assert.throws(
    () => encodePcmAudioPacket({ ...packet, pcm: badTail }),
    ProtocolError,
  );
  const full = {
    ...packet,
    epoch: (1n << 64n) - 1n,
    timestampUs: (1n << 64n) - 20001n,
    frames: 960,
    silenceFrames: 0,
    discontinuity: false,
    pcm: Buffer.alloc(3840, 255),
  };
  assert.deepEqual(decodePcmAudioPacket(encodePcmAudioPacket(full)), full);
  const silence = {
    ...packet,
    frames: 0,
    silenceFrames: 960,
    pcm: Buffer.alloc(3840),
  };
  assert.deepEqual(
    decodePcmAudioPacket(encodePcmAudioPacket(silence)),
    silence,
  );
});
test('PCM audio framing: exact header limits, arbitrary fragments and fail-closed lengths', () => {
  for (const [kind, payload] of [
    [Kind.AudioConfig, configBytes],
    [Kind.AudioPcm, packetBytes()],
  ]) {
    const encoded = encodePacket({ kind, requestId: 0n, payload });
    assert.deepEqual(decodeHeader(encoded.subarray(0, 24)), {
      kind,
      requestId: 0n,
      length: payload.length,
    });
    const decoder = new PacketDecoder(),
      records = [];
    for (let at = 0; at < encoded.length; at += 7)
      decoder.push(encoded.subarray(at, at + 7), (record) =>
        records.push(record),
      );
    decoder.finish();
    assert.deepEqual(records, [{ kind, requestId: 0n, payload }]);
    for (const length of [0, 19, 21, 3863, 3865, 0xffffffff]) {
      const header = Buffer.from(encoded.subarray(0, 24));
      header.writeUInt32BE(length, 20);
      assert.throws(() => decodeHeader(header), ProtocolError);
      const bad = new PacketDecoder();
      assert.throws(
        () => bad.push(header, () => assert.fail('no body callback')),
        ProtocolError,
      );
      assert.throws(() => bad.finish(), ProtocolError);
    }
  }
});
test('PCM RWB1: stream 3, raw sample payload, epoch refusal and per-attach discontinuity', () => {
  const packet = decodePcmAudioPacket(packetBytes());
  const records = encodePcmAudioRecords(config, packet, 10, true);
  assert.equal(
    records[0].toString('hex'),
    '5257423101030002000000030000000a00000000000f424000000014' +
      configBytes.toString('hex'),
  );
  assert.equal(
    records[1].subarray(0, 28).toString('hex'),
    '5257423101040002000000030000000b00000000000f424000000f00',
  );
  assert.deepEqual(records[1].subarray(28), packet.pcm);
  const continuous = { ...packet, discontinuity: false };
  assert.equal(
    encodePcmAudioRecords(
      config,
      continuous,
      0xffffffff,
      false,
    )[0].readUInt16BE(6),
    0,
  );
  assert.equal(
    encodePcmAudioRecords(config, continuous, 0xfffffffe, true)[1].readUInt32BE(
      12,
    ),
    0xffffffff,
  );
  assert.equal(
    encodePcmAudioRecords(config, continuous, 0, true)[1].readUInt16BE(6),
    2,
  );
  for (const sequence of [-1, 1.5, 0x100000000, NaN])
    assert.throws(
      () => encodePcmAudioRecords(config, packet, sequence, false),
      ProtocolError,
    );
  assert.throws(
    () => encodePcmAudioRecords(config, packet, 0xffffffff, true),
    ProtocolError,
  );
  assert.throws(
    () => encodePcmAudioRecords({ ...config, epoch: 2n }, packet, 0, false),
    ProtocolError,
  );
  assert.throws(
    () => encodePcmAudioRecords(config, packet, 0, 1),
    ProtocolError,
  );
  const copied = encodePcmAudioRecords(config, packet, 0, false)[0];
  packet.pcm.fill(0);
  assert.equal(copied.readInt16LE(28), -32768);
});
