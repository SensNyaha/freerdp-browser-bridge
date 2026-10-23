// Exact known-value scanning, not a heuristic repository/credential detector.
export async function scanSecretStream(
  input,
  patterns,
  maximum = 512 * 1024 * 1024,
) {
  if (
    !Array.isArray(patterns) ||
    patterns.length < 1 ||
    patterns.length > 16 ||
    patterns.some(
      (value) =>
        !Buffer.isBuffer(value) || value.length < 4 || value.length > 8192,
    ) ||
    !Number.isSafeInteger(maximum) ||
    maximum < 1 ||
    maximum > 1024 * 1024 * 1024
  )
    throw new Error('SECRET_SCAN_INPUT');
  const owned = patterns.map((value) => Buffer.from(value));
  const overlap = Math.max(...owned.map((value) => value.length)) - 1;
  let tail = Buffer.alloc(0);
  let bytes = 0;
  try {
    for await (const chunk of input) {
      if (
        !Buffer.isBuffer(chunk) ||
        chunk.length > 65536 ||
        (bytes += chunk.length) > maximum
      )
        throw new Error('SECRET_SCAN_LIMIT');
      const combined = Buffer.concat([tail, chunk]);
      tail.fill(0);
      try {
        if (owned.some((value) => combined.includes(value)))
          throw new Error('SECRET_SCAN_MATCH');
        tail = Buffer.from(
          combined.subarray(Math.max(0, combined.length - overlap)),
        );
      } finally {
        combined.fill(0);
      }
    }
    return { bytes };
  } finally {
    tail.fill(0);
    for (const value of owned) value.fill(0);
  }
}
