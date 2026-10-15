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
if (resolve('.') !== project || ![2, 4].includes(process.argv.length))
  throw new Error('Run from project root with zero or two artifact paths');
const build = realpathSync(resolve('build'));
const context = resolve(build, 'service-runtime');
mkdirSync(context, { recursive: true });
if (realpathSync(context) !== context)
  throw new Error('Invalid service context alias');
const artifacts = [
  [
    'native-linux.tar.gz',
    process.argv[2] ??
      'build/packages/freerdp-bridge-native-0.1.0-Linux.tar.gz',
    128 * 1024 * 1024,
  ],
  [
    'node-linux.tar.gz',
    process.argv[3] ?? 'build/packages/freerdp-bridge-node-0.1.0-linux.tar.gz',
    64 * 1024 * 1024,
  ],
];
const receipt = {};
for (const [name, source, limit] of artifacts) {
  const path = realpathSync(resolve(source));
  const stat = statSync(path);
  if (
    !path.startsWith(build + sep) ||
    !path.endsWith('.tar.gz') ||
    !stat.isFile() ||
    stat.size > limit
  )
    throw new Error('Expected a bounded project-local artifact');
  copyFileSync(path, resolve(context, name));
  receipt[name] = {
    bytes: stat.size,
    sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
  };
}
copyFileSync(
  resolve('docker/service-runtime.Dockerfile'),
  resolve(context, 'Dockerfile'),
);
copyFileSync(
  resolve('tests/packaging/api-runtime-probe.mjs'),
  resolve(context, 'api-runtime-probe.mjs'),
);
writeFileSync(
  resolve(context, '.dockerignore'),
  '*\n!Dockerfile\n!native-linux.tar.gz\n!node-linux.tar.gz\n!api-runtime-probe.mjs\n',
);
console.log(JSON.stringify(receipt));
