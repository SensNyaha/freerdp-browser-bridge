import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ProtocolError,
  encodeMicrophoneRecord,
  decodeMicrophoneRecord,
  encodeMicrophonePcm,
  decodeMicrophonePcm,
} from '../../packages/protocol/dist/index.js';
const browser = await import(
  'data:text/javascript;base64,' +
    (await readFile('apps/reference-harness/microphone-wire.js')).toString(
      'base64',
    )
);
const arrayBuffer = (bytes) =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
function golden() {
  const bytes = Buffer.alloc(3876);
  Buffer.from(
    '5257423101070002000000040000000100000000000f424000000f0801020304050607080080ff7f',
    'hex',
  ).copy(bytes);
  return bytes;
}
test('MIC_PACKET RWB1: independent vector, Node/browser agreement and private PCM projection', () => {
  const bytes = golden(),
    native = decodeMicrophoneRecord(bytes),
    web = browser.parseMicrophoneRecord(arrayBuffer(bytes));
  assert.equal(native.sequence, 1);
  assert.equal(native.epoch, 0x0102030405060708n);
  assert.equal(native.timestampUs, 1000000n);
  assert.equal(native.discontinuity, true);
  assert.equal(native.pcm.readInt16LE(0), -32768);
  assert.equal(native.pcm.readInt16LE(2), 32767);
  assert.equal(web.epoch, native.epoch);
  assert.deepEqual(Buffer.from(web.pcm), native.pcm);
  assert.deepEqual(encodeMicrophoneRecord(native, 1), bytes);
  assert.deepEqual(Buffer.from(browser.encodeMicrophoneRecord(web, 1)), bytes);
  const projected = decodeMicrophonePcm(encodeMicrophonePcm(native));
  assert.equal(projected.epoch, native.epoch);
  assert.equal(projected.timestampUs, native.timestampUs);
  assert.deepEqual(projected.pcm, native.pcm);
  bytes[36] = 42;
  assert.equal(native.pcm[0], 42);
  const borrowed = arrayBuffer(golden()),
    packet = browser.parseMicrophoneRecord(borrowed);
  new Uint8Array(borrowed)[36] = 43;
  assert.equal(packet.pcm[0], 43);
});
test('MIC_PACKET RWB1: exact length, direction, stream, sequence, flags, epoch and clock refuse malformed input', () => {
  const bytes = golden();
  const refuse = (value) => {
    assert.throws(() => decodeMicrophoneRecord(value), ProtocolError);
    assert.throws(
      () => browser.parseMicrophoneRecord(arrayBuffer(value)),
      /Invalid microphone record/,
    );
  };
  for (let length = 0; length < bytes.length; ++length)
    refuse(bytes.subarray(0, length));
  refuse(Buffer.concat([bytes, Buffer.alloc(1)]));
  for (const at of [0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 24, 25, 26, 27]) {
    const invalid = Buffer.from(bytes);
    invalid[at] ^= 1;
    refuse(invalid);
  }
  for (const flags of [1, 3, 4, 0x8000, 0xffff]) {
    const invalid = Buffer.from(bytes);
    invalid.writeUInt16BE(flags, 6);
    refuse(invalid);
  }
  for (const [at, width] of [
    [12, 4],
    [28, 8],
  ]) {
    const invalid = Buffer.from(bytes);
    invalid.fill(0, at, at + width);
    refuse(invalid);
  }
  const invalid = Buffer.from(bytes);
  invalid.writeBigUInt64BE(0xffffffffffffffffn - 19999n, 16);
  refuse(invalid);
  for (const value of [null, {}, new Uint8Array(bytes)])
    assert.throws(() => decodeMicrophoneRecord(value), ProtocolError);
  for (const value of [null, {}, new Uint8Array(bytes)])
    assert.throws(
      () => browser.parseMicrophoneRecord(value),
      /Invalid microphone record/,
    );
});
test('MIC_PACKET RWB1: encoders validate before allocation, preserve caller bytes and never wrap sequence', () => {
  const packet = decodeMicrophoneRecord(golden());
  const webPacket = { ...packet, pcm: new Uint8Array(packet.pcm) };
  for (const sequence of [0, -1, 0x100000000, 1.5, null, 1n]) {
    assert.throws(
      () => encodeMicrophoneRecord(packet, sequence),
      ProtocolError,
    );
    assert.throws(
      () => browser.encodeMicrophoneRecord(webPacket, sequence),
      /Invalid microphone record/,
    );
  }
  for (const field of [
    { epoch: 0n },
    { epoch: -1n },
    { epoch: 1n << 64n },
    { timestampUs: -1n },
    { timestampUs: 0xffffffffffffffffn - 19999n },
    { discontinuity: 1 },
  ]) {
    assert.throws(
      () => encodeMicrophoneRecord({ ...packet, ...field }, 1),
      ProtocolError,
    );
    assert.throws(
      () => browser.encodeMicrophoneRecord({ ...webPacket, ...field }, 1),
      /Invalid microphone record/,
    );
  }
  for (const length of [3839, 3841]) {
    assert.throws(
      () => encodeMicrophoneRecord({ ...packet, pcm: Buffer.alloc(length) }, 1),
      ProtocolError,
    );
    assert.throws(
      () =>
        browser.encodeMicrophoneRecord(
          { ...webPacket, pcm: new Uint8Array(length) },
          1,
        ),
      /Invalid microphone record/,
    );
  }
  for (const sequence of [1, 0xffffffff]) {
    const extremes = {
      ...packet,
      epoch: 0xffffffffffffffffn,
      timestampUs: 0xffffffffffffffffn - 20000n,
      discontinuity: false,
    };
    const record = encodeMicrophoneRecord(extremes, sequence);
    assert.equal(decodeMicrophoneRecord(record).sequence, sequence);
    assert.deepEqual(
      Buffer.from(
        browser.encodeMicrophoneRecord(
          { ...extremes, pcm: webPacket.pcm },
          sequence,
        ),
      ),
      record,
    );
    record.fill(0, 36);
    assert.equal(packet.pcm[1], 0x80);
    assert.equal(webPacket.pcm[1], 0x80);
  }
});
