import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { fail, verifyArchives, verifySources } from './manifest.mjs';
import { publicMetadata } from './publish.mjs';

const invoke = (args) => {
  const result = spawnSync('gh', args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 180000,
    maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) fail('DELIVERY_GH_COMMAND_FAILED');
  return result.stdout;
};

export function parseApiResponse(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 1024 * 1024)
    fail('DELIVERY_GH_RESPONSE_LIMIT');
  const match = text.match(
    /^HTTP\/[0-9.]+ ([0-9]{3})[^\r\n]*\r?\n[\s\S]*?\r?\n\r?\n/,
  );
  if (!match) fail('DELIVERY_GH_RESPONSE_INVALID');
  const status = Number(match[1]);
  if (status === 404) return undefined;
  if (status !== 200) fail('DELIVERY_GH_READ_FAILED');
  try {
    return JSON.parse(text.slice(match[0].length));
  } catch {
    fail('DELIVERY_GH_RESPONSE_INVALID');
  }
}

// Include HTTP status even on 404, so authentication/network failures cannot
// accidentally be interpreted as a missing release. Never expose CLI stderr.
function apiResult(args) {
  const result = spawnSync('gh', args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30000,
    maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) fail('DELIVERY_GH_READ_FAILED');
  const response = parseApiResponse(result.stdout);
  if (response !== undefined && result.status !== 0)
    fail('DELIVERY_GH_READ_FAILED');
  return result.stdout;
}

export function releaseAssets(release, item, allowMissing = false) {
  if (
    !release ||
    release.tag_name !== item.manifest.upstream.tag ||
    release.prerelease ||
    typeof release.draft !== 'boolean' ||
    !Array.isArray(release.assets) ||
    release.assets.length > item.files.length
  )
    fail('DELIVERY_GH_RELEASE_INVALID');
  const remaining = new Map(item.files.map((file) => [file.name, file]));
  for (const asset of release.assets) {
    const expected = remaining.get(asset.name);
    if (
      !expected ||
      asset.state !== 'uploaded' ||
      asset.size !== expected.bytes ||
      asset.digest !== 'sha256:' + expected.sha256
    )
      fail('DELIVERY_GH_ASSET_CHANGED');
    remaining.delete(asset.name);
  }
  if (remaining.size && (!release.draft || !allowMissing))
    fail('DELIVERY_GH_ASSET_MISSING');
  return [...remaining.values()];
}

export async function requirePublic(items, read = publicMetadata) {
  for (const item of items) {
    const value = await read(item.name, item.version);
    if (!value) fail('DELIVERY_PUBLIC_DEPENDENCIES_PENDING');
    if (
      value.name !== item.name ||
      value.version !== item.version ||
      value.dist?.integrity !== item.integrity
    )
      fail('DELIVERY_PUBLIC_BYTES_DIFFER');
  }
}

export async function bootstrapRelease(
  item,
  {
    command = invoke,
    apiCommand = apiResult,
    checkLocal = async () => {
      await verifySources(item.source, item.manifest);
      await verifyArchives(item.assets, item.manifest);
    },
    workflow = () =>
      readFile(join(item.source, '.github/workflows/npm-publish.yml')),
    notes,
  } = {},
) {
  const read = async (endpoint) =>
    parseApiResponse(
      await apiCommand([
        'api',
        '--include',
        endpoint,
        '--hostname',
        'github.com',
        '--header',
        'X-GitHub-Api-Version: 2026-03-10',
      ]),
    );
  const repository = item.repository,
    remote = 'github.com/' + repository,
    prefix = 'repos/' + repository;
  const user = await read('user');
  if (user?.login?.toLowerCase() !== 'sensnyaha')
    fail('DELIVERY_GH_OWNER_REQUIRED');
  const repo = await read(prefix);
  if (
    repo?.full_name?.toLowerCase() !== repository.toLowerCase() ||
    repo.private !== false ||
    repo.archived ||
    !repo.permissions?.push
  )
    fail('DELIVERY_GH_REPOSITORY_NOT_READY');
  const tag = item.manifest.upstream.tag;
  const ref = await read(prefix + '/git/ref/tags/' + tag);
  if (
    ref?.object?.type !== 'tag' ||
    !/^[a-f0-9]{40}$/.test(ref.object.sha ?? '')
  )
    fail('DELIVERY_GH_ANNOTATED_TAG_REQUIRED');
  const annotated = await read(prefix + '/git/tags/' + ref.object.sha);
  if (
    annotated?.object?.type !== 'commit' ||
    annotated.object.sha !== item.commit
  )
    fail('DELIVERY_GH_TAG_COMMIT_CHANGED');
  const file = await read(
    prefix + '/contents/.github/workflows/npm-publish.yml?ref=' + item.commit,
  );
  if (
    file?.type !== 'file' ||
    file.encoding !== 'base64' ||
    typeof file.content !== 'string' ||
    file.content.length > 65536 ||
    !Buffer.from(file.content, 'base64').equals(await workflow())
  )
    fail('DELIVERY_GH_WORKFLOW_CHANGED');
  await checkLocal();
  let release = await read(prefix + '/releases/tags/' + tag);
  if (release && !release.draft) {
    releaseAssets(release, item);
    return {
      repository,
      tag,
      releaseAlreadyPublished: true,
      npmPublicationVerified: false,
    };
  }
  if (!release) {
    if (!notes) fail('DELIVERY_GH_NOTES_REQUIRED');
    await command([
      'release',
      'create',
      tag,
      '--repo',
      remote,
      '--verify-tag',
      '--draft',
      '--title',
      tag,
      '--notes-file',
      notes,
    ]);
    release = await read(prefix + '/releases/tags/' + tag);
  }
  if (!release?.draft) fail('DELIVERY_GH_DRAFT_REQUIRED');
  const missing = releaseAssets(release, item, true);
  if (missing.length) {
    await checkLocal();
    await command([
      'release',
      'upload',
      tag,
      ...missing.map((file) => join(item.assets, file.name)),
      '--repo',
      remote,
    ]);
    release = await read(prefix + '/releases/tags/' + tag);
  }
  releaseAssets(release, item);
  await checkLocal();
  await command(['release', 'edit', tag, '--repo', remote, '--draft=false']);
  release = await read(prefix + '/releases/tags/' + tag);
  if (!release || release.draft) fail('DELIVERY_GH_PUBLICATION_UNCERTAIN');
  releaseAssets(release, item);
  return {
    repository,
    tag,
    releasePublished: true,
    npmPublicationVerified: false,
  };
}

export async function releaseNotes(bundle, item) {
  const directory = await mkdtemp(join(bundle.root, 'bootstrap-notes-')),
    notes = join(directory, 'notes.md');
  await writeFile(
    notes,
    `Accepted ${item.manifest.version} archives, immutable upstream ${item.manifest.upstream.commit}.\n\nSource/tag, archive sizes and SHA-256/SHA-512 are checked against delivery-manifest.json. The npm workflow verifies Windows/Linux source/native integration before direct OIDC publication. A GitHub release does not itself prove npm publication or additional RDP/device support.\n`,
  );
  return notes;
}
