import { ProtocolError } from './index.js';
import { CLIPBOARD_MAX_TEXT_BYTES } from './clipboard.js';

export const CLIPBOARD_IMAGE_ITEM_METADATA_BYTES = 16;
export const CLIPBOARD_IMAGE_DIBV5_HEADER_BYTES = 124;
export interface ClipboardImageItem {
  width: number;
  height: number;
  rgba: Buffer;
}
function validateSize(
  width: number,
  height: number,
  actual: number,
  maximum: number,
): void {
  if (
    !Number.isInteger(maximum) ||
    maximum < 1 ||
    maximum > CLIPBOARD_MAX_TEXT_BYTES ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 0x7fffffff ||
    height > 0x7fffffff ||
    actual > maximum ||
    actual > CLIPBOARD_MAX_TEXT_BYTES - CLIPBOARD_IMAGE_ITEM_METADATA_BYTES ||
    // Bound multiplication before it can exceed JavaScript's exact integers.
    height > Math.floor(maximum / (width * 4)) ||
    width * height * 4 !== actual
  )
    throw new ProtocolError();
}
/** Validate compact top-down straight sRGB RGBA8 before retaining/copying. */
export function validateClipboardImageItem(
  item: ClipboardImageItem,
  maximum = CLIPBOARD_MAX_TEXT_BYTES,
): void {
  if (item === null || typeof item !== 'object' || !Buffer.isBuffer(item.rgba))
    throw new ProtocolError();
  validateSize(item.width, item.height, item.rgba.length, maximum);
}
/** Additionally admit the complete native DIBV5 representation before copying. */
export function validateClipboardImageWrite(
  item: ClipboardImageItem,
  maximum = CLIPBOARD_MAX_TEXT_BYTES,
): void {
  validateClipboardImageItem(item, maximum);
  if (
    maximum < CLIPBOARD_IMAGE_DIBV5_HEADER_BYTES ||
    item.rgba.length > maximum - CLIPBOARD_IMAGE_DIBV5_HEADER_BYTES
  )
    throw new ProtocolError();
}
export function encodeClipboardImageItem(
  item: ClipboardImageItem,
  maximum = CLIPBOARD_MAX_TEXT_BYTES,
): Buffer {
  validateClipboardImageItem(item, maximum);
  const bytes = Buffer.alloc(
    CLIPBOARD_IMAGE_ITEM_METADATA_BYTES + item.rgba.length,
  );
  bytes.writeUInt16BE(1, 0);
  bytes.writeUInt32BE(item.width, 4);
  bytes.writeUInt32BE(item.height, 8);
  bytes.writeUInt32BE(item.rgba.length, 12);
  item.rgba.copy(bytes, CLIPBOARD_IMAGE_ITEM_METADATA_BYTES);
  return bytes;
}
/** Borrow pixels after exact header/length/geometry admission, without decoding images. */
export function decodeClipboardImageItem(
  bytes: Buffer,
  maximum = CLIPBOARD_MAX_TEXT_BYTES,
): ClipboardImageItem {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length < CLIPBOARD_IMAGE_ITEM_METADATA_BYTES ||
    bytes.length > CLIPBOARD_MAX_TEXT_BYTES ||
    bytes.readUInt16BE(0) !== 1 ||
    bytes.readUInt16BE(2) !== 0
  )
    throw new ProtocolError();
  const width = bytes.readUInt32BE(4),
    height = bytes.readUInt32BE(8),
    count = bytes.readUInt32BE(12);
  if (count !== bytes.length - CLIPBOARD_IMAGE_ITEM_METADATA_BYTES)
    throw new ProtocolError();
  validateSize(width, height, count, maximum);
  return {
    width,
    height,
    rgba: bytes.subarray(CLIPBOARD_IMAGE_ITEM_METADATA_BYTES),
  };
}
