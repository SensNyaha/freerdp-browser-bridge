import { mkdir, lstat, open, unlink, realpath } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { hashFile, fail, parseManifest, verifyArchives } from './manifest.mjs';

async function directory(parent, name) {
  const root = await realpath(parent),
    path = join(root, name);
  try {
    await mkdir(path, { mode: 0o700 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  const info = await lstat(path);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    !(await realpath(path)).startsWith(root + sep)
  )
    fail('DELIVERY_DIRECTORY_INVALID');
  return path;
}
export async function assetDirectory(root) {
  const build = await directory(root, 'build');
  return directory(build, 'delivery-assets');
}
async function download(directory, name, expected, url, fetcher) {
  const path = resolve(directory, name);
  try {
    await lstat(path);
    const hash = await hashFile(directory, name, expected.bytes);
    if (
      hash.bytes !== expected.bytes ||
      hash.sha256 !== expected.sha256 ||
      hash.integrity !== expected.integrity
    )
      fail('DELIVERY_EXISTING_ASSET_CHANGED');
    return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(180000),
    redirect: 'follow',
  });
  if (!response.ok) {
    await response.body?.cancel();
    fail('DELIVERY_ASSET_DOWNLOAD_FAILED');
  }
  const announced = response.headers.get('content-length');
  if (announced !== null && Number(announced) !== expected.bytes) {
    await response.body?.cancel();
    fail('DELIVERY_ASSET_SIZE_CHANGED');
  }
  const file = await open(path, 'wx', 0o600);
  let count = 0,
    complete = false;
  try {
    for await (const bytes of response.body) {
      if (bytes.length > expected.bytes - count)
        fail('DELIVERY_ASSET_SIZE_CHANGED');
      await file.writeFile(bytes);
      count += bytes.length;
    }
    if (count !== expected.bytes) fail('DELIVERY_ASSET_SIZE_CHANGED');
    await file.close();
    const hash = await hashFile(directory, name, expected.bytes);
    if (
      hash.sha256 !== expected.sha256 ||
      hash.integrity !== expected.integrity
    )
      fail('DELIVERY_ASSET_BYTES_CHANGED');
    complete = true;
  } finally {
    await file.close().catch(() => undefined);
    if (!complete) await unlink(path).catch(() => undefined);
  }
}
export async function fetchAssets(root, manifest, fetcher = fetch) {
  parseManifest(manifest);
  const target = await assetDirectory(root);
  const base =
    'https://github.com/' +
    manifest.repository +
    '/releases/download/' +
    manifest.upstream.tag +
    '/';
  const manifestHash = await hashFile(
    root,
    '.delivery/release.json',
    4 * 1024 * 1024,
  );
  await download(
    target,
    'delivery-manifest.json',
    manifestHash,
    base + 'delivery-manifest.json',
    fetcher,
  );
  for (const item of manifest.packages)
    await download(target, item.archive, item, base + item.archive, fetcher);
  await verifyArchives(target, manifest);
  return target;
}
