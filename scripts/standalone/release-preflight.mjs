import { createHash } from 'node:crypto';
import {
  parseStandaloneReleaseManifest,
  standaloneReleaseNames,
} from './release-artifacts.mjs';
import { standaloneGithubApi } from './release-api.mjs';
import { publicMetadata } from '../github-delivery/publish.mjs';
import { readJson } from '../github-delivery/manifest.mjs';
import { standaloneProductionManifest } from './production-lock.mjs';

const prefix = '/repos/SensNyaha/freerdp-browser-bridge';
export async function standaloneReleasePreflight(
  version,
  {
    api = standaloneGithubApi(),
    download = fetch,
    metadata = publicMetadata,
    root = '.',
  } = {},
) {
  const checksumName =
    'freerdp-bridge-' + version + '-standalone-SHA256SUMS.txt';
  const names = [
    ...standaloneReleaseNames(version, 'win32-x64'),
    ...standaloneReleaseNames(version, 'linux-x64-gnu'),
    checksumName,
    'standalone-manifest.json',
  ];
  const release = await api(prefix + '/releases/tags/v' + version);
  if (
    !release ||
    release.tag_name !== 'v' + version ||
    release.draft !== false ||
    release.prerelease !== false ||
    !Array.isArray(release.assets) ||
    release.assets.length > 64 ||
    new Set(release.assets.map((asset) => asset.name)).size !==
      release.assets.length
  )
    throw new Error('STANDALONE_CORE_RELEASE_REQUIRED');
  const manifestAsset = release.assets.find(
    (asset) => asset.name === 'standalone-manifest.json',
  );
  if (!manifestAsset) {
    if (release.assets.some((asset) => names.includes(asset.name)))
      throw new Error('STANDALONE_RELEASE_PARTIAL_RETRY_ORIGINAL_PUBLISH_JOB');
    const expected = new Map();
    for (const platform of ['win32-x64', 'linux-x64-gnu']) {
      const lock = await readJson(
        root,
        'packaging/standalone/locks/' + platform + '.json',
        1048576,
      );
      standaloneProductionManifest(lock, version, platform);
      for (const [path, value] of Object.entries(lock.packages))
        if (path.startsWith('node_modules/@freerdp-bridge/')) {
          const name = path.slice('node_modules/'.length);
          if (expected.has(name) && expected.get(name) !== value.integrity)
            throw new Error('STANDALONE_RELEASE_LOCKS_DISAGREE');
          expected.set(name, value.integrity);
        }
    }
    for (const [name, integrity] of expected) {
      const actual = await metadata(name, version);
      if (
        actual?.name !== name ||
        actual.version !== version ||
        actual.dist?.integrity !== integrity
      )
        throw new Error('STANDALONE_RELEASE_PUBLIC_DEPENDENCIES_REQUIRED');
    }
    return { alreadyPublished: false };
  }
  if (
    manifestAsset.state !== 'uploaded' ||
    manifestAsset.size < 1 ||
    manifestAsset.size > 65536
  )
    throw new Error('STANDALONE_RELEASE_MANIFEST_READBACK_INVALID');
  const response = await download(
    'https://github.com/SensNyaha/freerdp-browser-bridge/releases/download/v' +
      version +
      '/standalone-manifest.json',
    { redirect: 'follow', signal: AbortSignal.timeout(30000) },
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error('STANDALONE_RELEASE_MANIFEST_READ_FAILED');
  }
  const chunks = [];
  let count = 0;
  for await (const chunk of response.body) {
    if ((count += chunk.length) > 65536)
      throw new Error('STANDALONE_RELEASE_MANIFEST_READ_LIMIT');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks),
    sha256 = createHash('sha256').update(bytes).digest('hex');
  if (
    bytes.length !== manifestAsset.size ||
    manifestAsset.digest !== 'sha256:' + sha256
  )
    throw new Error('STANDALONE_RELEASE_MANIFEST_READBACK_INVALID');
  const manifest = parseStandaloneReleaseManifest(
    JSON.parse(bytes.toString('utf8')),
  );
  if (manifest.version !== version)
    throw new Error('STANDALONE_RELEASE_MANIFEST_READBACK_INVALID');
  const matches = (asset, file) =>
    asset?.state === 'uploaded' &&
    asset.size === file.bytes &&
    asset.digest === 'sha256:' + file.sha256;
  for (const file of manifest.files)
    if (
      !matches(
        release.assets.find((asset) => asset.name === file.name),
        file,
      )
    )
      throw new Error('STANDALONE_RELEASE_ASSET_READBACK_INVALID');
  const checksums =
    manifest.files
      .concat({ name: 'standalone-manifest.json', sha256 })
      .map((file) => file.sha256 + '  ' + file.name)
      .join('\n') + '\n';
  if (
    !matches(
      release.assets.find((asset) => asset.name === checksumName),
      {
        bytes: Buffer.byteLength(checksums),
        sha256: createHash('sha256').update(checksums).digest('hex'),
      },
    )
  )
    throw new Error('STANDALONE_RELEASE_ASSET_READBACK_INVALID');
  const ref = await api(prefix + '/git/ref/tags/v' + version);
  if (
    ref?.object?.type !== 'tag' ||
    !/^[a-f0-9]{40}$/.test(ref.object.sha ?? '')
  )
    throw new Error('STANDALONE_RELEASE_TAG_INVALID');
  const tag = await api(prefix + '/git/tags/' + ref.object.sha);
  if (
    tag?.object?.type !== 'commit' ||
    tag.object.sha !== manifest.sourceCommit
  )
    throw new Error('STANDALONE_RELEASE_TAG_CHANGED');
  return { alreadyPublished: true, sourceCommit: manifest.sourceCommit };
}
