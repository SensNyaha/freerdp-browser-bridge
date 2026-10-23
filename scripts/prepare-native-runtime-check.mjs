import { productVersion } from './product-version.mjs';
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
if (resolve('.') !== project || process.argv.length > 3)
  throw new Error(
    'Run from the repository root with at most one Linux archive',
  );
const build = realpathSync(resolve('build'));
const archive = realpathSync(
  resolve(
    process.argv[2] ??
      `build/packages/freerdp-bridge-native-${productVersion}-Linux.tar.gz`,
  ),
);
const size = statSync(archive).size;
if (
  !archive.startsWith(build + sep) ||
  !archive.endsWith('.tar.gz') ||
  size > 128 * 1024 * 1024
)
  throw new Error('Expected a bounded project-local Linux native archive');
const context = resolve(build, 'native-runtime-check');
mkdirSync(context, { recursive: true });
if (realpathSync(context) !== context)
  throw new Error('Native runtime-check context must not be a symbolic alias');
copyFileSync(archive, resolve(context, 'native-linux.tar.gz'));
copyFileSync(
  resolve('docker/native-runtime-check.Dockerfile'),
  resolve(context, 'Dockerfile'),
);
copyFileSync(
  resolve('tests/packaging/native-clean-probe.mjs'),
  resolve(context, 'native-clean-probe.mjs'),
);
writeFileSync(
  resolve(context, '.dockerignore'),
  '*\n!Dockerfile\n!native-linux.tar.gz\n!native-clean-probe.mjs\n',
);
console.log(
  JSON.stringify({
    context: 'build/native-runtime-check',
    archiveSha256: createHash('sha256')
      .update(readFileSync(archive))
      .digest('hex'),
    bytes: size,
  }),
);
