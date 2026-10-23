const invalid = () => new Error('Invalid clipboard text');
/** Measure strict scalars and both quotas before encoding; no replacement of lone surrogates. */
export function measureClipboardText(text, maximum) {
  if (
    typeof text !== 'string' ||
    !Number.isInteger(maximum) ||
    maximum < 1 ||
    maximum > 16777216 ||
    text.length > maximum
  )
    throw invalid();
  let bytes = 0,
    wireBytes = 2;
  for (let i = 0; i < text.length; ++i) {
    const c = text.charCodeAt(i);
    if (!c) throw invalid();
    if (c >= 0xd800 && c <= 0xdbff) {
      const low = text.charCodeAt(++i);
      if (!(low >= 0xdc00 && low <= 0xdfff)) throw invalid();
      bytes += 4;
      wireBytes += 4;
    } else if (c >= 0xdc00 && c <= 0xdfff) throw invalid();
    else if (c === 13 || c === 10) {
      ++bytes;
      wireBytes += 4;
      if (c === 13 && text.charCodeAt(i + 1) === 10) {
        ++i;
        ++bytes;
      }
    } else {
      bytes += c < 0x80 ? 1 : c < 0x800 ? 2 : 3;
      wireBytes += 2;
    }
    if (bytes > maximum || wireBytes > maximum) throw invalid();
  }
  if (wireBytes > maximum) throw invalid();
  return bytes;
}
export function encodeClipboardText(text, maximum) {
  const bytes = new Uint8Array(measureClipboardText(text, maximum));
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
export function decodeClipboardText(bytes, maximum) {
  if (!(bytes instanceof Uint8Array) || bytes.length > maximum) throw invalid();
  // Preserve an actual leading U+FEFF scalar; the protocol has no BOM marker.
  const text = new TextDecoder('utf-8', {
    fatal: true,
    ignoreBOM: true,
  }).decode(bytes);
  if (measureClipboardText(text, maximum) !== bytes.length) throw invalid();
  return text;
}
