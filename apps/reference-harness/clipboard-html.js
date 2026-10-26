export const CLIPBOARD_HTML_ITEM_METADATA_BYTES = 32;
const maximumBytes = 16777216;
const invalid = () => new Error('Invalid clipboard HTML item');

/** Strict string admission before TextEncoder can replace lone surrogates. */
export function measureClipboardHtmlString(text, maximum = maximumBytes) {
  if (
    typeof text !== 'string' ||
    !Number.isInteger(maximum) ||
    maximum < 0 ||
    maximum > maximumBytes ||
    text.length > maximum
  )
    throw invalid();
  let bytes = 0;
  for (let i = 0; i < text.length; ++i) {
    const c = text.charCodeAt(i);
    if (!c) throw invalid();
    if (c >= 0xd800 && c <= 0xdbff) {
      const low = text.charCodeAt(++i);
      if (!(low >= 0xdc00 && low <= 0xdfff)) throw invalid();
      bytes += 4;
    } else if (c >= 0xdc00 && c <= 0xdfff) throw invalid();
    else bytes += c < 0x80 ? 1 : c < 0x800 ? 2 : 3;
    if (bytes > maximum) throw invalid();
  }
  return bytes;
}
export function encodeClipboardHtmlString(text, maximum = maximumBytes) {
  const bytes = new Uint8Array(measureClipboardHtmlString(text, maximum));
  try {
    const result = new TextEncoder().encodeInto(text, bytes);
    if (result.read !== text.length || result.written !== bytes.length)
      throw invalid();
    return bytes;
  } catch {
    bytes.fill(0);
    throw invalid();
  }
}

// Strict UTF-8/no-NUL inspection without a decoded string or allocation. Text
// additionally measures the normalized, terminated CF_UNICODETEXT quota.
function inspect(bytes, maximum, text = false) {
  if (!(bytes instanceof Uint8Array) || bytes.length > maximum) throw invalid();
  let wire = 2;
  for (let i = 0; i < bytes.length; ) {
    const a = bytes[i];
    let width = 1;
    if (a >= 0xc2 && a <= 0xdf) width = 2;
    else if (a >= 0xe0 && a <= 0xef) width = 3;
    else if (a >= 0xf0 && a <= 0xf4) width = 4;
    else if (!a || a >= 0x80) throw invalid();
    if (i + width > bytes.length) throw invalid();
    for (let n = 1; n < width; ++n)
      if ((bytes[i + n] & 0xc0) !== 0x80) throw invalid();
    if (
      (a === 0xe0 && bytes[i + 1] < 0xa0) ||
      (a === 0xed && bytes[i + 1] > 0x9f) ||
      (a === 0xf0 && bytes[i + 1] < 0x90) ||
      (a === 0xf4 && bytes[i + 1] > 0x8f)
    )
      throw invalid();
    if (text) {
      if (a === 13 || a === 10) {
        wire += 4;
        if (a === 13 && bytes[i + 1] === 10) ++i;
      } else wire += width === 4 ? 4 : 2;
      if (wire > maximum) throw invalid();
    }
    i += width;
  }
  if (text && wire > maximum) throw invalid();
}
const boundary = (bytes, offset) =>
  offset === bytes.length || (bytes[offset] & 0xc0) !== 0x80;

/** Borrowed immutable bytes. This codec never parses HTML or accesses a DOM. */
export function validateClipboardHtmlItem(item, maximum = maximumBytes) {
  if (!item || typeof item !== 'object') throw invalid();
  const { body, text } = item;
  if (
    !(body instanceof Uint8Array) ||
    (text !== undefined && !(text instanceof Uint8Array)) ||
    typeof item.context !== 'boolean' ||
    typeof item.selection !== 'boolean' ||
    !Number.isInteger(maximum) ||
    maximum < 1 ||
    maximum > maximumBytes ||
    body.length + (text?.length ?? 0) > maximum ||
    body.length + (text?.length ?? 0) > maximumBytes - 32 ||
    [
      item.fragmentOffset,
      item.fragmentBytes,
      item.selectionOffset,
      item.selectionBytes,
    ].some((n) => !Number.isInteger(n) || n < 0 || n > body.length) ||
    item.fragmentOffset + item.fragmentBytes > body.length ||
    (!item.context &&
      (item.fragmentOffset !== 0 || item.fragmentBytes !== body.length)) ||
    (item.context && !body.length) ||
    (!item.selection &&
      (item.selectionOffset !== 0 || item.selectionBytes !== 0)) ||
    (item.selection &&
      (item.selectionOffset < item.fragmentOffset ||
        item.selectionOffset + item.selectionBytes >
          item.fragmentOffset + item.fragmentBytes)) ||
    !boundary(body, item.fragmentOffset) ||
    !boundary(body, item.fragmentOffset + item.fragmentBytes) ||
    (item.selection &&
      (!boundary(body, item.selectionOffset) ||
        !boundary(body, item.selectionOffset + item.selectionBytes)))
  )
    throw invalid();
  inspect(body, maximum);
  if (text !== undefined) inspect(text, maximum, true);
}

export function validateClipboardHtmlWrite(item, maximum = maximumBytes) {
  validateClipboardHtmlItem(item, maximum);
  if (
    item.context ||
    item.selection ||
    maximum < 170 ||
    item.body.length > maximum - 170
  )
    throw invalid();
  if (item.text !== undefined)
    inspect(item.text, maximum - 170 - item.body.length, true);
}

/** Validate before allocating one independent encoded item. */
export function encodeClipboardHtmlItem(item, maximum = maximumBytes) {
  validateClipboardHtmlItem(item, maximum);
  const bytes = new Uint8Array(
    32 + item.body.length + (item.text?.length ?? 0),
  );
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 1);
  view.setUint16(
    2,
    Number(item.text !== undefined) |
      (Number(item.context) << 1) |
      (Number(item.selection) << 2),
  );
  view.setUint32(4, item.body.length);
  view.setUint32(8, item.text?.length ?? 0);
  view.setUint32(12, item.fragmentOffset);
  view.setUint32(16, item.fragmentBytes);
  view.setUint32(20, item.selectionOffset);
  view.setUint32(24, item.selectionBytes);
  bytes.set(item.body, 32);
  if (item.text !== undefined) bytes.set(item.text, 32 + item.body.length);
  return bytes;
}

/** Validate fixed metadata/lengths before inspecting borrowed body/text views. */
export function decodeClipboardHtmlItem(bytes, maximum = maximumBytes) {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length < 32 ||
    bytes.length > maximumBytes ||
    !Number.isInteger(maximum) ||
    maximum < 1 ||
    maximum > maximumBytes ||
    bytes.length - 32 > maximum
  )
    throw invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const flags = view.getUint16(2),
    body = view.getUint32(4),
    text = view.getUint32(8);
  const content = bytes.length - 32;
  if (
    view.getUint16(0) !== 1 ||
    flags > 7 ||
    view.getUint32(28) !== 0 ||
    body > content ||
    text !== content - body ||
    (!(flags & 1) && text !== 0)
  )
    throw invalid();
  const item = {
    body: bytes.subarray(32, 32 + body),
    fragmentOffset: view.getUint32(12),
    fragmentBytes: view.getUint32(16),
    selectionOffset: view.getUint32(20),
    selectionBytes: view.getUint32(24),
    context: Boolean(flags & 2),
    selection: Boolean(flags & 4),
    ...(flags & 1 ? { text: bytes.subarray(32 + body) } : {}),
  };
  validateClipboardHtmlItem(item, maximum);
  return item;
}
