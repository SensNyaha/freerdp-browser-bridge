import { spawnSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  copyFile,
  writeFile,
  realpath,
  stat,
} from 'node:fs/promises';
import { resolve, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { productVersion } from './product-version.mjs';
import {
  managedFilesArguments,
  prepareManagedFilesConsumer,
  consumerNpmCli,
} from './managed-files-consumer.mjs';
import { checkNpmArchiveReadme } from './npm-readme.mjs';
import { tarManifest } from './github-delivery/manifest.mjs';

const project = fileURLToPath(new URL('..', import.meta.url));
const { args, managedFiles } = managedFilesArguments(
  process.argv.slice(2),
  productVersion,
);
const registryOnly = args[0] === '--registry-only';
const npmConsumer = registryOnly || args[0] === '--npm';
if (npmConsumer) args.shift();
const exactArchives =
  args[0] === '--archives' && args.length === 2 ? args[1] : undefined;
const runtimeArchive = exactArchives
  ? join(
      exactArchives,
      'freerdp-bridge-runtime-' +
        (process.platform === 'win32' ? 'win32-x64' : 'linux-x64-gnu') +
        '-' +
        productVersion +
        '.tgz',
    )
  : args[0] === '--runtime-archive' && args.length === 2
    ? args[1]
    : undefined;
if (
  resolve('.') !== resolve(project) ||
  process.versions.node.split('.')[0] !== '24' ||
  !(args.length === 0 || runtimeArchive) ||
  (registryOnly && runtimeArchive)
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
  if (result.error || result.status !== 0) {
    const reason = result.error?.code === 'ETIMEDOUT' ? 'TIMEOUT' : 'EXIT';
    throw new Error('FASTIFY_PACKAGE_CHECK_FAILED_' + reason);
  }
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
let publicationArchives;
if (exactArchives) {
  publicationArchives = await realpath(resolve(exactArchives));
  const build = await realpath(resolve('build'));
  if (
    !publicationArchives.startsWith(build + sep) ||
    !(await stat(publicationArchives)).isDirectory()
  )
    throw new Error('FASTIFY_PUBLICATION_ARCHIVES_INVALID');
}
if (!registryOnly)
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
    if (!publicationArchives)
      pnpm(['pack', '--pack-destination', archives], resolve(directory));
    const archive = join(
      publicationArchives ?? archives,
      manifest.name.replace('@', '').replace('/', '-') +
        '-' +
        productVersion +
        '.tgz',
    );
    const packed = tarManifest(archive);
    if (packed.name !== manifest.name || packed.version !== productVersion)
      throw new Error('FASTIFY_PACKAGE_ARCHIVE_MISMATCH');
    dependencies[manifest.name] = 'file:' + archive.replaceAll('\\', '/');
    receipts.push({
      name: manifest.name,
      documentation: await checkNpmArchiveReadme(archive),
      sha256: createHash('sha256')
        .update(await readFile(archive))
        .digest('hex'),
    });
  }
const runtimeName =
  '@freerdp-bridge/runtime-' +
  (process.platform === 'win32' ? 'win32-x64' : 'linux-x64-gnu');
if (registryOnly) {
  dependencies['@freerdp-bridge/fastify'] = productVersion;
  dependencies[runtimeName] = productVersion;
}
if (runtimeArchive) {
  const archive = await realpath(resolve(runtimeArchive));
  const build = await realpath(resolve('build'));
  const info = await stat(archive);
  if (
    !archive.startsWith(build + sep) ||
    !archive.endsWith('.tgz') ||
    !info.isFile() ||
    info.size > 128 * 1024 * 1024
  )
    throw new Error('FASTIFY_NATIVE_ARCHIVE_INVALID');
  const extracted = spawnSync(
    'tar',
    ['-xOf', archive, 'package/package.json'],
    { encoding: 'utf8', maxBuffer: 65536, timeout: 10000, windowsHide: true },
  );
  if (extracted.error || extracted.status !== 0)
    throw new Error('FASTIFY_NATIVE_ARCHIVE_INVALID');
  const manifest = JSON.parse(extracted.stdout);
  const expected =
    process.platform === 'win32'
      ? '@freerdp-bridge/runtime-win32-x64'
      : '@freerdp-bridge/runtime-linux-x64-gnu';
  if (manifest.name !== expected || manifest.version !== productVersion)
    throw new Error('FASTIFY_NATIVE_ARCHIVE_MISMATCH');
  dependencies[manifest.name] =
    'file:' + resolve(runtimeArchive).replaceAll('\\', '/');
  receipts.push({
    name: manifest.name,
    documentation: await checkNpmArchiveReadme(archive),
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
      ...(!registryOnly
        ? npmConsumer
          ? { overrides: dependencies }
          : { pnpm: { overrides: dependencies } }
        : {}),
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
  'tests/fixtures/browser-port.mjs',
  join(fixture, 'browser-port.mjs'),
);
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
if (managedFiles) await prepareManagedFilesConsumer(fixture, 'fastify');
if (npmConsumer) {
  const userConfig = join(root, 'empty-npmrc'),
    globalConfig = join(root, 'empty-global-npmrc');
  await writeFile(userConfig, '');
  await writeFile(globalConfig, '');
  const cli = consumerNpmCli();
  run(
    process.execPath,
    [
      '--use-system-ca',
      cli,
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--logs-max=0',
      '--userconfig=' + userConfig,
      '--globalconfig=' + globalConfig,
      '--registry=https://registry.npmjs.org/',
      '--@freerdp-bridge:registry=https://registry.npmjs.org/',
      '--fetch-timeout=30000',
      '--fetch-retries=1',
    ],
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
const worker =
  runtimeArchive || registryOnly
    ? '--package-runtime'
    : await realpath(
        resolve(
          process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
          'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
        ),
      );
run(process.execPath, ['consumer.mjs', worker], fixture);
await copyFile(
  'tests/fixtures/package-runtime-recovery.mjs',
  join(fixture, 'runtime-recovery.mjs'),
);
run(process.execPath, ['runtime-recovery.mjs', 'fastify'], fixture);
if (managedFiles)
  run(
    process.execPath,
    ['managed-files.mjs', 'fastify', productVersion],
    fixture,
  );
const report = {
  packageConsumer: true,
  version: productVersion,
  published: registryOnly,
  registryOnly,
  developmentArtifacts: !registryOnly,
  checkoutImports: false,
  strictTypeScript: true,
  managedFiles,
  managedFilesRdpState: managedFiles ? 'synthetic' : null,
  nativeRuntimePackage: Boolean(runtimeArchive) || registryOnly,
  exactPublicationArchives: Boolean(publicationArchives),
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
