import { productVersion } from './product-version.mjs';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (
  process.platform !== 'linux' ||
  process.versions.node.split('.')[0] !== '24' ||
  resolve('.') !== resolve(fileURLToPath(new URL('..', import.meta.url))) ||
  process.argv.length !== 2
)
  throw new Error('Run from the Linux project root with Node 24');
const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Node runtime packaging failed');
};
run('pnpm', ['build']);
const destination = resolve('build/node-runtime');
// Fixed generated path only, never a user-supplied recursive-delete target.
rmSync(destination, { recursive: true, force: true });
run('pnpm', [
  '--offline',
  '--filter',
  '@freerdp-bridge/api',
  'deploy',
  '--prod',
  destination,
]);
mkdirSync(resolve('build/packages'), { recursive: true });
const archive = resolve(
  `build/packages/freerdp-bridge-node-${productVersion}-linux.tar.gz`,
);
run('tar', ['-czf', archive, '-C', destination, '.']);
const bytes = readFileSync(archive);
console.log(
  JSON.stringify({
    nodeArchive: `build/packages/freerdp-bridge-node-${productVersion}-linux.tar.gz`,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }),
);
