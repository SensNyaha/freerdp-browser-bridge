/** Only a complete versioned code-owned numeric record; retain no raw stderr. */
export function audioNegotiationDiagnostics(bytes) {
  if (!Buffer.isBuffer(bytes)) return undefined;
  const marker = bytes.indexOf(Buffer.from('bridge.audio.negotiation v=1 '));
  if (marker < 0) return undefined;
  const match = bytes
    .subarray(marker, Math.min(bytes.length, marker + 384))
    .toString('ascii')
    .match(
      /^bridge\.audio\.negotiation v=1 server=(\d{1,5}) client=(\d{1,5}) training=(\d{1,20}) waves=(\d{1,20}) writes=(\d{1,20}) completed=(\d{1,20}) cancelled=(\d{1,20}) failures=(\d{1,20})\r?\n/,
    );
  if (
    !match ||
    match
      .slice(1)
      .some(
        (value, index) =>
          BigInt(value) > (index < 2 ? 65535n : 0xffffffffffffffffn),
      )
  )
    return undefined;
  return Object.fromEntries(
    [
      'serverFormats',
      'clientFormats',
      'training',
      'waves',
      'writes',
      'completed',
      'cancelled',
      'failures',
    ].map((key, index) => [key, match[index + 1]]),
  );
}
