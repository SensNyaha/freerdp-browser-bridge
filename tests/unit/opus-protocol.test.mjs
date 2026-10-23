import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Kind,
  PacketDecoder,
  decodeHeader,
  encodePacket,
  ProtocolError,
  decodePcmAudioConfig,
  decodePcmAudioPacket,
} from '../../packages/protocol/dist/index.js';
import {
  validateOpusAudioPayload,
  encodeOpusAudioConfig,
  decodeOpusAudioConfig,
  encodeOpusAudioPacket,
  decodeOpusAudioPacket,
} from '../../packages/protocol/dist/opus.js';

const configBytes = Buffer.from(
  '010102000000bb8003c001380000000000000001',
  'hex',
);
const packetBytes = Buffer.from(
  '0102000203be0000000000000000000100000000000f4240fcfffe',
  'hex',
);
const config = {
  codec: 'opus',
  epoch: 1n,
  sampleRate: 48000,
  channels: 2,
  packetFrames: 960,
  lookaheadFrames: 312,
};
const packet = {
  epoch: 1n,
  timestampUs: 1000000n,
  frames: 2,
  silenceFrames: 958,
  discontinuity: true,
  encoded: Buffer.from('fcfffe', 'hex'),
};

test('Opus payload: exhaustive TOC profile bounds stereo and one 20 ms frame', () => {
  const expected = [0x0c, 0x2c, 0x4c, 0x6c, 0x7c, 0x9c, 0xbc, 0xdc, 0xfc];
  for (let toc = 0; toc < 256; toc++) {
    const bytes = Buffer.from([toc, 0xff, 0xfe]);
    if (expected.includes(toc))
      assert.doesNotThrow(() => validateOpusAudioPayload(bytes));
    else assert.throws(() => validateOpusAudioPayload(bytes), ProtocolError);
  }
  for (const size of [0, 1, 1276, 4096]) {
    const bytes = Buffer.alloc(size, 0xfc);
    assert.throws(() => validateOpusAudioPayload(bytes), ProtocolError);
  }
  for (const size of [2, 1275])
    assert.doesNotThrow(() =>
      validateOpusAudioPayload(Buffer.alloc(size, 0xfc)),
    );
  for (const bytes of [
    null,
    undefined,
    'fcfffe',
    new Uint8Array([0xfc, 0xff, 0xfe]),
  ])
    assert.throws(() => validateOpusAudioPayload(bytes), ProtocolError);
});

test('Opus config: independent golden profile, queried lookahead and PCM separation', () => {
  assert.deepEqual(decodeOpusAudioConfig(configBytes), config);
  assert.deepEqual(encodeOpusAudioConfig(config), configBytes);
  assert.throws(() => decodePcmAudioConfig(configBytes), ProtocolError);
  for (let size = 0; size < 20; size++)
    assert.throws(
      () => decodeOpusAudioConfig(configBytes.subarray(0, size)),
      ProtocolError,
    );
  assert.throws(
    () => decodeOpusAudioConfig(Buffer.concat([configBytes, Buffer.alloc(1)])),
    ProtocolError,
  );
  for (const at of [0, 1, 2, 3, 4, 7, 8, 9]) {
    const bad = Buffer.from(configBytes);
    bad[at] ^= 255;
    assert.throws(() => decodeOpusAudioConfig(bad), ProtocolError);
  }
  for (const lookaheadFrames of [-1, 961, 65535, 1.5, NaN, '312', null])
    assert.throws(
      () => encodeOpusAudioConfig({ ...config, lookaheadFrames }),
      ProtocolError,
    );
  for (const lookaheadFrames of [0, 960])
    assert.equal(
      decodeOpusAudioConfig(
        encodeOpusAudioConfig({ ...config, lookaheadFrames }),
      ).lookaheadFrames,
      lookaheadFrames,
    );
  for (const epoch of [0n, -1n, 1n << 64n, 1, '1'])
    assert.throws(
      () => encodeOpusAudioConfig({ ...config, epoch }),
      ProtocolError,
    );
  for (const [key, value] of [
    ['codec', 'pcm'],
    ['sampleRate', 44100],
    ['channels', 1],
    ['packetFrames', 480],
  ])
    assert.throws(
      () => encodeOpusAudioConfig({ ...config, [key]: value }),
      ProtocolError,
    );
  const zeroEpoch = Buffer.from(configBytes);
  zeroEpoch.fill(0, 12);
  assert.throws(() => decodeOpusAudioConfig(zeroEpoch), ProtocolError);
  const excessiveDelay = Buffer.from(configBytes);
  excessiveDelay.writeUInt16BE(961, 10);
  assert.throws(() => decodeOpusAudioConfig(excessiveDelay), ProtocolError);
});

