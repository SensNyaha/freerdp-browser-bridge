import { createHash } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { tarManifest } from '../github-delivery/manifest.mjs';
import { readStandalonePayloadFile } from './payload.mjs';
import { standaloneProductionManifest } from './production-lock.mjs';

const invalid = () => new Error('STANDALONE_CANDIDATE_ARCHIVE_INVALID');

/** Local prepublication bytes must equal the already pinned production lock. */
export async function verifiedStandaloneCandidateArchives(
  lock,
  version,
  platform,
  directory,
  { readManifest = tarManifest } = {},
) {
  standaloneProductionManifest(lock, version, platform);
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw invalid();
  const root = await realpath(directory);
  const allowed = new Set([
    'api',
    'config',
    'node',
    'protocol',
    'runtime-' + platform,
  ]);
  const result = [];
  for (const [path, entry] of Object.entries(lock.packages)) {
    const prefix = 'node_modules/@freerdp-bridge/';
    if (!path.startsWith(prefix)) continue;
    const suffix = path.slice(prefix.length);
    if (!allowed.delete(suffix)) throw invalid();
    const name = '@freerdp-bridge/' + suffix;
    const archive = join(
      root,
      'freerdp-bridge-' + suffix + '-' + version + '.tgz',
    );
    const bytes = await readStandalonePayloadFile(archive, 134217728);
    const integrity =
      'sha512-' + createHash('sha512').update(bytes).digest('base64');
    if (integrity !== entry.integrity) throw invalid();
    let metadata;
    try {
      metadata = await readManifest(archive);
    } catch {
      throw invalid();
    }
    if (
      metadata?.name !== name ||
      metadata.version !== version ||
      metadata.license !== entry.license
    )
      throw invalid();
    for (const field of [
      'dependencies',
      'optionalDependencies',
      'peerDependencies',
      'peerDependenciesMeta',
      'engines',
      'os',
      'cpu',
      'libc',
      'bin',
    ]) {
      if (!isDeepStrictEqual(metadata[field], entry[field])) throw invalid();
    }
    result.push({ name, version, archive, bytes: bytes.length, integrity });
  }
  if (allowed.size || result.length !== 5) throw invalid();
  return result.sort((left, right) =>
    left.name.localeCompare(right.name, 'en'),
  );
}
