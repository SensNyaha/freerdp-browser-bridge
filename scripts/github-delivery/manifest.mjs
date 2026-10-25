import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const owner = 'SensNyaha';
export const adapters = ['fastify', 'nestjs', 'http', 'express'];
export const shared = [
  'runtime-win32-x64',
  'runtime-linux-x64-gnu',
  'protocol',
  'config',
  'node',
  'api',
];
const all = [...shared, ...adapters];
export const fail = (code) => {
  throw Object.assign(new Error(code), { code });
};
// Canonical, bounded versions for the current pre-1.0 product line. Accepting
// a new minor does not bypass source/archive/platform acceptance or old tags.
export const isReleaseVersion = (value) =>
  typeof value === 'string' &&
  value.length <= 15 &&
  /^0\.(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5})$/.test(value);
export function compareReleaseVersions(left, right) {
  if (!isReleaseVersion(left) || !isReleaseVersion(right))
    fail('DELIVERY_VERSION_INVALID');
  const a = left.split('.').map(Number),
    b = right.split('.').map(Number);
  return Math.sign(a[1] - b[1] || a[2] - b[2]);
}
export const repositoryFor = (suffix) => {
  if (!all.includes(suffix)) fail('DELIVERY_PACKAGE_UNKNOWN');
  return (
    owner +
    '/' +
    (adapters.includes(suffix)
      ? 'freerdp-bridge-' + suffix
      : 'freerdp-browser-bridge')
  );
};
export const safePath = (value) => {
  if (
    typeof value !== 'string' ||
    !value ||
    Buffer.byteLength(value) > 512 ||
    /[\x00-\x1f\x7f\\:]/.test(value) ||
    value
      .split('/')
      .some(
        (part) =>
          !part ||
          part === '.' ||
          part === '..' ||
          ['.git', 'node_modules', '.npmrc'].includes(part),
      ) ||
    /^(?:build|\.tools|\.local-tests|\.release-assets)(?:\/|$)/.test(value) ||
    (/^\.env(?:$|\.)/.test(value) && value !== '.env.example')
  )
    fail('DELIVERY_PATH_INVALID');
  return value;
};
export async function localFile(root, path, maximum) {
  safePath(path);
  const base = await realpath(root);
  const candidate = resolve(base, path);
  const info = await lstat(candidate);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    !Number.isSafeInteger(info.size) ||
    info.size < 0 ||
    info.size > maximum ||
    !(await realpath(candidate)).startsWith(base + sep)
  )
    fail('DELIVERY_FILE_INVALID');
  return { path: candidate, info };
}
export async function hashFile(root, path, maximum) {
  const file = await localFile(root, path, maximum);
  const handle = await open(
    file.path,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  const sha256 = createHash('sha256'),
    sha512 = createHash('sha512');
  const buffer = Buffer.alloc(65536);
  let bytes = 0;
  try {
    const before = await handle.stat();
    if (
      before.ino !== file.info.ino ||
      before.dev !== file.info.dev ||
      before.size !== file.info.size
    )
      fail('DELIVERY_FILE_CHANGED');
    for (;;) {
      const result = await handle.read(buffer, 0, buffer.length, null);
      if (!result.bytesRead) break;
      bytes += result.bytesRead;
      if (bytes > maximum || bytes > before.size) fail('DELIVERY_FILE_CHANGED');
      sha256.update(buffer.subarray(0, result.bytesRead));
      sha512.update(buffer.subarray(0, result.bytesRead));
    }
    const after = await handle.stat();
    if (
      bytes !== before.size ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs
    )
      fail('DELIVERY_FILE_CHANGED');
    return {
      bytes,
      sha256: sha256.digest('hex'),
      integrity: 'sha512-' + sha512.digest('base64'),
    };
  } finally {
    buffer.fill(0);
    await handle.close();
  }
}
export async function readJson(root, path, maximum = 4 * 1024 * 1024) {
  const file = await localFile(root, path, maximum);
  const handle = await open(
    file.path,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const info = await handle.stat();
    if (
      info.size !== file.info.size ||
      info.ino !== file.info.ino ||
      info.dev !== file.info.dev ||
      info.size > maximum
    )
      fail('DELIVERY_FILE_CHANGED');
    const bytes = Buffer.alloc(info.size);
    try {
      let count = 0;
      while (count < bytes.length) {
        const read = await handle.read(
          bytes,
          count,
          bytes.length - count,
          null,
        );
        if (!read.bytesRead) fail('DELIVERY_FILE_CHANGED');
        count += read.bytesRead;
      }
      const after = await handle.stat();
      if (after.size !== info.size || after.mtimeMs !== info.mtimeMs)
        fail('DELIVERY_FILE_CHANGED');
      try {
        return JSON.parse(bytes.toString('utf8'));
      } catch {
        fail('DELIVERY_JSON_INVALID');
      }
    } finally {
      bytes.fill(0);
    }
  } finally {
    await handle.close();
  }
}
const digest = (value) =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const size = (value, maximum) =>
  Number.isSafeInteger(value) && value > 0 && value <= maximum;
export function parseManifest(value) {
  if (
    !value ||
    value.schema !== 1 ||
    !isReleaseVersion(value.version) ||
    !['core', ...adapters].includes(value.kind) ||
    value.repository !==
      (value.kind === 'core'
        ? owner + '/freerdp-browser-bridge'
        : repositoryFor(value.kind)) ||
    value.upstream?.tag !== 'v' + value.version ||
    !/^[a-f0-9]{40}$/.test(value.upstream?.commit ?? '') ||
    !Array.isArray(value.packages) ||
    !Array.isArray(value.sources) ||
    !value.sources.length ||
    value.sources.length > 4096
  )
    fail('DELIVERY_MANIFEST_INVALID');
  safePath(value.upstream.acceptance);
  const expected = value.kind === 'core' ? shared : [value.kind];
  if (value.packages.length !== expected.length)
    fail('DELIVERY_PACKAGE_SET_INVALID');
  for (let index = 0; index < expected.length; index++) {
    const suffix = expected[index],
      item = value.packages[index];
    if (
      !item ||
      item.name !== '@freerdp-bridge/' + suffix ||
      item.version !== value.version ||
      item.archive !==
        'freerdp-bridge-' + suffix + '-' + value.version + '.tgz' ||
      !size(item.bytes, 128 * 1024 * 1024) ||
      !digest(item.sha256) ||
      typeof item.integrity !== 'string' ||
      !/^sha512-[A-Za-z0-9+/]{86}==$/.test(item.integrity)
    )
      fail('DELIVERY_PACKAGE_INVALID');
  }
  let total = 0;
  const paths = new Set();
  for (const item of value.sources) {
    if (
      !item ||
      !Number.isSafeInteger(item.bytes) ||
      item.bytes < 0 ||
      item.bytes > 4 * 1024 * 1024 ||
      !digest(item.sha256)
    )
      fail('DELIVERY_SOURCE_INVALID');
    safePath(item.path);
    if (
      item.path === '.delivery/release.json' ||
      paths.has(item.path.toLowerCase()) ||
      (total += item.bytes) > 128 * 1024 * 1024
    )
      fail('DELIVERY_SOURCE_INVALID');
    paths.add(item.path.toLowerCase());
  }
  return value;
}
export function tarManifest(archive) {
  const result = spawnSync('tar', ['-xOf', archive, 'package/package.json'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30000,
    maxBuffer: 65536,
  });
  if (result.error || result.status !== 0) fail('DELIVERY_TAR_INVALID');
  try {
    return JSON.parse(result.stdout);
  } catch {
    fail('DELIVERY_TAR_INVALID');
  }
}
export async function verifyArchives(root, manifest) {
  parseManifest(manifest);
  for (const item of manifest.packages) {
    const hash = await hashFile(root, item.archive, 128 * 1024 * 1024);
    if (
      hash.bytes !== item.bytes ||
      hash.sha256 !== item.sha256 ||
      hash.integrity !== item.integrity
    )
      fail('DELIVERY_ARCHIVE_CHANGED');
    const metadata = tarManifest(
      (await localFile(root, item.archive, 128 * 1024 * 1024)).path,
    );
    if (
      metadata.name !== item.name ||
      metadata.version !== item.version ||
      metadata.private ||
      metadata.repository?.type !== 'git' ||
      metadata.repository.url !==
        'git+https://github.com/' + manifest.repository + '.git' ||
      JSON.stringify(metadata.dependencies ?? {}).includes('workspace:')
    )
      fail('DELIVERY_ARCHIVE_METADATA_INVALID');
  }
}
export async function verifySources(root, manifest) {
  parseManifest(manifest);
  const committed = spawnSync('git', ['show', 'HEAD:.delivery/release.json'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (committed.error || committed.status !== 0)
    fail('DELIVERY_COMMITTED_MANIFEST_REQUIRED');
  let baseline;
  try {
    baseline = JSON.parse(committed.stdout);
  } catch {
    fail('DELIVERY_COMMITTED_MANIFEST_REQUIRED');
  }
  if (JSON.stringify(baseline) !== JSON.stringify(manifest))
    fail('DELIVERY_MANIFEST_CHANGED');
  for (const item of manifest.sources) {
    const hash = await hashFile(root, item.path, 4 * 1024 * 1024);
    if (hash.bytes !== item.bytes || hash.sha256 !== item.sha256)
      fail('DELIVERY_SOURCE_CHANGED');
  }
  const files = spawnSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (files.error || files.status !== 0) fail('DELIVERY_GIT_INVALID');
  const tracked = files.stdout.split('\0').filter(Boolean).sort();
  const expected = [
    ...manifest.sources.map((item) => item.path),
    '.delivery/release.json',
  ].sort();
  if (JSON.stringify(tracked) !== JSON.stringify(expected))
    fail('DELIVERY_SOURCE_SET_CHANGED');
  const status = spawnSync(
    'git',
    [
      '-c',
      'core.fsmonitor=false',
      'status',
      '--porcelain',
      '--untracked-files=no',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10000,
      maxBuffer: 65536,
    },
  );
  if (status.error || status.status !== 0 || status.stdout.trim())
    fail('DELIVERY_GIT_DIRTY');
}
