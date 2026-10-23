import { lstat, realpath, readFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  owner,
  adapters,
  repositoryFor,
  readJson,
  parseManifest,
  verifySources,
  verifyArchives,
  localFile,
  hashFile,
  fail,
} from './manifest.mjs';

export function gitText(root, args) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15000,
    maxBuffer: 65536,
  });
  if (result.error || result.status !== 0) fail('DELIVERY_BUNDLE_GIT_FAILED');
  return result.stdout.trim();
}

async function containedDirectory(root, path) {
  const full = join(root, path),
    info = await lstat(full);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    !(await realpath(full)).startsWith(root + sep)
  )
    fail('DELIVERY_BUNDLE_DIRECTORY_INVALID');
  return full;
}

export async function loadBundle(
  directory,
  authority = fileURLToPath(new URL('../..', import.meta.url)),
) {
  const root = await realpath(directory);
  const catalog = await readJson(root, 'delivery-bundle.json', 32768);
  if (
    catalog.schema !== 1 ||
    catalog.completed !== true ||
    catalog.remotePublished !== false ||
    !/^0\.2\.(?:0|[1-9][0-9]{0,5})$/.test(catalog.version ?? '') ||
    !/^[a-f0-9]{40}$/.test(catalog.upstream ?? '') ||
    !Array.isArray(catalog.repositories) ||
    catalog.repositories.length !== 5
  )
    fail('DELIVERY_BUNDLE_INVALID');
  const tag = 'v' + catalog.version;
  if (
    gitText(authority, ['cat-file', '-t', tag]) !== 'tag' ||
    gitText(authority, ['rev-parse', tag + '^{commit}']) !== catalog.upstream
  )
    fail('DELIVERY_BUNDLE_UPSTREAM_CHANGED');
  const repositories = [];
  for (const [index, kind] of ['core', ...adapters].entries()) {
    const item = catalog.repositories[index],
      repository =
        kind === 'core'
          ? owner + '/freerdp-browser-bridge'
          : repositoryFor(kind),
      short = repository.split('/')[1],
      tag = 'v' + catalog.version;
    if (
      !item ||
      item.kind !== kind ||
      item.repository !== repository ||
      item.directory !== 'repositories/' + short ||
      item.assets !== 'release-assets/' + short + '/' + tag ||
      item.locallyVerified !== true ||
      !/^[a-f0-9]{40}$/.test(item.commit ?? '')
    )
      fail('DELIVERY_BUNDLE_REPOSITORY_INVALID');
    const source = await containedDirectory(root, item.directory),
      assets = await containedDirectory(root, item.assets),
      manifest = parseManifest(
        await readJson(source, '.delivery/release.json'),
      );
    if (
      manifest.kind !== kind ||
      manifest.version !== catalog.version ||
      manifest.repository !== repository ||
      manifest.upstream.commit !== catalog.upstream ||
      JSON.stringify(item.packages) !==
        JSON.stringify(manifest.packages.map((item) => item.name)) ||
      gitText(source, ['rev-parse', 'HEAD']) !== item.commit ||
      gitText(source, ['cat-file', '-t', tag]) !== 'tag' ||
      gitText(source, ['rev-parse', tag + '^{commit}']) !== item.commit ||
      (item.parent !== undefined &&
        (!/^[a-f0-9]{40}$/.test(item.parent) ||
          gitText(source, ['rev-parse', 'HEAD^']) !== item.parent)) ||
      gitText(source, ['remote', 'get-url', 'origin']) !==
        'https://github.com/' + repository + '.git'
    )
      fail('DELIVERY_BUNDLE_COMMIT_INVALID');
    await verifySources(source, manifest);
    const report = gitText(authority, [
      'show',
      tag + ':' + manifest.upstream.acceptance,
    ]);
    const accepted = new Map();
    for (const match of report.matchAll(
      /^\| `(@freerdp-bridge\/[a-z0-9-]+)@([^`]+)` \| ([0-9]+) \| `([a-f0-9]{64})` \|$/gm,
    )) {
      if (match[2] !== catalog.version || accepted.has(match[1]))
        fail('DELIVERY_BUNDLE_ACCEPTANCE_INVALID');
      accepted.set(match[1], { bytes: Number(match[3]), sha256: match[4] });
    }
    if (
      accepted.size !== 10 ||
      manifest.packages.some(
        (item) =>
          accepted.get(item.name)?.bytes !== item.bytes ||
          accepted.get(item.name)?.sha256 !== item.sha256,
      )
    )
      fail('DELIVERY_BUNDLE_ACCEPTANCE_INVALID');
    await verifyArchives(assets, manifest);
    const original = await localFile(
        source,
        '.delivery/release.json',
        4 * 1024 * 1024,
      ),
      copy = await localFile(assets, 'delivery-manifest.json', 4 * 1024 * 1024);
    if (!(await readFile(original.path)).equals(await readFile(copy.path)))
      fail('DELIVERY_BUNDLE_MANIFEST_CHANGED');
    repositories.push({
      ...item,
      source,
      assets,
      manifest,
      files: [
        ...manifest.packages.map((item) => ({
          name: item.archive,
          bytes: item.bytes,
          sha256: item.sha256,
        })),
        {
          name: 'delivery-manifest.json',
          ...(await hashFile(
            assets,
            'delivery-manifest.json',
            4 * 1024 * 1024,
          )),
        },
      ],
    });
  }
  return { root, catalog, repositories };
}
