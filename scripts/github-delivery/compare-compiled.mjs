import { opendir, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  readJson,
  parseManifest,
  verifyArchives,
  hashFile,
  fail,
} from './manifest.mjs';
import { assetDirectory } from './fetch.mjs';

try {
  if (process.argv.length !== 2) fail('DELIVERY_COMPARE_USAGE');
  const root = resolve('.'),
    manifest = parseManifest(await readJson(root, '.delivery/release.json'));
  if (manifest.kind === 'core') fail('DELIVERY_COMPARE_ADAPTER_REQUIRED');
  const assets = await assetDirectory(root);
  await verifyArchives(assets, manifest);
  const archive = join(assets, manifest.packages[0].archive);
  const list = spawnSync('tar', ['-tf', archive], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30000,
    maxBuffer: 1024 * 1024,
  });
  if (list.error || list.status !== 0) fail('DELIVERY_COMPARE_TAR_FAILED');
  const expected = list.stdout
    .trim()
    .split(/\r?\n/)
    .filter((path) => path.startsWith('package/dist/') && !path.endsWith('/'))
    .sort();
  if (!expected.length || expected.length > 256)
    fail('DELIVERY_COMPARE_PACKLIST_INVALID');
  const actual = [];
  let entries = 0;
  async function walk(relative, depth = 0) {
    if (depth > 16) fail('DELIVERY_COMPARE_PACKLIST_INVALID');
    for await (const entry of await opendir(join(root, 'package', relative))) {
      if (++entries > 512 || actual.length > 256 || entry.isSymbolicLink())
        fail('DELIVERY_COMPARE_PACKLIST_INVALID');
      const path = relative + '/' + entry.name;
      if (entry.isDirectory()) await walk(path, depth + 1);
      else if (entry.isFile()) actual.push('package/' + path);
      else fail('DELIVERY_COMPARE_PACKLIST_INVALID');
    }
  }
  const start = await lstat(join(root, 'package/dist'));
  if (!start.isDirectory() || start.isSymbolicLink())
    fail('DELIVERY_COMPARE_PACKLIST_INVALID');
  await walk('dist');
  actual.sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    fail('DELIVERY_COMPILED_FILE_SET_CHANGED');
  for (const path of expected) {
    const bytes = spawnSync('tar', ['-xOf', archive, path], {
      windowsHide: true,
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });
    if (bytes.error || bytes.status !== 0) fail('DELIVERY_COMPARE_TAR_FAILED');
    const info = await lstat(resolve(path));
    if (!info.isFile() || info.isSymbolicLink())
      fail('DELIVERY_COMPILED_FILE_CHANGED');
    const compiled = await hashFile(root, path, 1024 * 1024);
    if (
      compiled.bytes !== bytes.stdout.length ||
      compiled.sha256 !==
        createHash('sha256').update(bytes.stdout).digest('hex')
    )
      fail('DELIVERY_COMPILED_FILE_CHANGED');
  }
  console.log(
    JSON.stringify({
      version: manifest.version,
      files: expected.length,
      compiledMatchesAcceptedArchive: true,
      published: false,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      code: /^[A-Z][A-Z0-9_]{1,63}$/.test(error?.code ?? '')
        ? error.code
        : 'DELIVERY_COMPARE_FAILED',
    }),
  );
  process.exitCode = 1;
}
