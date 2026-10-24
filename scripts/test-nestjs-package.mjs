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
import { resolve, join, sep, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { productVersion } from './product-version.mjs';
import { checkNpmArchiveReadme } from './npm-readme.mjs';

const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const registryOnly = args[0] === '--registry-only';
if (registryOnly) args.shift();
const exactArchives =
  args[0] === '--archives' && args.length === 2 ? args[1] : undefined;
const runtimeArchive =
  args[0] === '--runtime-archive' && args.length === 2 ? args[1] : undefined;
if (
  resolve('.') !== project ||
  process.versions.node.split('.')[0] !== '24' ||
  !['win32', 'linux'].includes(process.platform) ||
  !(args.length === 0 || runtimeArchive || exactArchives) ||
  (registryOnly && (runtimeArchive || exactArchives))
)
  throw Error('NEST_PACKAGE_CHECK_USAGE');
await mkdir('build', { recursive: true });
const root = await mkdtemp(resolve('build/nestjs-consumer-'));
const archives = join(root, 'archives');
const consumer = join(root, 'consumer');
await mkdir(archives);
await mkdir(consumer);
const run = (command, args, cwd = project) => {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    timeout: 300000,
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw Error('NEST_PACKAGE_CHECK_FAILED');
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
    throw Error('NEST_PUBLICATION_ARCHIVES_INVALID');
}
if (!registryOnly)
  for (const directory of [
    'packages/protocol',
    'packages/config',
    'packages/node-bridge',
    'apps/bridge-api',
    'packages/nestjs',
  ]) {
    const manifest = JSON.parse(
      await readFile(join(directory, 'package.json'), 'utf8'),
    );
    if (manifest.version !== productVersion || manifest.license !== 'MIT')
      throw Error('NEST_PACKAGE_MANIFEST');
    if (!publicationArchives)
      pnpm(['pack', '--pack-destination', archives], resolve(directory));
    const archive = join(
      publicationArchives ?? archives,
      manifest.name.replace('@', '').replace('/', '-') +
        '-' +
        productVersion +
        '.tgz',
    );
    const archivePath = await realpath(archive);
    const archiveInfo = await stat(archivePath);
    if (
      !archivePath.startsWith((publicationArchives ?? archives) + sep) ||
      !archiveInfo.isFile() ||
      archiveInfo.size > 128 * 1024 * 1024
    )
      throw Error('NEST_PACKAGE_ARCHIVE_INVALID');
    const archiveMetadata = spawnSync(
      'tar',
      ['-xOf', archivePath, 'package/package.json'],
      { encoding: 'utf8', maxBuffer: 65536, timeout: 10000, windowsHide: true },
    );
    if (archiveMetadata.error || archiveMetadata.status !== 0)
      throw Error('NEST_PACKAGE_ARCHIVE_INVALID');
    const packedManifest = JSON.parse(archiveMetadata.stdout);
    if (
      packedManifest.name !== manifest.name ||
      packedManifest.version !== productVersion
    )
      throw Error('NEST_PACKAGE_ARCHIVE_MISMATCH');
    dependencies[manifest.name] = 'file:' + archive.replaceAll('\\', '/');
    receipts.push({
      name: manifest.name,
      sha256: createHash('sha256')
        .update(await readFile(archive))
        .digest('hex'),
      documentation: await checkNpmArchiveReadme(archive),
    });
  }
if (registryOnly) dependencies['@freerdp-bridge/nestjs'] = productVersion;
const runtimeName =
  '@freerdp-bridge/runtime-' +
  (process.platform === 'win32' ? 'win32-x64' : 'linux-x64-gnu');
if (runtimeArchive || publicationArchives) {
  const archive = await realpath(
    runtimeArchive
      ? resolve(runtimeArchive)
      : join(
          publicationArchives,
          runtimeName.replace('@', '').replace('/', '-') +
            '-' +
            productVersion +
            '.tgz',
        ),
  );
  const build = await realpath(resolve('build'));
  const info = await stat(archive);
  if (
    !archive.startsWith(build + sep) ||
    !archive.endsWith('.tgz') ||
    !info.isFile() ||
    info.size > 128 * 1024 * 1024
  )
    throw Error('NEST_RUNTIME_ARCHIVE_INVALID');
  const result = spawnSync('tar', ['-xOf', archive, 'package/package.json'], {
    encoding: 'utf8',
    maxBuffer: 65536,
    timeout: 10000,
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw Error('NEST_RUNTIME_ARCHIVE_INVALID');
  const manifest = JSON.parse(result.stdout);
  if (manifest.name !== runtimeName || manifest.version !== productVersion)
    throw Error('NEST_RUNTIME_ARCHIVE_MISMATCH');
  dependencies[runtimeName] = 'file:' + archive.replaceAll('\\', '/');
  receipts.push({
    name: runtimeName,
    documentation: await checkNpmArchiveReadme(archive),
  });
} else dependencies[runtimeName] = productVersion;
await writeFile(
  join(consumer, 'package.json'),
  JSON.stringify(
    {
      name: 'external-nestjs-consumer',
      version: '1.0.0',
      private: true,
      type: 'module',
      dependencies: {
        ...dependencies,
        '@nestjs/common': '12.2.0',
        '@nestjs/core': '12.2.0',
        '@nestjs/platform-express': '12.2.0',
        '@nestjs/platform-fastify': '12.2.0',
        'reflect-metadata': '0.2.2',
        rxjs: '7.8.2',
      },
      devDependencies: { typescript: '5.9.3', '@types/node': '24.10.0' },
      ...(!registryOnly ? { overrides: dependencies } : {}),
    },
    null,
    2,
  ) + '\n',
);
await copyFile(
  'tests/fixtures/nestjs-package-consumer.ts',
  join(consumer, 'consumer.ts'),
);
await copyFile(
  'tests/fixtures/session-worker.mjs',
  join(consumer, 'session-worker.mjs'),
);
await copyFile('tests/fixtures/rdp-tls.mjs', join(consumer, 'tls-fixture.mjs'));
await copyFile(
  'tests/fixtures/browser-port.mjs',
  join(consumer, 'browser-port.mjs'),
);
let fixture = await readFile(
  'tests/integration/nestjs-module.test.mjs',
  'utf8',
);
fixture = fixture
  .replace('../../packages/nestjs/dist/index.js', '@freerdp-bridge/nestjs')
  .replace('../fixtures/session-worker.mjs', './session-worker.mjs')
  .replace('../fixtures/rdp-tls.mjs', './tls-fixture.mjs')
  .replace('../fixtures/browser-port.mjs', './browser-port.mjs')
  .replace(
    /new URL\(\s*'\.\.\/\.\.\/apps\/bridge-api\/package.json',\s*import.meta.url,?\s*\)/,
    "import.meta.resolve('@freerdp-bridge/api/fastify')",
  );
const start = fixture.indexOf('const workerPath = resolve('),
  end = fixture.indexOf('const linked =', start);
if (start < 0 || end <= start || end - start > 1024)
  throw Error('NEST_CONSUMER_FIXTURE_INVALID');
fixture =
  "import { resolveNativeRuntime } from '@freerdp-bridge/nestjs';\n" +
  fixture.slice(0, start) +
  'const workerPath = (await resolveNativeRuntime({ runtimeRoot: ' +
  JSON.stringify(join(consumer, 'unused-resolver-root')) +
  ' })).workerPath;\n' +
  fixture.slice(end);
fixture = fixture.replace(
  "const origin = 'https://app.example.test';",
  "if (!linked) throw new Error('NEST_CONSUMER_LINKED_RUNTIME_REQUIRED');\nconst origin = 'https://app.example.test';",
);
fixture += `
test('Installed Nest browser assets resolve without checkout imports', async () => {
  const { referenceBrowserDirectory } = await import('@freerdp-bridge/nestjs/browser');
  const { readFile, realpath } = await import('node:fs/promises');
  const directory = await realpath(referenceBrowserDirectory);
  assert.ok(directory.startsWith(await realpath('node_modules')));
  for (const file of ['index.html', 'viewer.js']) {
    const bytes = await readFile(join(directory, file));
    assert.ok(bytes.length > 0 && bytes.length <= 131072);
  }
});
`;
if (
  /from ['"]\.\.\//.test(fixture) ||
  fixture.includes('../../apps/bridge-api')
)
  throw Error('NEST_CONSUMER_CHECKOUT_IMPORT');
await writeFile(join(consumer, 'consumer.test.mjs'), fixture);
await writeFile(
  join(consumer, 'tsconfig.json'),
  JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        noEmit: true,
        skipLibCheck: false,
      },
      include: ['consumer.ts'],
    },
    null,
    2,
  ) + '\n',
);
const npmCli =
  process.platform === 'win32'
    ? resolve('.tools/node-v24.21.0-win-x64/node_modules/npm/bin/npm-cli.js')
    : resolve(process.execPath, '../../lib/node_modules/npm/bin/npm-cli.js');
console.log(
  JSON.stringify({
    externalProject: relative(project, consumer).replaceAll('\\', '/'),
    registryOnly,
    developmentArtifacts: !registryOnly,
  }),
);
run(
  process.execPath,
  [
    '--use-system-ca',
    npmCli,
    'install',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--logs-max=0',
    '--fetch-timeout=30000',
    '--fetch-retries=1',
    '--registry=https://registry.npmjs.org/',
    '--@freerdp-bridge:registry=https://registry.npmjs.org/',
  ],
  consumer,
);
run(
  process.execPath,
  [join(consumer, 'node_modules/typescript/bin/tsc'), '-p', consumer],
  consumer,
);
run(process.execPath, ['--test', 'consumer.test.mjs'], consumer);
const report = {
  productVersion,
  targetAdapterVersion: '0.2.2',
  registryOnly,
  published: registryOnly,
  developmentArtifacts: !registryOnly,
  exactPublicationArchives: !!publicationArchives,
  strictTypeScript: true,
  checkoutImports: false,
  nativeRuntimePackage: true,
  expressAndFastify: true,
  integrationMatrixPassed: true,
  nativeTlsRefusal: true,
  installedBrowserAssets: true,
  directory: relative(project, root).replaceAll('\\', '/'),
  packages: receipts,
};
await writeFile(
  join(root, 'receipt.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report));
