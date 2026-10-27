import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ProtocolError,
  encodeClipboardImageItem as encode,
  decodeClipboardImageItem as decode,
  validateClipboardImageItem as validate,
  validateClipboardImageWrite as validateWrite,
  decodeClipboardCommand,
  decodeClipboardHtmlItem,
} from '../../packages/protocol/dist/index.js';

const golden = Buffer.from(
  '0001000000000002000000010000000812345678fedcba98',
  'hex',
);
const item = () => ({ width: 2, height: 1, rgba: golden.subarray(16) });
test('Image item: independent BE golden, borrowed pixels and owned encoding', () => {
  assert.deepEqual(encode(item()), golden);
  const decoded = decode(golden);
  assert.equal(decoded.width, 2);
  assert.equal(decoded.height, 1);
  assert.equal(decoded.rgba.buffer, golden.buffer);
  assert.equal(decoded.rgba.byteOffset, golden.byteOffset + 16);
  assert.equal(decoded.rgba.length, 8);
  assert.deepEqual(encode(decoded), golden);
  const owned = encode(decoded);
  owned.fill(0, 16);
  assert.equal(golden.at(-1), 0x98);
  assert.throws(() => decodeClipboardCommand(golden), ProtocolError);
  assert.throws(() => decodeClipboardHtmlItem(golden), ProtocolError);
});
test('Image item: exact schema, flags, declared lengths and bounded signed geometry', () => {
  for (let length = 0; length < golden.length; length++)
    assert.throws(() => decode(golden.subarray(0, length)), ProtocolError);
  for (const at of [0, 1, 2, 3]) {
    const invalid = Buffer.from(golden);
    invalid[at] = 0xff;
    assert.throws(() => decode(invalid), ProtocolError);
  }
  for (const at of [4, 8, 12])
    for (const value of [0, 3, 0x80000000, 0xffffffff]) {
      const invalid = Buffer.from(golden);
      invalid.writeUInt32BE(value, at);
      assert.throws(() => decode(invalid), ProtocolError);
    }
  const trailing = Buffer.concat([golden, Buffer.from([0])]);
  assert.throws(() => decode(trailing), ProtocolError);
  trailing.writeUInt32BE(9, 12);
  assert.throws(() => decode(trailing), ProtocolError);
  assert.throws(() => decode(new Uint8Array(golden)), ProtocolError);
});
test('Image item: invalid shapes and dimensions reject before payload allocation', () => {
  for (const value of [
    0,
    -1,
    NaN,
    Infinity,
    1.5,
    '2',
    0x80000000,
    0xffffffff,
  ]) {
    assert.throws(() => encode({ ...item(), width: value }), ProtocolError);
    assert.throws(() => encode({ ...item(), height: value }), ProtocolError);
  }
  for (const value of [
    null,
    undefined,
    'image',
    {},
    { ...item(), rgba: new Uint8Array(8) },
  ])
    assert.throws(() => validate(value), ProtocolError);
  assert.throws(
    () => encode({ ...item(), rgba: Buffer.alloc(0) }),
    ProtocolError,
  );
  assert.throws(() => encode({ ...item(), width: 1 }), ProtocolError);
  const allocate = Buffer.alloc;
  let calls = 0;
  try {
    Buffer.alloc = (...args) => {
      calls++;
      return allocate(...args);
    };
    assert.throws(
      () => encode({ ...item(), width: 0x7fffffff, height: 0x7fffffff }),
      ProtocolError,
    );
    assert.equal(calls, 0);
  } finally {
    Buffer.alloc = allocate;
  }
});
test('Image item: raw policy and full transport reservation admit exact byte boundaries', () => {
  assert.deepEqual(encode(item(), 8), golden);
  assert.equal(decode(golden, 8).rgba.length, 8);
  assert.throws(() => encode(item(), 7), ProtocolError);
  assert.throws(() => decode(golden, 7), ProtocolError);
  for (const maximum of [0, -1, NaN, Infinity, 1.5, 16777217]) {
    assert.throws(() => validate(item(), maximum), ProtocolError);
    assert.throws(() => decode(golden, maximum), ProtocolError);
  }
  const rgba = Buffer.alloc(16777216 - 16, 0x7f);
  const encoded = encode({ width: rgba.length / 4, height: 1, rgba });
  assert.equal(encoded.length, 16777216);
  assert.equal(decode(encoded).rgba.length, rgba.length);
  const over = Buffer.alloc(rgba.length + 4);
  assert.throws(
    () => encode({ width: over.length / 4, height: 1, rgba: over }),
    ProtocolError,
  );
  assert.throws(
    () => decode(Buffer.concat([encoded, Buffer.from([0])])),
    ProtocolError,
  );
});
test('Image write: full 124-byte DIBV5 overhead is admitted before copying', () => {
  assert.doesNotThrow(() => validateWrite(item(), 132));
  assert.throws(() => validateWrite(item(), 131), ProtocolError);
  assert.throws(() => validateWrite(item(), 8), ProtocolError);
});
