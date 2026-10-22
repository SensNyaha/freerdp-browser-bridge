import { spawnSync } from 'node:child_process';
import { access, cp, mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
if (
  process.platform !== 'linux' ||
  process.versions.node.split('.')[0] !== '24' ||
  resolve('.') !== project ||
  process.argv.length !== 2
)
  throw new Error('Run clean Node build check from the Linux project root');
const packages = [
  'packages/protocol',
  'packages/config',
  'packages/node-bridge',
  'apps/bridge-api',
  'packages/fastify',
];
await mkdir(resolve('build'), { recursive: true });
const root = await mkdtemp(resolve('build/node-clean-'));
for (const file of [
  'package.json',
  'pnpm-workspace.yaml',
  'pnpm-lock.yaml',
  'tsconfig.json',
  'tsconfig.base.json',
  'LICENSE',
])
  await cp(resolve(file), resolve(root, file));
for (const name of packages) {
  const destination = resolve(root, name);
  await mkdir(destination, { recursive: true });
  for (const file of ['package.json', 'tsconfig.json', 'src', 'LICENSE'])
    await cp(resolve(name, file), resolve(destination, file), {
      recursive: true,
    });
  try {
    await access(resolve(destination, 'dist'));
    throw new Error('Unexpected prebuilt output');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
await mkdir(resolve(root, 'scripts'), { recursive: true });
await cp(
  resolve('scripts/package-browser-assets.mjs'),
  resolve(root, 'scripts/package-browser-assets.mjs'),
);
await mkdir(resolve(root, 'apps/reference-harness'), { recursive: true });
await cp(
  resolve('apps/reference-harness'),
  resolve(root, 'apps/reference-harness'),
  { recursive: true },
);
const run = (args) => {
  const result = spawnSync('pnpm', args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, CI: 'true' },
  });
  if (result.status !== 0)
    throw new Error('Clean Node workspace verification failed');
};
run(['install', '--offline', '--frozen-lockfile', '--ignore-scripts']);
run(['build']);
for (const name of packages) await access(resolve(root, name, 'dist/index.js'));
const deployed = resolve(root, 'deployed');
run([
  '--offline',
  '--filter',
  '@freerdp-bridge/api',
  'deploy',
  '--prod',
  deployed,
]);
for (const path of ['src', 'node_modules/typescript', 'node_modules/eslint']) {
  try {
    await access(resolve(deployed, path));
    throw new Error('Unexpected development payload');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
const imported = spawnSync(
  process.execPath,
  [
    '--input-type=module',
    '-e',
    `await import(${JSON.stringify(pathToFileURL(resolve(deployed, 'dist/session-server.js')).href)})`,
  ],
  { cwd: deployed, stdio: 'inherit' },
);
if (imported.status !== 0) throw new Error('Clean deployed API import failed');
// Leave the generated fixture for evidence; it contains source/deps only, no lab files.
const before = await readFile(resolve('pnpm-lock.yaml'));
const after = await readFile(resolve(root, 'pnpm-lock.yaml'));
if (!before.equals(after))
  throw new Error('Frozen clean build changed the lockfile');
console.log(
  JSON.stringify({
    cleanWorkspace: true,
    packages: packages.length,
    prebuiltOutput: false,
    lockfileUnchanged: true,
    offline: true,
    productionDeploy: true,
    deployedApiImport: true,
  }),
);
