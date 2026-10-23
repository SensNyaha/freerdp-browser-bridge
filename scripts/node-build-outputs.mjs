/** Verify declared compiled library exports and fixed Node CLI entry points. */
export function nodeBuildOutputs(manifest) {
  const paths = new Set();
  let entries = 0;
  const invalid = () => {
    throw new Error('NODE_BUILD_OUTPUT_CONTRACT_INVALID');
  };
  function add(value) {
    if (
      typeof value !== 'string' ||
      !/^\.\/dist\/(?:[A-Za-z0-9_-]+\/){0,8}[A-Za-z0-9_-]+(?:\.d\.ts|\.js)$/.test(
        value,
      ) ||
      value.length > 220
    )
      invalid();
    paths.add(value.slice(2));
  }
  function visit(value, depth = 0) {
    if (++entries > 128 || depth > 8) invalid();
    if (typeof value === 'string') {
      add(value);
      return;
    }
    if (!value || Array.isArray(value) || typeof value !== 'object') invalid();
    for (const entry of Object.values(value)) visit(entry, depth + 1);
  }
  if (manifest?.exports !== undefined) visit(manifest.exports);
  for (const field of ['main', 'types'])
    if (manifest?.[field] !== undefined) add(manifest[field]);
  if (manifest?.scripts?.start !== undefined) {
    const match = /^node (dist\/[A-Za-z0-9_-]+\.js)$/.exec(
      manifest.scripts.start,
    );
    if (!match) invalid();
    add('./' + match[1]);
  }
  if (!paths.size) invalid();
  return [...paths].sort();
}
