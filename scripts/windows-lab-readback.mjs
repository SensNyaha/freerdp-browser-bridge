// Lab-only equality assertion: never expose remote content in a diagnostic.
export function requireWindowsLabReadback(result, expected) {
  const text = result?.text;
  let bytes;
  try {
    if (typeof expected !== 'string' || Buffer.byteLength(expected) > 1024)
      throw new Error();
    bytes = Buffer.from(expected, 'utf8');
    if (
      result?.status !== 'accepted' ||
      !Buffer.isBuffer(text) ||
      !text.equals(bytes)
    )
      throw new Error();
  } catch {
    throw new Error('LAB_APPLICATION_READBACK_MISMATCH');
  } finally {
    if (Buffer.isBuffer(text)) text.fill(0);
    bytes?.fill(0);
  }
}
