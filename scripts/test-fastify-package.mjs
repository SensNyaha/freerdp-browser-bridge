import { spawnSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  copyFile,
  writeFile,
  realpath,
} from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { productVersion } from './product-version.mjs';

const project = fileURLToPath(new URL('..', import.meta.url));
const npmConsumer = process.argv[2] === '--npm';
if (
  resolve('.') !== resolve(project) ||
  process.versions.node.split('.')[0] !== '24' ||
  !(process.argv.length === 2 || (process.argv.length === 3 && npmConsumer))
)
  throw new Error('Run package integration from the project root with Node 24');
await mkdir('build', { recursive: true });
const root = await mkdtemp(resolve('build/fastify-consumer-'));
const archives = join(root, 'archives');
await mkdir(archives);
const run = (command, args, cwd = project) => {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, CI: 'true' },
    timeout: 120000,
  });
  if (result.error || result.status !== 0)
    throw new Error('FASTIFY_PACKAGE_CHECK_FAILED');
};
const pnpm = (args, cwd) =>
  process.platform === 'win32'
    ? run(
        process.execPath,
        [resolve('.tools/node_modules/pnpm/bin/pnpm.cjs'), ...args],
        cwd,
      )
    : run('pnpm', args, cwd);
const dependencies = {};
const receipts = [];
for (const directory of [
  'packages/protocol',
  'packages/config',
  'packages/node-bridge',
  'apps/bridge-api',
  'packages/fastify',
]) {
  const manifest = JSON.parse(
    await readFile(join(directory, 'package.json'), 'utf8'),
  );
  if (manifest.version !== productVersion || manifest.license !== 'MIT')
    throw new Error('FASTIFY_PACKAGE_MANIFEST');
  pnpm(['pack', '--pack-destination', archives], resolve(directory));
  const archive = join(
    archives,
    manifest.name.replace('@', '').replace('/', '-') +
      '-' +
      productVersion +
      '.tgz',
  );
  dependencies[manifest.name] = 'file:' + archive.replaceAll('\\', '/');
  receipts.push({
    name: manifest.name,
    sha256: createHash('sha256')
      .update(await readFile(archive))
      .digest('hex'),
  });
}
const fixture = join(root, 'consumer');
await mkdir(fixture);
await writeFile(
  join(fixture, 'package.json'),
  JSON.stringify(
    {
      name: 'external-fastify-consumer',
      version: '1.0.0',
      private: true,
      type: 'module',
      dependencies: { ...dependencies, fastify: '5.12.5', ws: '8.22.0' },
      devDependencies: { typescript: '5.9.3', '@types/node': '24.10.0' },
      ...(npmConsumer
        ? { overrides: dependencies }
        : { pnpm: { overrides: dependencies } }),
    },
    null,
    2,
  ),
);
await copyFile(
  'tests/fixtures/fastify-package-consumer.mjs',
  join(fixture, 'consumer.mjs'),
);
await copyFile('tests/fixtures/rdp-tls.mjs', join(fixture, 'tls-fixture.mjs'));
await copyFile(
  'tests/fixtures/fastify-package-consumer.ts',
  join(fixture, 'consumer.ts'),
);
await writeFile(
  join(fixture, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      noEmit: true,
      skipLibCheck: false,
    },
    include: ['consumer.ts'],
  }),
);
if (npmConsumer) {
  if (process.platform === 'win32')
    run(
      process.execPath,
      [
        resolve('.tools/node-v24.21.0-win-x64/node_modules/npm/bin/npm-cli.js'),
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
      ],
      fixture,
    );
  else
    run(
      'npm',
      ['install', '--ignore-scripts', '--no-audit', '--no-fund'],
      fixture,
    );
} else
  pnpm(
    ['install', '--ignore-workspace', '--offline', '--ignore-scripts'],
    fixture,
  );
run(
  process.execPath,
  [join(fixture, 'node_modules/typescript/bin/tsc'), '-p', fixture],
  fixture,
);
const worker = await realpath(
  resolve(
    process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
    'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
  ),
);
run(process.execPath, ['consumer.mjs', worker], fixture);
const report = {
  packageConsumer: true,
  version: productVersion,
  published: false,
  checkoutImports: false,
  strictTypeScript: true,
  packageManager: npmConsumer ? 'npm' : 'pnpm',
  offlineInstall: !npmConsumer,
  fixture: relative(project, root).replaceAll('\\', '/'),
  packages: receipts,
};
await writeFile(
  join(root, 'receipt.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report));
