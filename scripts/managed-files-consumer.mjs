import { readFile, copyFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const optionsTypes = {
  http: 'RdpBridgeHttpOptions',
  express: 'RdpBridgeExpressOptions',
  fastify: 'RdpBridgePluginOptions',
  nestjs: 'RdpBridgeModuleOptions',
};
const invalid = () => {
  throw new Error('MANAGED_FILES_CONSUMER_INVALID');
};

export function managedFilesArguments(input, version) {
  if (
    !Array.isArray(input) ||
    input.some((value) => typeof value !== 'string') ||
    typeof version !== 'string' ||
    version.length > 32 ||
    !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(version)
  )
    invalid();
  const flags = input.filter((value) => value === '--managed-files').length;
  if (flags > 1) invalid();
  const [major, minor] = version.split('.').map(Number);
  return {
    args: input.filter((value) => value !== '--managed-files'),
    managedFiles: flags === 1 || major > 0 || minor >= 6,
  };
}

/** Use npm belonging to the running Node distribution, including setup-node. */
export function consumerNpmCli(
  node = process.execPath,
  platform = process.platform,
) {
  if (!['win32', 'linux'].includes(platform)) invalid();
  return platform === 'win32'
    ? resolve(dirname(node), 'node_modules/npm/bin/npm-cli.js')
    : resolve(dirname(node), '../lib/node_modules/npm/bin/npm-cli.js');
}

export function managedFilesConsumerTypes(kind) {
  if (!Object.hasOwn(optionsTypes, kind)) invalid();
  return `import type { ${optionsTypes[kind]}, SessionCreate } from '@freerdp-bridge/${kind}';
const options: ${optionsTypes[kind]} = {
${kind === 'fastify' ? '' : "  prefix: '/rdp',\n"}
  worker: { workerPath: '/unused/native-worker', runtimeRoot: '/unused/private-runtime' },
  authenticate: () => ({ id: 'synthetic-owner' }),
  sessions: { files: {
    maxTotalBytes: 262144, maxFileBytes: 196608, maxEntries: 16,
    transferTimeoutMs: 5000, progressTimeoutMs: 2000, nativeTimeoutMs: 1000,
    xrdpLegacyDelete: false,
  } },
};
const session: SessionCreate = {
  target: { host: 'synthetic.invalid' }, auth: {},
  clipboard: { mode: 'off', files: false },
  redirection: {
    drives: [{ name: 'RW', source: { kind: 'session-sandbox', subdir: 'exports' } }],
    thinclientDrives: [{ name: 'RO', subdir: 'exports', readOnly: true }],
  },
};
void [options, session];
`;
}

export async function prepareManagedFilesConsumer(directory, kind) {
  const types = managedFilesConsumerTypes(kind);
  const path = join(directory, 'tsconfig.json');
  const config = JSON.parse(await readFile(path, 'utf8'));
  if (
    !Array.isArray(config.include) ||
    config.include.length > 16 ||
    !config.include.includes('consumer.ts') ||
    config.include.includes('managed-files.ts')
  )
    invalid();
  await copyFile(
    new URL('../tests/fixtures/package-managed-files.mjs', import.meta.url),
    join(directory, 'managed-files.mjs'),
  );
  await writeFile(join(directory, 'managed-files.ts'), types);
  config.include.push('managed-files.ts');
  await writeFile(path, JSON.stringify(config, null, 2) + '\n');
}
