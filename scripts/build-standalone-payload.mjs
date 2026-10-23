import { createHash, X509Certificate } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  cp,
  copyFile,
  writeFile,
  chmod,
  realpath,
} from 'node:fs/promises';
import { join, resolve, dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import inputs from '../packaging/standalone/inputs.json' with { type: 'json' };
import {
  readStandalonePayloadFile,
  standalonePayloadInventory,
} from './standalone/payload.mjs';
import { standaloneProductionManifest } from './standalone/production-lock.mjs';
import { verifiedStandaloneCandidateArchives } from './standalone/candidate-archives.mjs';

const windows = process.platform === 'win32';
const ordinaryArguments = windows ? 4 : 3;
const options = new Map();
const extra = process.argv.slice(ordinaryArguments);
if (extra.length % 2) throw new Error('STANDALONE_PAYLOAD_USAGE');
for (let index = 0; index < extra.length; index += 2) {
  const option = extra[index];
  if (
    !['--candidate-archives', '--build-ca'].includes(option) ||
    options.has(option) ||
    !extra[index + 1]
  )
    throw new Error('STANDALONE_PAYLOAD_USAGE');
  options.set(option, resolve(extra[index + 1]));
}
const candidateDirectory = options.get('--candidate-archives');
if (
  !['win32', 'linux'].includes(process.platform) ||
  process.arch !== 'x64' ||
  process.versions.node !== '24.21.0' ||
  process.argv.length < ordinaryArguments
)
  throw new Error('STANDALONE_PAYLOAD_USAGE');
const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const platform = windows ? 'win32-x64' : 'linux-x64-gnu';
const source = join(repository, 'apps/standalone');
const metadata = JSON.parse(
  (
    await readStandalonePayloadFile(join(source, 'package.json'), 65536)
  ).toString('utf8'),
);
const lock = await readStandalonePayloadFile(
  join(repository, 'packaging/standalone/locks', platform + '.json'),
  1048576,
);
const parsedLock = JSON.parse(lock.toString('utf8'));
const manifest = standaloneProductionManifest(
  parsedLock,
  metadata.version,
  platform,
);
const candidates = candidateDirectory
  ? await verifiedStandaloneCandidateArchives(
      parsedLock,
      metadata.version,
      platform,
      candidateDirectory,
    )
  : [];
const archive = resolve(process.argv[2]);
if (
  createHash('sha256')
    .update(await readStandalonePayloadFile(archive, 268435456))
    .digest('hex') !== inputs['node-' + platform].sha256
)
  throw new Error('STANDALONE_NODE_ARCHIVE_MISMATCH');
await mkdir('build', { recursive: true });
const directory = await mkdtemp(resolve('build/standalone-payload-'));
const payload = join(directory, 'payload');
const service = join(payload, 'service');
const tools = join(directory, 'tools');
for (const path of [
  service,
  tools,
  join(payload, 'node'),
  join(directory, 'npm-home'),
  join(directory, 'npm-tmp'),
  join(payload, 'notices'),
])
  await mkdir(path, { recursive: true });
const env = windows
  ? {
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      PATH:
        dirname(process.execPath) +
        delimiter +
        join(process.env.SystemRoot, 'System32'),
    }
  : {
      PATH: dirname(process.execPath) + ':/usr/bin:/bin',
      HOME: join(directory, 'npm-home'),
      TMPDIR: join(directory, 'npm-tmp'),
    };
const npmEnvironment = { ...env };
let buildCaSha256;
if (options.has('--build-ca')) {
  const certificate = await readStandalonePayloadFile(
    options.get('--build-ca'),
    65536,
  );
  if (
    !/^\s*-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\s*$/.test(
      certificate.toString('ascii'),
    ) ||
    !new X509Certificate(certificate).ca
  )
    throw new Error('STANDALONE_BUILD_CA_INVALID');
  // Public build-only trust is scoped to npm children. It is never installed
  // into the system trust store or copied to the payload/production settings.
  npmEnvironment.NODE_EXTRA_CA_CERTS = options.get('--build-ca');
  buildCaSha256 = createHash('sha256').update(certificate).digest('hex');
}
async function invoke(
  command,
  args,
  cwd,
  label,
  timeout = 180000,
  environment = env,
) {
  const child = spawn(command, args, {
    cwd,
    env: environment,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const chunks = [];
  let size = 0;
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (chunk) => {
      if ((size += chunk.length) > 1048576) child.kill();
      else chunks.push(chunk);
    });
  const timer = setTimeout(() => child.kill(), timeout);
  let code;
  try {
    code = await new Promise((done, reject) => {
      child.once('error', reject);
      child.once('close', done);
    });
  } finally {
    clearTimeout(timer);
    await writeFile(join(directory, label + '.log'), Buffer.concat(chunks));
  }
  if (code !== 0) throw new Error('STANDALONE_PAYLOAD_STEP_FAILED');
}
if (windows)
  await invoke(
    join(
      process.env.SystemRoot,
      'System32/WindowsPowerShell/v1.0/powershell.exe',
    ),
    [
      '-NoProfile',
      '-NonInteractive',
      '-File',
      join(repository, 'scripts/standalone/extract-node.ps1'),
      '-ArchivePath',
      archive,
      '-DestinationPath',
      tools,
    ],
    repository,
    'extract',
  );
else
  await invoke(
    'tar',
    ['-xJf', archive, '-C', tools, '--no-same-owner'],
    repository,
    'extract',
  );
const nodeRoot = join(
  tools,
  'node-v24.21.0-' + (windows ? 'win-x64' : 'linux-x64'),
);
await copyFile(
  join(nodeRoot, windows ? 'node.exe' : 'bin/node'),
  join(payload, 'node', windows ? 'node.exe' : 'node'),
);
await copyFile(join(nodeRoot, 'LICENSE'), join(payload, 'node/LICENSE'));
if (!windows) await chmod(join(payload, 'node/node'), 0o755);
for (const entry of ['dist', 'web', 'README.md', 'LICENSE'])
  await cp(join(source, entry), join(service, entry), { recursive: true });
await writeFile(
  join(service, 'package.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);
await writeFile(join(service, 'package-lock.json'), lock);
await writeFile(join(directory, 'empty-npmrc'), '');
const npm = windows
  ? join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
  : join(
      dirname(dirname(process.execPath)),
      'lib/node_modules/npm/bin/npm-cli.js',
    );
const npmConfiguration = [
  '--ignore-scripts',
  '--no-audit',
  '--no-fund',
  '--logs-max=0',
  '--userconfig=' + join(directory, 'empty-npmrc'),
  '--globalconfig=' + join(directory, 'empty-global-npmrc'),
  '--cache=' + join(directory, 'npm-cache'),
  '--registry=https://registry.npmjs.org/',
  '--@freerdp-bridge:registry=https://registry.npmjs.org/',
];
if (candidateDirectory) {
  const specifications = [
    ...candidates.map((candidate) => candidate.archive),
    ...new Set(
      Object.entries(parsedLock.packages)
        .filter(
          ([path]) => path && !path.startsWith('node_modules/@freerdp-bridge/'),
        )
        .map(([, entry]) => entry.resolved),
    ),
  ];
  // Each npm cache-add batch is bounded; npm itself limits open HTTPS sockets.
  // The production lock and its official registry URLs remain unchanged.
  for (let offset = 0; offset < specifications.length; offset += 8)
    await invoke(
      process.execPath,
      [
        '--use-system-ca',
        npm,
        'cache',
        'add',
        ...specifications.slice(offset, offset + 8),
        ...npmConfiguration,
        '--maxsockets=4',
        '--loglevel=error',
      ],
      service,
      'npm-cache-' + offset,
      180000,
      npmEnvironment,
    );
}
await invoke(
  process.execPath,
  [
    '--use-system-ca',
    npm,
    'ci',
    '--omit=dev',
    ...npmConfiguration,
    ...(candidateDirectory ? ['--offline'] : []),
  ],
  service,
  'npm-ci',
  300000,
  npmEnvironment,
);
await copyFile(
  join(repository, 'packaging/standalone/bridge.example.json'),
  join(payload, 'bridge.example.json'),
);
await copyFile(join(repository, 'LICENSE'), join(payload, 'LICENSE'));
await copyFile(
  join(repository, 'packaging/standalone/THIRD_PARTY.md'),
  join(payload, 'THIRD_PARTY.md'),
);
await copyFile(
  join(repository, 'packaging/standalone/notices/WIX-UTIL-LICENSE.txt'),
  join(payload, 'notices/WIX-UTIL-LICENSE.txt'),
);
if (windows)
  await copyFile(resolve(process.argv[3]), join(payload, 'bridge-service.exe'));
const inventory = await standalonePayloadInventory(payload, {
  omitNpmBins: !windows,
});
const report = {
  version: manifest.version,
  platform,
  payload: await realpath(payload),
  files: inventory.length,
  npmLockSha256: createHash('sha256').update(lock).digest('hex'),
  candidateOnly: Boolean(candidateDirectory),
  ...(buildCaSha256 ? { buildCaSha256 } : {}),
  candidateArchives: candidates.map(({ name, version, integrity }) => ({
    name,
    version,
    integrity,
  })),
  installedOsAccepted: false,
};
await writeFile(
  join(directory, 'payload.json'),
  JSON.stringify({ ...report, files: inventory }, null, 2) + '\n',
);
await writeFile(
  join(directory, 'build.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report));
