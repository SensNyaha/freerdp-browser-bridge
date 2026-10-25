import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { standaloneProductionManifest } from './production-lock.mjs';
import { readStandalonePayloadFile } from './payload.mjs';
import { tarManifest, isReleaseVersion } from '../github-delivery/manifest.mjs';

const fields = [
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
  'peerDependenciesMeta',
  'engines',
  'os',
  'cpu',
  'libc',
  'license',
  'bin',
];
const refuse = () =>
  new Error('STANDALONE_LOCK_ADVANCE_REQUIRES_GRAPH_RESOLUTION');
/** Version-only core graph advance. External graph drift requires a fresh lock. */
export function advanceStandaloneLock(lock, version, platform, archives) {
  standaloneProductionManifest(lock, lock.version, platform);
  if (
    !isReleaseVersion(version) ||
    !Array.isArray(archives) ||
    archives.length !== 5
  )
    throw refuse();
  const result = structuredClone(lock),
    previous = lock.version;
  result.version = version;
  result.packages[''].version = version;
  for (const name of Object.keys(result.packages[''].dependencies))
    if (name.startsWith('@freerdp-bridge/'))
      result.packages[''].dependencies[name] = version;
  const remaining = new Map(
    archives.map((value) => [value?.metadata?.name, value]),
  );
  if (remaining.size !== 5) throw refuse();
  const allowed = new Set([
    'api',
    'config',
    'node',
    'protocol',
    'runtime-' + platform,
  ]);
  for (const [path, entry] of Object.entries(result.packages)) {
    const prefix = 'node_modules/@freerdp-bridge/';
    if (!path.startsWith(prefix)) continue;
    const suffix = path.slice(prefix.length),
      name = '@freerdp-bridge/' + suffix;
    if (!allowed.delete(suffix)) throw refuse();
    const archive = remaining.get(name);
    remaining.delete(name);
    if (
      !archive ||
      archive.metadata.version !== version ||
      !/^sha512-[A-Za-z0-9+/]{86}==$/.test(archive.integrity ?? '')
    )
      throw refuse();
    for (const field of [
      'dependencies',
      'optionalDependencies',
      'peerDependencies',
    ])
      for (const dependency of Object.keys(entry[field] ?? {}))
        if (dependency.startsWith('@freerdp-bridge/')) {
          if (entry[field][dependency] !== previous) throw refuse();
          entry[field][dependency] = version;
        }
    for (const field of fields)
      if (!isDeepStrictEqual(entry[field], archive.metadata[field]))
        throw refuse();
    entry.version = version;
    entry.integrity = archive.integrity;
    entry.resolved =
      'https://registry.npmjs.org/' +
      name +
      '/-/' +
      suffix +
      '-' +
      version +
      '.tgz';
  }
  if (allowed.size || remaining.size) throw refuse();
  standaloneProductionManifest(result, version, platform);
  return result;
}
export async function advanceStandaloneLockFromArchives(
  lock,
  version,
  platform,
  directory,
) {
  const archives = [];
  for (const suffix of [
    'api',
    'config',
    'node',
    'protocol',
    'runtime-' + platform,
  ]) {
    const path = join(
      directory,
      'freerdp-bridge-' + suffix + '-' + version + '.tgz',
    );
    const bytes = await readStandalonePayloadFile(path, 134217728);
    archives.push({
      metadata: tarManifest(path),
      integrity:
        'sha512-' + createHash('sha512').update(bytes).digest('base64'),
    });
  }
  return advanceStandaloneLock(lock, version, platform, archives);
}
