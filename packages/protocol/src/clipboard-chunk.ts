import { ProtocolError } from './index.js';
import { CLIPBOARD_MAX_TEXT_BYTES } from './clipboard.js';

export const CLIPBOARD_CHUNK_HEADER_BYTES = 20;
export const CLIPBOARD_CHUNK_MAX_RECORD_BYTES = 4096;
export const CLIPBOARD_CHUNK_MAX_BYTES =
  CLIPBOARD_CHUNK_MAX_RECORD_BYTES - CLIPBOARD_CHUNK_HEADER_BYTES;
export const CLIPBOARD_CHUNK_WINDOW = 8;
export interface ClipboardChunk {
  requestSeq: number;
  offset: number;
  /** Borrowed on decode; a chunk may split a UTF-8 scalar. */
  bytes: Buffer;
}
function validate(c: ClipboardChunk): void {
  if (
    !Number.isInteger(c.requestSeq) ||
    c.requestSeq < 0 ||
    c.requestSeq > 0xffffffff ||
    !Number.isInteger(c.offset) ||
    c.offset < 0 ||
    !Buffer.isBuffer(c.bytes) ||
    c.bytes.length < 1 ||
    c.bytes.length > CLIPBOARD_CHUNK_MAX_BYTES ||
    c.offset > CLIPBOARD_MAX_TEXT_BYTES - c.bytes.length
  )
    throw new ProtocolError();
}
/** Prepared RWC1 record; whole-item admission, offset/credit and lease are separate. */
export function encodeClipboardChunk(c: ClipboardChunk): Buffer {
  validate(c);
  const bytes = Buffer.alloc(CLIPBOARD_CHUNK_HEADER_BYTES + c.bytes.length);
  bytes.writeUInt32BE(0x52574331, 0);
  bytes.writeUInt16BE(1, 4);
  bytes.writeUInt32BE(c.requestSeq, 8);
  bytes.writeUInt32BE(c.offset, 12);
  bytes.writeUInt32BE(c.bytes.length, 16);
  c.bytes.copy(bytes, CLIPBOARD_CHUNK_HEADER_BYTES);
  return bytes;
}
export function decodeClipboardChunk(bytes: Buffer): ClipboardChunk {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length < CLIPBOARD_CHUNK_HEADER_BYTES ||
    bytes.length > CLIPBOARD_CHUNK_MAX_RECORD_BYTES ||
    bytes.readUInt32BE(0) !== 0x52574331 ||
    bytes.readUInt16BE(4) !== 1 ||
    bytes.readUInt16BE(6) !== 0 ||
    bytes.readUInt32BE(16) !== bytes.length - CLIPBOARD_CHUNK_HEADER_BYTES
  )
    throw new ProtocolError();
  const chunk = {
    requestSeq: bytes.readUInt32BE(8),
    offset: bytes.readUInt32BE(12),
    bytes: bytes.subarray(CLIPBOARD_CHUNK_HEADER_BYTES),
  };
  validate(chunk);
  return chunk;
}
