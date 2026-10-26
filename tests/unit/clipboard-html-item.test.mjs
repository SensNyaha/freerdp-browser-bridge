import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ProtocolError,
  encodeClipboardHtmlItem as encode,
  decodeClipboardHtmlItem as decode,
  validateClipboardHtmlItem as validate,
  validateClipboardHtmlWrite,
  decodeClipboardCommand,
} from '../../packages/protocol/dist/index.js';

const golden = Buffer.from(
  '00010001000000080000000100000000000000080000000000000000000000003c623e583c2f623e58',
  'hex',
);
const item = (body = '<b>X</b>') => ({
  body: Buffer.from(body),
  fragmentOffset: 0,
  fragmentBytes: Buffer.byteLength(body),
  selectionOffset: 0,
  selectionBytes: 0,
  context: false,
  selection: false,
});
test('HTML item: independent golden, borrowed body/fallback and absent versus empty text', () => {
  assert.deepEqual(encode({ ...item(), text: Buffer.from('X') }), golden);
  const parsed = decode(golden);
  assert.equal(parsed.body.buffer, golden.buffer);
  assert.equal(parsed.body.byteOffset, golden.byteOffset + 32);
  assert.equal(parsed.text.byteOffset, golden.byteOffset + 40);
  assert.deepEqual(encode(parsed), golden);
  for (const empty of [false, true]) {
    const original = { ...item(), ...(empty ? { text: Buffer.alloc(0) } : {}) };
    const bytes = encode(original);
    assert.equal(bytes.length, 40);
    assert.equal(Object.hasOwn(decode(bytes), 'text'), empty);
    assert.deepEqual(decode(bytes), original);
  }
  assert.equal(encode(item('')).length, 32);
  assert.throws(() => decodeClipboardCommand(golden), ProtocolError);
});
test('HTML item: Unicode context, fragment and selection byte boundaries are separate', () => {
  const body = Buffer.from('<table><tr><td><b>Ж😀</b></td></tr></table>');
  const offset = body.indexOf('<b>');
  const original = {
    ...item(),
    body,
    context: true,
    fragmentOffset: offset,
    fragmentBytes: 13,
    selection: true,
    selectionOffset: offset + 3,
    selectionBytes: 6,
  };
  assert.deepEqual(decode(encode(original)), original);
  assert.equal(
    decode(encode(original))
      .body.subarray(offset + 3, offset + 9)
      .toString(),
    'Ж😀',
  );
  for (const delta of [
    { fragmentOffset: offset + 4 },
    { fragmentBytes: 6 },
    { selectionOffset: offset + 4 },
    { selectionBytes: 3 },
  ])
    assert.throws(() => encode({ ...original, ...delta }), ProtocolError);
});
test('HTML item: all truncations, reserved bits, schema and exact length admission', () => {
  for (let size = 0; size < golden.length; size++)
    assert.throws(() => decode(golden.subarray(0, size)), ProtocolError);
  for (const at of [0, 1, 2, 3, 4, 7, 8, 11, 12, 15, 16, 19, 20, 24, 28, 31]) {
    const bad = Buffer.from(golden);
    bad[at] = 0xff;
    assert.throws(() => decode(bad), ProtocolError);
  }
  const noTextFlag = Buffer.from(golden);
  noTextFlag[3] = 0;
  assert.throws(() => decode(noTextFlag), ProtocolError);
  assert.throws(
    () => decode(Buffer.concat([golden, Buffer.from([0])])),
    ProtocolError,
  );
  for (const at of [32, 35, 40]) {
    for (const byte of [0, 0x80]) {
      const bad = Buffer.from(golden);
      bad[at] = byte;
      assert.throws(() => decode(bad), ProtocolError);
    }
  }
});
test('HTML item: invalid UTF8/NUL, ranges, types and absent flags refuse before encoding', () => {
  for (const value of [null, undefined, 1, 'html'])
    assert.throws(() => validate(value), ProtocolError);
  for (const body of [
    Buffer.from([0]),
    Buffer.from([0xc0, 0xaf]),
    Buffer.from([0xed, 0xa0, 0x80]),
    Buffer.from([0xf4, 0x90, 0x80, 0x80]),
  ])
    assert.throws(
      () => encode({ ...item(), body, fragmentBytes: body.length }),
      ProtocolError,
    );
  for (const delta of [
    { fragmentOffset: 1 },
    { fragmentBytes: 7 },
    { selectionOffset: 1 },
    { selectionBytes: 1 },
    { selection: true, selectionOffset: 7, selectionBytes: 2 },
    { context: true, fragmentOffset: 9 },
    { fragmentOffset: NaN },
    { fragmentOffset: 0.5 },
    { fragmentBytes: -1 },
    { context: 1 },
    { selection: 'yes' },
    { body: 'html' },
    { text: null },
    { text: Buffer.from([0]) },
  ])
    assert.throws(() => encode({ ...item(), ...delta }), ProtocolError);
  assert.throws(() => encode({ ...item(''), context: true }), ProtocolError);
});
test('HTML item: aggregate quota, UTF16 fallback expansion and exact existing transport ceiling', () => {
  const value = { ...item(), text: Buffer.from('X') };
  assert.deepEqual(encode(value, 9), golden);
  assert.throws(() => encode(value, 8), ProtocolError);
  assert.throws(() => decode(golden, 8), ProtocolError);
  for (const maximum of [0, -1, NaN, 1.5, 16777217]) {
    assert.throws(() => validate(value, maximum), ProtocolError);
    assert.throws(() => decode(golden, maximum), ProtocolError);
  }
  const body = Buffer.alloc(16777216 - 32, 65);
  const encoded = encode({ ...item(), body, fragmentBytes: body.length });
  assert.equal(encoded.length, 16777216);
  assert.equal(decode(encoded).body.length, body.length);
  const over = Buffer.alloc(16777216 - 31, 65);
  assert.throws(
    () => encode({ ...item(), body: over, fragmentBytes: over.length }),
    ProtocolError,
  );
  assert.throws(
    () => decode(Buffer.concat([encoded, Buffer.from('A')])),
    ProtocolError,
  );
  assert.throws(
    () => encode({ ...item('x'), text: Buffer.from('\n'.repeat(10)) }, 11),
    ProtocolError,
  );
});
test('HTML write: aggregate actual RDP encodings and source UTF8 are admitted before copying', () => {
  const value = { ...item(), text: Buffer.from('X') };
  assert.doesNotThrow(() => validateClipboardHtmlWrite(value, 182));
  assert.throws(() => validateClipboardHtmlWrite(value, 181), ProtocolError);
  assert.throws(
    () => validateClipboardHtmlWrite({ ...value, context: true }),
    ProtocolError,
  );
  assert.throws(
    () => validateClipboardHtmlWrite({ ...value, selection: true }),
    ProtocolError,
  );
  const large = {
    ...item('A'.repeat(250)),
    text: Buffer.from('\u4e2d'.repeat(300)),
  };
  assert.throws(() => validateClipboardHtmlWrite(large, 1024), ProtocolError);
});
