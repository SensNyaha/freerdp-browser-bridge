import { spawn } from 'node:child_process';
import {
  copyFile,
  mkdir,
  readFile,
  writeFile,
  appendFile,
} from 'node:fs/promises';
import { resolve, join, dirname, basename } from 'node:path';
import { standaloneUpgradeSeed } from './release-plan.mjs';
import { standalonePayloadInventory } from './payload.mjs';
import { readStandaloneCandidatePointer } from './candidate-release.mjs';

const windows = process.platform === 'win32';
if (
  process.env.GITHUB_ACTIONS !== 'true' ||
  !['win32', 'linux'].includes(process.platform) ||
  process.arch !== 'x64' ||
  !/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? '')
)
  throw new Error('STANDALONE_RELEASE_BUILD_CONTEXT_REFUSED');
const repository = resolve('.');
await mkdir('build', { recursive: true });
let count = 0;
async function command(executable, args, cwd = repository, timeout = 600000) {
  const label = 'build/standalone-release-step-' + count++ + '.log';
  const child = spawn(executable, args, {
    cwd,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '',
    bytes = 0;
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (chunk) => {
      if ((bytes += chunk.length) > 1048576) child.kill();
      else output += chunk.toString('utf8');
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
    await writeFile(label, output);
  }
  if (code !== 0) throw new Error('STANDALONE_RELEASE_BUILD_STEP_FAILED');
  return output.trim();
}
async function node(script, args = [], cwd = repository) {
  const output = await command(
    process.execPath,
    ['--use-system-ca', script, ...args],
    cwd,
  );
  try {
    return JSON.parse(output.split(/\r?\n/).at(-1));
  } catch {
    throw new Error('STANDALONE_RELEASE_BUILD_RECEIPT_INVALID');
  }
}
const metadata = JSON.parse(await readFile('package.json', 'utf8'));
const pointer = await readStandaloneCandidatePointer(
  repository,
  metadata.version,
);
const candidateDirectory = process.env.STANDALONE_CANDIDATE_ARCHIVES;
if (Boolean(pointer) !== Boolean(candidateDirectory))
  throw new Error('STANDALONE_CANDIDATE_INPUT_REQUIRED');
await node('scripts/standalone/ci-build.mjs', [
  '--production',
  ...(candidateDirectory ? ['--candidate-archives', candidateDirectory] : []),
]);
const report = JSON.parse(await readFile('build/standalone-ci.json', 'utf8'));
if (
  report.version !== metadata.version ||
  report.candidateOnly !== Boolean(pointer) ||
  (windows && report.development !== false)
)
  throw new Error('STANDALONE_RELEASE_BUILD_VERSION_INVALID');
const seed = standaloneUpgradeSeed(report.version);
if (seed) {
  const source = resolve('build/upgrade-source');
  const seedMetadata = JSON.parse(
    await readFile(join(source, 'package.json'), 'utf8'),
  );
  if (seedMetadata.version !== seed.version)
    throw new Error('STANDALONE_RELEASE_SEED_VERSION_INVALID');
  // Fetch through the same hash-pinned input helper; its cache is independent
  // of the seed checkout and carries no npm/account configuration.
  const input = await node('scripts/fetch-standalone-input.mjs', [
    'node-' + (windows ? 'win32-x64' : 'linux-x64-gnu'),
  ]);
  const payload = await node(
    join(source, 'scripts/build-standalone-payload.mjs'),
    [
      input.path,
      ...(windows
        ? [join(source, 'build/standalone-host/bridge-service.exe')]
        : []),
    ],
    source,
  );
  const built = windows
    ? await node(
        join(source, 'scripts/build-standalone-msi.mjs'),
        [
          payload.payload,
          resolve('.tools/standalone-wix/tools/net6.0/any/wix.exe'),
          resolve(
            '.tools/standalone-wix-util/wixext4/WixToolset.Util.wixext.dll',
          ),
        ],
        source,
      )
    : await node(
        join(source, 'scripts/build-standalone-deb.mjs'),
        [payload.payload],
        source,
      );
  report.previous = {
    version: built.version,
    output: built.output,
    sha256: built.sha256,
  };
  if (
    built.version !== seed.version ||
    (windows && built.development !== false)
  )
    throw new Error('STANDALONE_RELEASE_SEED_VERSION_INVALID');
}
if (!windows) {
  const context = resolve('build/standalone-rpm-context');
  await mkdir(context, { recursive: true });
  for (const file of [
    'LICENSE',
    'scripts/build-standalone-rpm.mjs',
    'scripts/standalone/linux-stage.mjs',
    'scripts/standalone/payload.mjs',
    'packaging/standalone/bridge.example.json',
    'packaging/standalone/THIRD_PARTY.md',
    'packaging/standalone/linux/freerdp-bridge.service',
  ]) {
    await mkdir(dirname(join(context, file)), { recursive: true });
    await copyFile(file, join(context, file));
  }
  const image = 'freerdp-bridge-release-rpm:' + process.env.GITHUB_SHA;
  await command('docker', [
    'build',
    '--file',
    'packaging/standalone/linux/RpmBuilder.Dockerfile',
    '--tag',
    image,
    'packaging/standalone/linux',
  ]);
  const id = await command('docker', [
    'create',
    '--user',
    String(process.getuid()) + ':' + String(process.getgid()),
    '--network',
    'none',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    image,
    'tail',
    '-f',
    '/dev/null',
  ]);
  if (!/^[a-f0-9]{64}$/.test(id))
    throw new Error('STANDALONE_RELEASE_RPM_CONTAINER_INVALID');
  try {
    await command('docker', ['start', id]);
    await command('docker', ['cp', context + '/.', id + ':/work/source']);
    await command('docker', ['cp', report.payload, id + ':/work/payload']);
    const output = await command('docker', [
      'exec',
      '-w',
      '/work/source',
      id,
      '/work/payload/node/node',
      'scripts/build-standalone-rpm.mjs',
      '/work/payload',
    ]);
    const rpm = JSON.parse(output.split(/\r?\n/).at(-1));
    if (
      rpm.version !== report.version ||
      !/^\/work\/source\/build\/standalone-rpm-[A-Za-z0-9]+\/rpmbuild\/RPMS\/x86_64\/freerdp-bridge-0\.2\.[0-9]+-1\.x86_64\.rpm$/.test(
        rpm.output,
      )
    )
      throw new Error('STANDALONE_RELEASE_RPM_RECEIPT_INVALID');
    const remoteRoot = dirname(dirname(dirname(dirname(rpm.output))));
    const local = resolve('build/standalone-release-rpm');
    await mkdir(local);
    await command('docker', ['cp', id + ':' + remoteRoot + '/.', local]);
    report.rpm = join(local, 'rpmbuild/RPMS/x86_64', basename(rpm.output));
    report.rpmRoot = local;
    await copyFile(report.rpm, join(local, basename(report.rpm)));
  } finally {
    await command('docker', ['rm', '--force', id]);
  }
}
const platform = windows ? 'win32-x64' : 'linux-x64-gnu';
const runtime = join(
  report.payload,
  'service/node_modules/@freerdp-bridge/runtime-' + platform,
);
await standalonePayloadInventory(join(runtime, 'corresponding-source'));
const companion = resolve(
  'build',
  'freerdp-bridge-' +
    report.version +
    '-corresponding-source-' +
    platform +
    '.tar.gz',
);
await command('tar', [
  '-czf',
  companion,
  '-C',
  runtime,
  'corresponding-source',
]);
report.sourceCompanion = companion;
report.sourceCommit = process.env.GITHUB_SHA;
await writeFile(
  'build/standalone-ci.json',
  JSON.stringify(report, null, 2) + '\n',
);
if (process.env.GITHUB_OUTPUT)
  await appendFile(
    process.env.GITHUB_OUTPUT,
    'payload=' +
      report.payload +
      '\nportable-root=' +
      report.portableRoot +
      '\ninstaller-root=' +
      dirname(report.output) +
      '\nrpm-root=' +
      (report.rpmRoot ?? '') +
      '\n',
  );
console.log(
  JSON.stringify({
    version: report.version,
    platform,
    upgradeFrom: report.previous?.version ?? null,
    rpmRoot: report.rpmRoot ?? null,
  }),
);
