import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  ProtocolError,
  encodeClipboardChunk,
  decodeClipboardChunk,
  CLIPBOARD_CHUNK_MAX_BYTES,
  CLIPBOARD_CHUNK_WINDOW,
} from '../../packages/protocol/dist/index.js';
import {
  encodeClipboardChunk as browserEncode,
  decodeClipboardChunk as browserDecode,
  CLIPBOARD_CHUNK_WINDOW as browserWindow,
} from '../../apps/reference-harness/clipboard-wire.js';
const array = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const golden = Buffer.from(
  '5257433100010000000000070000000400000003d09641',
  'hex',
);

test('RWC1 chunks: independent Node/browser vector, borrowed decode and owned encode', () => {
  const chunk = {
    requestSeq: 7,
    offset: 4,
    bytes: Buffer.from('d09641', 'hex'),
  };
  assert.deepEqual(encodeClipboardChunk(chunk), golden);
  assert.deepEqual(Buffer.from(browserEncode(chunk)), golden);
  const source = Buffer.from(golden),
    node = decodeClipboardChunk(source);
  assert.equal(node.requestSeq, 7);
  assert.equal(node.offset, 4);
  assert.equal(node.bytes.buffer, source.buffer);
  assert.equal(node.bytes.byteOffset, source.byteOffset + 20);
  const record = array(golden),
    browser = browserDecode(record);
  assert.equal(browser.requestSeq, 7);
  assert.equal(browser.offset, 4);
  assert.equal(browser.bytes.buffer, record);
  assert.equal(browser.bytes.byteOffset, 20);
  assert.deepEqual(Buffer.from(browser.bytes), chunk.bytes);
  const copied = encodeClipboardChunk(chunk),
    copiedBrowser = browserEncode(chunk);
  chunk.bytes.fill(0);
  assert.deepEqual(copied, golden);
  assert.deepEqual(Buffer.from(copiedBrowser), golden);
  assert.equal(CLIPBOARD_CHUNK_WINDOW, 8);
  assert.equal(browserWindow, 8);
});
test('RWC1 chunks: exact length/version/flags and item-offset bounds refuse before byte borrowing', () => {
  const rejected = (bytes) => {
    assert.throws(() => decodeClipboardChunk(bytes), ProtocolError);
    assert.throws(() => browserDecode(array(bytes)), {
      message: 'Invalid clipboard chunk',
    });
  };
  for (let n = 0; n < golden.length; ++n) rejected(golden.subarray(0, n));
  for (const at of [0, 1, 2, 3, 4, 5, 6, 7, 12, 16, 19]) {
    const b = Buffer.from(golden);
    b[at] = 255;
    rejected(b);
  }
  rejected(Buffer.concat([golden, Buffer.of(0)]));
  rejected(Buffer.alloc(4097));
  const empty = Buffer.from(golden.subarray(0, 20));
  empty.writeUInt32BE(0, 16);
  rejected(empty);
  const valid = { requestSeq: 0, offset: 16777215, bytes: Buffer.of(65) };
  assert.equal(
    decodeClipboardChunk(encodeClipboardChunk(valid)).offset,
    16777215,
  );
  assert.equal(browserDecode(browserEncode(valid)).requestSeq, 0);
  for (const patch of [
    { requestSeq: -1 },
    { requestSeq: 2 ** 32 },
    { requestSeq: 1.5 },
    { offset: -1 },
    { offset: 16777216 },
    { offset: 0.5 },
    { bytes: Buffer.alloc(0) },
    { bytes: Buffer.alloc(4077) },
  ]) {
    assert.throws(
      () => encodeClipboardChunk({ ...valid, ...patch }),
      ProtocolError,
    );
    assert.throws(() => browserEncode({ ...valid, ...patch }), {
      message: 'Invalid clipboard chunk',
    });
  }
});
test('RWC1 chunks: a full 16 MiB item and split UTF8 scalars retain exact bytes in 4 KiB records', () => {
  const bytes = Buffer.alloc(16777216, 65),
    destination = Buffer.alloc(bytes.length);
  const chinese = Buffer.from('界');
  bytes.fill(chinese, 0, bytes.length - (bytes.length % 3));
  let offset = 0,
    records = 0,
    split = false;
  while (offset < bytes.length) {
    const end = Math.min(bytes.length, offset + CLIPBOARD_CHUNK_MAX_BYTES);
    const encoded = encodeClipboardChunk({
      requestSeq: 0xffffffff,
      offset,
      bytes: bytes.subarray(offset, end),
    });
    assert.ok(encoded.length <= 4096);
    const parsed = browserDecode(array(encoded));
    assert.equal(parsed.requestSeq, 0xffffffff);
    assert.equal(parsed.offset, offset);
    destination.set(parsed.bytes, offset);
    split ||= end < bytes.length && end % 3 !== 0;
    offset = end;
    ++records;
  }
  assert.equal(records, 4117);
  assert.equal(split, true);
  const hash = (b) => createHash('sha256').update(b).digest('hex');
  assert.equal(hash(destination), hash(bytes));
  bytes.fill(0);
  destination.fill(0);
});