test('Opus packet: golden metadata, bounded borrowed encoded bytes and atomic validation', () => {
  assert.deepEqual(decodeOpusAudioPacket(packetBytes), packet);
  assert.deepEqual(encodeOpusAudioPacket(packet), packetBytes);
  assert.throws(() => decodePcmAudioPacket(packetBytes), ProtocolError);
  const borrowed = decodeOpusAudioPacket(packetBytes).encoded;
  assert.equal(borrowed.buffer, packetBytes.buffer);
  assert.equal(borrowed.byteOffset, packetBytes.byteOffset + 24);
  for (let size = 0; size < 26; size++)
    assert.throws(
      () => decodeOpusAudioPacket(packetBytes.subarray(0, size)),
      ProtocolError,
    );
  for (const at of [0, 1, 2, 3, 4, 5, 6, 7, 24]) {
    const bad = Buffer.from(packetBytes);
    bad[at] ^= 255;
    assert.throws(() => decodeOpusAudioPacket(bad), ProtocolError);
  }
  const saved = Buffer.from(packet.encoded);
  for (const [key, values] of [
    ['epoch', [0n, -1n, 1n << 64n, '1']],
    ['timestampUs', [-1n, (1n << 64n) - 20000n, 1, '1']],
    ['frames', [-1, 1, 961, NaN, 2.5]],
    ['silenceFrames', [-1, 959, 961, '958']],
    ['discontinuity', [0, 'true', null]],
  ])
    for (const value of values) {
      assert.throws(
        () => encodeOpusAudioPacket({ ...packet, [key]: value }),
        ProtocolError,
      );
      assert.deepEqual(packet.encoded, saved);
    }
  for (const length of [2, 1275]) {
    const encoded = Buffer.alloc(length, 0xff);
    encoded[0] = 0xfc;
    const bytes = encodeOpusAudioPacket({ ...packet, encoded });
    assert.equal(bytes.length, 24 + length);
    assert.deepEqual(decodeOpusAudioPacket(bytes).encoded, encoded);
  }
  for (const length of [0, 1, 1276]) {
    const encoded = Buffer.alloc(length, 0xfc);
    assert.throws(
      () => encodeOpusAudioPacket({ ...packet, encoded }),
      ProtocolError,
    );
  }
  const oversized = Buffer.alloc(1300);
  packetBytes.copy(oversized);
  assert.throws(() => decodeOpusAudioPacket(oversized), ProtocolError);
  const boundary = {
    ...packet,
    epoch: (1n << 64n) - 1n,
    timestampUs: (1n << 64n) - 20001n,
    frames: 0,
    silenceFrames: 960,
  };
  assert.deepEqual(
    decodeOpusAudioPacket(encodeOpusAudioPacket(boundary)),
    boundary,
  );
});

test('Opus envelope: fixed kind, zero correlation and bounded length before fragmented body admission', () => {
  const encoded = encodePacket({
    kind: Kind.AudioOpus,
    requestId: 0n,
    payload: packetBytes,
  });
  const header = encoded.subarray(0, 24);
  assert.equal(header.readUInt16BE(6), 36);
  assert.deepEqual(decodeHeader(header), {
    kind: Kind.AudioOpus,
    requestId: 0n,
    length: 27,
  });
  for (const size of [0, 1, 24, 25, 1300, 0xffffffff]) {
    const bad = Buffer.from(header);
    bad.writeUInt32BE(size, 20);
    assert.throws(() => decodeHeader(bad), ProtocolError);
    const reader = new PacketDecoder();
    assert.throws(
      () =>
        reader.push(bad, () => assert.fail('Invalid header emitted a packet')),
      ProtocolError,
    );
  }
  for (const size of [26, 1299]) {
    const bounded = Buffer.from(header);
    bounded.writeUInt32BE(size, 20);
    assert.equal(decodeHeader(bounded).length, size);
  }
  const correlated = Buffer.from(header);
  correlated.writeBigUInt64BE(1n, 12);
  assert.throws(() => decodeHeader(correlated), ProtocolError);
  assert.throws(
    () =>
      encodePacket({
        kind: Kind.AudioOpus,
        requestId: 1n,
        payload: packetBytes,
      }),
    ProtocolError,
  );
  const reader = new PacketDecoder();
  const packets = [];
  for (const byte of encoded)
    reader.push(Buffer.from([byte]), (packet) => packets.push(packet));
  reader.finish();
  assert.equal(packets.length, 1);
  assert.deepEqual(decodeOpusAudioPacket(packets[0].payload), packet);
});
