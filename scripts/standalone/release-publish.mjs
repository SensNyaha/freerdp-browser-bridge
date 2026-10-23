import { createReadStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashFile } from '../github-delivery/manifest.mjs';
import { readStandaloneReleaseReceipts } from './release-artifacts.mjs';
import { standaloneGithubApi } from './release-api.mjs';

const prefix = '/repos/SensNyaha/freerdp-browser-bridge';
export async function publishStandaloneRelease({
  directory,
  environment = process.env,
  api = standaloneGithubApi(environment.GITHUB_TOKEN),
}) {
  if (
    environment.GITHUB_ACTIONS !== 'true' ||
    environment.GITHUB_REPOSITORY !== 'SensNyaha/freerdp-browser-bridge' ||
    !['refs/heads/main', 'refs/heads/master'].includes(
      environment.GITHUB_REF,
    ) ||
    !/^[a-f0-9]{40}$/.test(environment.GITHUB_SHA ?? '')
  )
    throw new Error('STANDALONE_RELEASE_PUBLISH_CONTEXT_REFUSED');
  const manifest = await readStandaloneReleaseReceipts(directory);
  if (
    Number(manifest.version.split('.')[2]) < 5 ||
    manifest.sourceCommit !== environment.GITHUB_SHA
  )
    throw new Error('STANDALONE_RELEASE_PUBLISH_SOURCE_REFUSED');
  const tag = 'v' + manifest.version;
  const ref = await api(prefix + '/git/ref/tags/' + tag);
  if (
    ref?.object?.type !== 'tag' ||
    !/^[a-f0-9]{40}$/.test(ref.object.sha ?? '')
  )
    throw new Error('STANDALONE_RELEASE_TAG_INVALID');
  const annotated = await api(prefix + '/git/tags/' + ref.object.sha);
  if (
    annotated?.object?.type !== 'commit' ||
    annotated.object.sha !== manifest.sourceCommit
  )
    throw new Error('STANDALONE_RELEASE_TAG_CHANGED');
  const endpoint = prefix + '/releases/tags/' + tag;
  let release = await api(endpoint);
  const validRelease = (value) => {
    if (
      !value ||
      value.tag_name !== tag ||
      value.draft !== false ||
      value.prerelease !== false ||
      !Number.isSafeInteger(value.id) ||
      !Array.isArray(value.assets) ||
      value.assets.length > 64 ||
      new Set(value.assets.map((asset) => asset.name)).size !==
        value.assets.length
    )
      throw new Error('STANDALONE_CORE_RELEASE_REQUIRED');
  };
  validRelease(release);
  await writeFile(
    join(directory, 'standalone-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  const manifestFile = {
    name: 'standalone-manifest.json',
    ...(await hashFile(directory, 'standalone-manifest.json', 65536)),
  };
  const checksums =
    manifest.files
      .concat(manifestFile)
      .map((file) => file.sha256 + '  ' + file.name)
      .join('\n') + '\n';
  const checksumName =
    'freerdp-bridge-' + manifest.version + '-standalone-SHA256SUMS.txt';
  await writeFile(join(directory, checksumName), checksums);
  const files = [
    ...manifest.files,
    { name: checksumName, ...(await hashFile(directory, checksumName, 65536)) },
    manifestFile,
  ];
  const matches = (asset, file) =>
    asset.state === 'uploaded' &&
    asset.size === file.bytes &&
    asset.digest === 'sha256:' + file.sha256;
  // Check all conflicts before any write. Preserve core assets and tags; never
  // retry an uncertain upload in this invocation. Publish the manifest last.
  for (const file of files) {
    const old = release.assets.find((asset) => asset.name === file.name);
    if (old && !matches(old, file))
      throw new Error('STANDALONE_RELEASE_ASSET_CONFLICT');
  }
  let uploaded = 0;
  for (const file of files) {
    if (release.assets.some((asset) => asset.name === file.name)) continue;
    const actual = await hashFile(directory, file.name, 536870912);
    if (actual.sha256 !== file.sha256 || actual.bytes !== file.bytes)
      throw new Error('STANDALONE_RELEASE_LOCAL_ASSET_CHANGED');
    const asset = await api(
      'https://uploads.github.com' +
        prefix +
        '/releases/' +
        release.id +
        '/assets?name=' +
        encodeURIComponent(file.name),
      {
        method: 'POST',
        body: createReadStream(join(directory, file.name)),
        bytes: file.bytes,
      },
    );
    if (!matches(asset, file))
      throw new Error('STANDALONE_RELEASE_UPLOAD_UNCONFIRMED');
    uploaded++;
  }
  release = await api(endpoint);
  validRelease(release);
  for (const file of files)
    if (
      !matches(
        release.assets.find((asset) => asset.name === file.name) ?? {},
        file,
      )
    )
      throw new Error('STANDALONE_RELEASE_READBACK_FAILED');
  return {
    version: manifest.version,
    sourceCommit: manifest.sourceCommit,
    assets: files.length,
    uploaded,
    publicExact: true,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (process.argv.length !== 3)
      throw new Error('STANDALONE_RELEASE_PUBLISH_USAGE');
    console.log(
      JSON.stringify(
        await publishStandaloneRelease({ directory: resolve(process.argv[2]) }),
      ),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        code: /^[A-Z][A-Z0-9_]{1,63}$/.test(error?.message ?? '')
          ? error.message
          : 'STANDALONE_RELEASE_PUBLISH_FAILED',
      }),
    );
    process.exitCode = 1;
  }
}
