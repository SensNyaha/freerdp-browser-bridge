import { createHash } from 'node:crypto';

const invalid = () => new Error('SBOM_IMAGE_INVENTORY');
const digest = (value) =>
  'sha256:' + createHash('sha256').update(value).digest('hex');
const isDigest = (value) => /^sha256:[a-f0-9]{64}$/.test(value ?? '');

export function imageReference(value) {
  if (!/^freerdp-bridge-service(?::[a-zA-Z0-9_.-]{1,64})?$/.test(value ?? ''))
    throw new Error('SBOM_IMAGE_ARGUMENT');
  return value;
}

export function imageInspection(records) {
  if (
    !Array.isArray(records) ||
    records.length !== 1 ||
    !isDigest(records[0]?.Id) ||
    records[0].Os !== 'linux' ||
    records[0].Architecture !== 'amd64' ||
    !Number.isSafeInteger(records[0].Size) ||
    records[0].Size <= 0 ||
    records[0].Size > 256 * 1024 * 1024 ||
    !Array.isArray(records[0].RootFS?.Layers) ||
    records[0].RootFS.Layers.length > 64 ||
    !records[0].RootFS.Layers.every(isDigest)
  )
    throw new Error('SBOM_IMAGE_IDENTITY');
  return records[0];
}

// Docker may expose either a config digest or an OCI index digest as .Id.
// Follow only digest-verified Linux/amd64 descriptors, never archive paths.
export async function imageConfig(imageId, loadBlob) {
  let next = imageId;
  for (let depth = 0; depth < 4; ++depth) {
    if (!isDigest(next)) throw invalid();
    const bytes = await loadBlob(next);
    if (
      !Buffer.isBuffer(bytes) ||
      bytes.length > 65536 ||
      digest(bytes) !== next
    )
      throw invalid();
    const value = JSON.parse(bytes);
    if (value.rootfs && value.architecture === 'amd64' && value.os === 'linux')
      return { digest: next, value };
    if (Array.isArray(value.manifests)) {
      const matches = value.manifests.filter(
        (item) =>
          item.platform?.os === 'linux' &&
          item.platform?.architecture === 'amd64',
      );
      if (matches.length !== 1) throw invalid();
      next = matches[0].digest;
    } else next = value.config?.digest;
  }
  throw invalid();
}

export function imageInventory(inspected, config, source) {
  if (
    source?.source?.type !== 'image' ||
    source.source.metadata?.imageID !== config.digest ||
    source.source.version !== inspected.Id ||
    JSON.stringify(config.value.rootfs?.diff_ids) !==
      JSON.stringify(inspected.RootFS.Layers) ||
    source.distro?.id !== 'debian' ||
    !Array.isArray(source.artifacts) ||
    source.artifacts.length > 4096 ||
    !source.artifacts.some(
      (pkg) =>
        pkg.name === 'node' &&
        /^24\.[0-9]+\.[0-9]+$/.test(pkg.version) &&
        pkg.type === 'binary',
    ) ||
    !source.artifacts.some((pkg) => pkg.type === 'deb')
  )
    throw invalid();
  const types = {};
  for (const type of ['deb', 'npm', 'binary'])
    types[type] = source.artifacts.filter((pkg) => pkg.type === type).length;
  return types;
}
