import { spawnSync } from 'node:child_process';
import { readFile, realpath, stat, writeFile, mkdtemp } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { productVersion } from './product-version.mjs';

const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
if (
  process.argv.length !== 3 ||
  resolve('.') !== project ||
  process.versions.node.split('.')[0] !== '24'
)
  throw new Error('MANAGED_FILES_PACKAGES_USAGE');
const packed = spawnSync(
  process.execPath,
  ['scripts/package-native-npm.mjs', process.argv[2]],
  {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    timeout: 300000,
    windowsHide: true,
  },
);
if (packed.error || packed.status !== 0) {
  process.stderr.write(packed.stderr ?? '');
  throw new Error('MANAGED_FILES_NATIVE_PACKAGE_FAILED');
}
const native = JSON.parse(packed.stdout.trim().split(/\r?\n/).at(-1));
const build = await realpath(resolve('build'));
const archive = await realpath(resolve(native.archive));
const info = await stat(archive);
if (
  !archive.startsWith(build + sep) ||
  !info.isFile() ||
  info.size > 128 * 1024 * 1024 ||
  native.published !== false ||
  native.version !== productVersion ||
  native.bytes !== info.size ||
  createHash('sha256')
    .update(await readFile(archive))
    .digest('hex') !== native.sha256
)
  throw new Error('MANAGED_FILES_NATIVE_RECEIPT_INVALID');
for (const kind of ['http', 'express', 'fastify', 'nestjs']) {
  const result = spawnSync(
    process.execPath,
    [
      'scripts/test-' + kind + '-package.mjs',
      ...(kind === 'fastify' ? ['--npm'] : []),
      '--managed-files',
      '--runtime-archive',
      archive,
    ],
    {
      stdio: 'inherit',
      timeout: 600000,
      windowsHide: true,
    },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      'MANAGED_FILES_PACKAGE_CONSUMER_FAILED_' + kind.toUpperCase(),
    );
}
const output = await mkdtemp(join(build, 'managed-files-packages-'));
const receipt = {
  productVersion,
  published: false,
  native,
  independentInstalledProjects: 4,
  managedFileProfiles: process.platform === 'linux' ? 10 : 5,
  strictTypeScript: true,
  actualNativeFileIo: true,
  syntheticRdpOnly: true,
};
await writeFile(
  join(output, 'receipt.json'),
  JSON.stringify(receipt, null, 2) + '\n',
);
console.log(JSON.stringify(receipt));
