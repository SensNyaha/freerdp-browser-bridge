export const CLIPBOARD_CHUNK_HEADER_BYTES = 20;
export const CLIPBOARD_CHUNK_MAX_RECORD_BYTES = 4096;
export const CLIPBOARD_CHUNK_MAX_BYTES = 4076;
export const CLIPBOARD_CHUNK_WINDOW = 8;
const invalid = () => new Error('Invalid clipboard chunk');
function validate(requestSeq, offset, bytes) {
  if (
    !Number.isInteger(requestSeq) ||
    requestSeq < 0 ||
    requestSeq > 0xffffffff ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength < 1 ||
    bytes.byteLength > CLIPBOARD_CHUNK_MAX_BYTES ||
    offset > 16777216 - bytes.byteLength
  )
    throw invalid();
}
/** Byte framing only: UTF-8 may cross chunks; admission belongs to the transfer owner. */
export function encodeClipboardChunk({ requestSeq, offset, bytes }) {
  validate(requestSeq, offset, bytes);
  const output = new ArrayBuffer(
    CLIPBOARD_CHUNK_HEADER_BYTES + bytes.byteLength,
  );
  const view = new DataView(output);
  view.setUint32(0, 0x52574331);
  view.setUint16(4, 1);
  view.setUint32(8, requestSeq);
  view.setUint32(12, offset);
  view.setUint32(16, bytes.byteLength);
  new Uint8Array(output, CLIPBOARD_CHUNK_HEADER_BYTES).set(bytes);
  return output;
}
export function decodeClipboardChunk(bytes) {
  if (
    !(bytes instanceof ArrayBuffer) ||
    bytes.byteLength < CLIPBOARD_CHUNK_HEADER_BYTES ||
    bytes.byteLength > CLIPBOARD_CHUNK_MAX_RECORD_BYTES
  )
    throw invalid();
  const view = new DataView(bytes);
  if (
    view.getUint32(0) !== 0x52574331 ||
    view.getUint16(4) !== 1 ||
    view.getUint16(6) !== 0 ||
    view.getUint32(16) !== bytes.byteLength - CLIPBOARD_CHUNK_HEADER_BYTES
  )
    throw invalid();
  const chunk = {
    requestSeq: view.getUint32(8),
    offset: view.getUint32(12),
    bytes: new Uint8Array(bytes, CLIPBOARD_CHUNK_HEADER_BYTES),
  };
  validate(chunk.requestSeq, chunk.offset, chunk.bytes);
  return chunk;
}
