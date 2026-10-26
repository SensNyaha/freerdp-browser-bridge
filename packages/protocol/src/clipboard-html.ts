import { isUtf8 } from 'node:buffer';
import { ProtocolError } from './index.js';
import {
  CLIPBOARD_MAX_TEXT_BYTES,
  validateClipboardText,
} from './clipboard.js';

export const CLIPBOARD_HTML_ITEM_METADATA_BYTES = 32;
export interface ClipboardHtmlItem {
  body: Buffer;
  fragmentOffset: number;
  fragmentBytes: number;
  selectionOffset: number;
  selectionBytes: number;
  context: boolean;
  selection: boolean;
  text?: Buffer;
}
function boundary(bytes: Buffer, offset: number): boolean {
  return offset === bytes.length || (bytes[offset]! & 0xc0) !== 0x80;
}
/** Validate borrowed immutable content before retaining or allocating an item. */
export function validateClipboardHtmlItem(
  item: ClipboardHtmlItem,
  maximum = CLIPBOARD_MAX_TEXT_BYTES,
): void {
  if (item === null || typeof item !== 'object') throw new ProtocolError();
  const { body, text } = item;
  if (
    !Buffer.isBuffer(body) ||
    (text !== undefined && !Buffer.isBuffer(text)) ||
    typeof item.context !== 'boolean' ||
    typeof item.selection !== 'boolean' ||
    !Number.isInteger(maximum) ||
    maximum < 1 ||
    maximum > CLIPBOARD_MAX_TEXT_BYTES ||
    body.length + (text?.length ?? 0) > maximum ||
    body.length + (text?.length ?? 0) >
      CLIPBOARD_MAX_TEXT_BYTES - CLIPBOARD_HTML_ITEM_METADATA_BYTES ||
    [
      item.fragmentOffset,
      item.fragmentBytes,
      item.selectionOffset,
      item.selectionBytes,
    ].some(
      (value) => !Number.isInteger(value) || value < 0 || value > body.length,
    ) ||
    item.fragmentOffset + item.fragmentBytes > body.length ||
    (!item.context &&
      (item.fragmentOffset !== 0 || item.fragmentBytes !== body.length)) ||
    (item.context && body.length === 0) ||
    (!item.selection &&
      (item.selectionOffset !== 0 || item.selectionBytes !== 0)) ||
    (item.selection &&
      (item.selectionOffset < item.fragmentOffset ||
        item.selectionOffset + item.selectionBytes >
          item.fragmentOffset + item.fragmentBytes)) ||
    !isUtf8(body) ||
    body.includes(0) ||
    !boundary(body, item.fragmentOffset) ||
    !boundary(body, item.fragmentOffset + item.fragmentBytes) ||
    (item.selection &&
      (!boundary(body, item.selectionOffset) ||
        !boundary(body, item.selectionOffset + item.selectionBytes)))
  )
    throw new ProtocolError();
  if (text !== undefined) validateClipboardText(text, maximum);
}
export function encodeClipboardHtmlItem(
  item: ClipboardHtmlItem,
  maximum = CLIPBOARD_MAX_TEXT_BYTES,
): Buffer {
  validateClipboardHtmlItem(item, maximum);
  const bytes = Buffer.alloc(
    CLIPBOARD_HTML_ITEM_METADATA_BYTES +
      item.body.length +
      (item.text?.length ?? 0),
  );
  bytes.writeUInt16BE(1, 0);
  bytes.writeUInt16BE(
    Number(item.text !== undefined) |
      (Number(item.context) << 1) |
      (Number(item.selection) << 2),
    2,
  );
  bytes.writeUInt32BE(item.body.length, 4);
  bytes.writeUInt32BE(item.text?.length ?? 0, 8);
  bytes.writeUInt32BE(item.fragmentOffset, 12);
  bytes.writeUInt32BE(item.fragmentBytes, 16);
  bytes.writeUInt32BE(item.selectionOffset, 20);
  bytes.writeUInt32BE(item.selectionBytes, 24);
  item.body.copy(bytes, CLIPBOARD_HTML_ITEM_METADATA_BYTES);
  item.text?.copy(bytes, CLIPBOARD_HTML_ITEM_METADATA_BYTES + item.body.length);
  return bytes;
}
/** Admit an outgoing fragment and both actual RDP representations before copying. */
export function validateClipboardHtmlWrite(
  item: ClipboardHtmlItem,
  maximum = CLIPBOARD_MAX_TEXT_BYTES,
): void {
  validateClipboardHtmlItem(item, maximum);
  if (
    item.context ||
    item.selection ||
    maximum < 170 ||
    item.body.length > maximum - 170
  )
    throw new ProtocolError();
  if (item.text !== undefined)
    validateClipboardText(item.text, maximum - 170 - item.body.length);
}
/** Body and optional text borrow the packet; identity/capability are outer checks. */
export function decodeClipboardHtmlItem(
  bytes: Buffer,
  maximum = CLIPBOARD_MAX_TEXT_BYTES,
): ClipboardHtmlItem {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length < CLIPBOARD_HTML_ITEM_METADATA_BYTES ||
    bytes.length > CLIPBOARD_MAX_TEXT_BYTES ||
    !Number.isInteger(maximum) ||
    maximum < 1 ||
    maximum > CLIPBOARD_MAX_TEXT_BYTES ||
    bytes.length - CLIPBOARD_HTML_ITEM_METADATA_BYTES > maximum ||
    bytes.readUInt16BE(0) !== 1 ||
    bytes.readUInt16BE(2) > 7 ||
    bytes.readUInt32BE(28) !== 0
  )
    throw new ProtocolError();
  const flags = bytes.readUInt16BE(2),
    body = bytes.readUInt32BE(4),
    text = bytes.readUInt32BE(8);
  const content = bytes.length - CLIPBOARD_HTML_ITEM_METADATA_BYTES;
  if (body > content || text !== content - body || (!(flags & 1) && text !== 0))
    throw new ProtocolError();
  const item: ClipboardHtmlItem = {
    body: bytes.subarray(
      CLIPBOARD_HTML_ITEM_METADATA_BYTES,
      CLIPBOARD_HTML_ITEM_METADATA_BYTES + body,
    ),
    fragmentOffset: bytes.readUInt32BE(12),
    fragmentBytes: bytes.readUInt32BE(16),
    selectionOffset: bytes.readUInt32BE(20),
    selectionBytes: bytes.readUInt32BE(24),
    context: Boolean(flags & 2),
    selection: Boolean(flags & 4),
    ...(flags & 1
      ? { text: bytes.subarray(CLIPBOARD_HTML_ITEM_METADATA_BYTES + body) }
      : {}),
  };
  validateClipboardHtmlItem(item, maximum);
  return item;
}
