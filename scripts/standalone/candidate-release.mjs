import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  lstat,
  realpath,
  open,
  unlink,
  appendFile,
} from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readStandalonePayloadFile } from './payload.mjs';
import { standaloneProductionManifest } from './production-lock.mjs';
import { verifiedStandaloneCandidateArchives } from './candidate-archives.mjs';
import { standaloneGithubApi } from './release-api.mjs';
import { productVersion } from '../product-version.mjs';

const prefix = '/repos/SensNyaha/freerdp-browser-bridge';
const refuse = () => new Error('STANDALONE_CANDIDATE_RELEASE_INVALID');
export function standaloneCandidatePointer(value, version) {
  if (
    !value ||
    Object.keys(value).sort().join(',') !== 'schema,sourceCommit,tag,version' ||
    value.schema !== 1 ||
    value.version !== version ||
    !/^0\.2\.(?:0|[1-9][0-9]{0,5})$/.test(version ?? '') ||
    !/^[a-f0-9]{40}$/.test(value.sourceCommit ?? '') ||
    value.tag !==
      'standalone-candidate-' + version + '-' + value.sourceCommit.slice(0, 12)
  )
    throw refuse();
  return {
    schema: 1,
    version,
    sourceCommit: value.sourceCommit,
    tag: value.tag,
  };
}
export async function readStandaloneCandidatePointer(repository, version) {
  let bytes;
  try {
    bytes = await readStandalonePayloadFile(
      join(repository, 'packaging/standalone/candidate-release.json'),
      4096,
    );
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw refuse();
  }
  try {
    return standaloneCandidatePointer(
      JSON.parse(bytes.toString('utf8')),
      version,
    );
  } catch {
    throw refuse();
  }
}
/** No auth header is ever forwarded from api.github.com to asset storage. */
export async function downloadCandidateAsset(
  { id, name, size, digest, integrity },
  directory,
  token,
  fetcher = fetch,
) {
  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    !/^freerdp-bridge-[a-z0-9-]+-0\.2\.[0-9]+\.tgz$/.test(name ?? '') ||
    !Number.isSafeInteger(size) ||
    size < 1 ||
    size > 134217728 ||
    !/^sha256:[a-f0-9]{64}$/.test(digest ?? '') ||
    !/^sha512-[A-Za-z0-9+/]{86}==$/.test(integrity ?? '') ||
    (token !== undefined && typeof token !== 'string')
  )
    throw refuse();
  let response = await fetcher(
    'https://api.github.com' + prefix + '/releases/assets/' + id,
    {
      headers: {
        ...(token ? { authorization: 'Bearer ' + token } : {}),
        accept: 'application/octet-stream',
        'X-GitHub-Api-Version': '2026-03-10',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(180000),
    },
  );
  if (response.status === 302) {
    let url;
    try {
      url = new URL(response.headers.get('location'));
    } catch {
      throw refuse();
    }
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      ![
        'release-assets.githubusercontent.com',
        'objects.githubusercontent.com',
      ].includes(url.hostname)
    )
      throw refuse();
    await response.body?.cancel();
    response = await fetcher(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(180000),
    });
  }
  if (response.status !== 200) {
    await response.body?.cancel();
    throw refuse();
  }
  const announced = response.headers.get('content-length');
  if (announced !== null && announced !== String(size)) {
    await response.body?.cancel();
    throw refuse();
  }
  const path = join(directory, name),
    file = await open(path, 'wx', 0o600);
  let count = 0,
    complete = false;
  const sha256 = createHash('sha256'),
    sha512 = createHash('sha512');
  try {
    for await (const chunk of response.body) {
      if ((count += chunk.length) > size) throw refuse();
      sha256.update(chunk);
      sha512.update(chunk);
      await file.writeFile(chunk);
    }
    if (
      count !== size ||
      'sha256:' + sha256.digest('hex') !== digest ||
      'sha512-' + sha512.digest('base64') !== integrity
    )
      throw refuse();
    complete = true;
  } finally {
    await file.close();
    if (!complete) await unlink(path);
  }
}
export async function fetchStandaloneCandidates({
  repository,
  version,
  platform,
  token,
  environment = process.env,
  api = standaloneGithubApi(token),
  fetcher = fetch,
  verify = verifiedStandaloneCandidateArchives,
}) {
  if (!['win32-x64', 'linux-x64-gnu'].includes(platform)) throw refuse();
  const pointer = await readStandaloneCandidatePointer(repository, version);
  if (!pointer) return undefined;
  if (
    environment.GITHUB_ACTIONS !== 'true' ||
    environment.GITHUB_REPOSITORY !== 'SensNyaha/freerdp-browser-bridge' ||
    environment.STANDALONE_PUBLISH === 'true' ||
    environment.GITHUB_REF === 'refs/heads/main' ||
    environment.GITHUB_REF === 'refs/heads/master'
  )
    throw refuse();
  const lock = JSON.parse(
    (
      await readStandalonePayloadFile(
        join(repository, 'packaging/standalone/locks', platform + '.json'),
        1048576,
      )
    ).toString('utf8'),
  );
  standaloneProductionManifest(lock, version, platform);
  const required = new Set([
    'api',
    'config',
    'node',
    'protocol',
    'runtime-' + platform,
  ]);
  const entries = [];
  for (const [path, value] of Object.entries(lock.packages))
    if (path.startsWith('node_modules/@freerdp-bridge/')) {
      const suffix = path.slice('node_modules/@freerdp-bridge/'.length);
      if (!required.delete(suffix)) throw refuse();
      entries.push({
        name: 'freerdp-bridge-' + suffix + '-' + version + '.tgz',
        integrity: value.integrity,
      });
    }
  if (required.size || entries.length !== 5) throw refuse();
  const ref = await api(prefix + '/git/ref/tags/' + pointer.tag);
  if (
    ref?.object?.type !== 'tag' ||
    !/^[a-f0-9]{40}$/.test(ref.object.sha ?? '')
  )
    throw refuse();
  const tag = await api(prefix + '/git/tags/' + ref.object.sha);
  if (tag?.object?.type !== 'commit' || tag.object.sha !== pointer.sourceCommit)
    throw refuse();
  const releases = await api(prefix + '/releases?per_page=100');
  if (!Array.isArray(releases) || releases.length > 100) throw refuse();
  const matching = releases.filter((value) => value.tag_name === pointer.tag);
  if (matching.length === 0)
    throw new Error('STANDALONE_CANDIDATE_DRAFT_NOT_VISIBLE');
  if (
    matching.length !== 1 ||
    matching[0].draft !== false ||
    matching[0].prerelease !== true ||
    !Array.isArray(matching[0].assets) ||
    matching[0].assets.length > 32 ||
    new Set(matching[0].assets.map((asset) => asset.name)).size !==
      matching[0].assets.length
  )
    throw refuse();
  const selected = entries.map((entry) => {
    const asset = matching[0].assets.find((value) => value.name === entry.name);
    if (!asset || asset.state !== 'uploaded') throw refuse();
    return { ...asset, integrity: entry.integrity };
  });
  const build = join(await realpath(repository), 'build');
  await mkdir(build, { recursive: true });
  const info = await lstat(build);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    (await realpath(build)) !== build
  )
    throw refuse();
  const directory = await mkdtemp(join(build, 'standalone-candidate-'));
  for (const asset of selected)
    await downloadCandidateAsset(asset, directory, token, fetcher);
  await verify(lock, version, platform, directory);
  return {
    directory,
    tag: pointer.tag,
    sourceCommit: pointer.sourceCommit,
    candidateOnly: true,
    archives: 5,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const repository = resolve('.');
    if (
      repository !== resolve(dirname(fileURLToPath(import.meta.url)), '../..')
    )
      throw refuse();
    const platform =
      process.platform === 'win32' ? 'win32-x64' : 'linux-x64-gnu';
    const pointer = await readStandaloneCandidatePointer(
      repository,
      productVersion,
    );
    if (pointer) {
      const env = Object.fromEntries(
        [
          'PATH',
          'Path',
          'SystemRoot',
          'WINDIR',
          'HOME',
          'USERPROFILE',
          'TMP',
          'TEMP',
        ].flatMap((key) =>
          process.env[key] === undefined ? [] : [[key, process.env[key]]],
        ),
      );
      for (const args of [
        [
          'fetch',
          '--quiet',
          '--no-tags',
          '--depth=1',
          'origin',
          pointer.sourceCommit,
        ],
        [
          'diff',
          '--quiet',
          '--exit-code',
          pointer.sourceCommit,
          'HEAD',
          '--',
          'apps',
          'packages',
          'native',
          'CMakeLists.txt',
          'package.json',
          'pnpm-lock.yaml',
        ],
      ]) {
        const result = spawnSync('git', args, {
          cwd: repository,
          env,
          windowsHide: true,
          timeout: 180000,
          maxBuffer: 65536,
        });
        if (result.error || result.status !== 0)
          throw new Error('STANDALONE_CANDIDATE_SOURCE_DRIFT');
      }
    }
    const result = await fetchStandaloneCandidates({
      repository,
      version: productVersion,
      platform,
    });
    if (process.env.GITHUB_OUTPUT)
      await appendFile(
        process.env.GITHUB_OUTPUT,
        'directory=' + (result?.directory ?? '') + '\n',
      );
    console.log(JSON.stringify(result ?? { candidateOnly: false }));
  } catch (error) {
    console.error(
      JSON.stringify({
        code: /^[A-Z][A-Z0-9_]{1,63}$/.test(error?.message ?? '')
          ? error.message
          : 'STANDALONE_CANDIDATE_RELEASE_FAILED',
      }),
    );
    process.exitCode = 1;
  }
}
