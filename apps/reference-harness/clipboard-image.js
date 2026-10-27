export const CLIPBOARD_IMAGE_ITEM_METADATA_BYTES = 16;
export const CLIPBOARD_IMAGE_DIBV5_HEADER_BYTES = 124;
const maximumBytes = 16777216;
const invalid = () => new Error('Invalid clipboard image item');
function geometry(width, height, maximum) {
  if (
    !Number.isInteger(maximum) ||
    maximum < 1 ||
    maximum > maximumBytes ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 0x7fffffff ||
    height > 0x7fffffff ||
    height > Math.floor(Math.min(maximum, maximumBytes - 16) / (width * 4))
  )
    throw invalid();
  return width * height * 4;
}
/** Compact top-down straight sRGB RGBA8; no image decoder or OS access. */
export function validateClipboardImageItem(item, maximum = maximumBytes) {
  if (!item || typeof item !== 'object' || !(item.rgba instanceof Uint8Array))
    throw invalid();
  if (geometry(item.width, item.height, maximum) !== item.rgba.length)
    throw invalid();
}
export function validateClipboardImageWrite(item, maximum = maximumBytes) {
  validateClipboardImageItem(item, maximum);
  if (maximum < 124 || item.rgba.length > maximum - 124) throw invalid();
}
export function encodeClipboardImageItem(item, maximum = maximumBytes) {
  validateClipboardImageItem(item, maximum);
  const bytes = new Uint8Array(16 + item.rgba.length),
    view = new DataView(bytes.buffer);
  view.setUint16(0, 1);
  view.setUint32(4, item.width);
  view.setUint32(8, item.height);
  view.setUint32(12, item.rgba.length);
  bytes.set(item.rgba, 16);
  return bytes;
}
/** Borrow pixels only after exact independent schema/geometry/quota admission. */
export function decodeClipboardImageItem(bytes, maximum = maximumBytes) {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length < 16 ||
    bytes.length > maximumBytes
  )
    throw invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(0) !== 1 || view.getUint16(2) !== 0) throw invalid();
  const width = view.getUint32(4),
    height = view.getUint32(8),
    count = view.getUint32(12);
  if (count !== bytes.length - 16 || geometry(width, height, maximum) !== count)
    throw invalid();
  return { width, height, rgba: bytes.subarray(16) };
}
/** Fixed PNG signature/IHDR guard before a later browser decoder allocates pixels.
 * This admits only dimensions/header, not an entire PNG or its ancillary chunks.
 * Callers must separately bound the complete Blob and handle decoder refusal.
 */
export function inspectClipboardPngHeader(bytes, maximum = maximumBytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 33) throw invalid();
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (bytes[i] !== signature[i]) throw invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452)
    throw invalid();
  let crc = 0xffffffff;
  for (let i = 12; i < 29; i++) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  if ((crc ^ 0xffffffff) >>> 0 !== view.getUint32(29)) throw invalid();
  const width = view.getUint32(16),
    height = view.getUint32(20),
    depth = bytes[24],
    color = bytes[25];
  const depths =
    color === 0
      ? [1, 2, 4, 8, 16]
      : color === 3
        ? [1, 2, 4, 8]
        : [2, 4, 6].includes(color)
          ? [8, 16]
          : [];
  if (
    !depths.includes(depth) ||
    bytes[26] !== 0 ||
    bytes[27] !== 0 ||
    bytes[28] > 1
  )
    throw invalid();
  return { width, height, rgbaBytes: geometry(width, height, maximum) };
}
