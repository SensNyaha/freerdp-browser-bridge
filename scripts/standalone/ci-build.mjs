import { spawn } from 'node:child_process';
import { writeFile, appendFile, readdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';

const windows = process.platform === 'win32';
const args = process.argv.slice(2);
const production = args[0] === '--production';
if (production) args.shift();
const candidateDirectory =
  args.length === 2 && args[0] === '--candidate-archives'
    ? resolve(args[1])
    : undefined;
if (
  !['win32', 'linux'].includes(process.platform) ||
  process.versions.node !== '24.21.0' ||
  (args.length !== 0 && !candidateDirectory)
)
  throw new Error('STANDALONE_CI_BUILD_USAGE');
const platform = windows ? 'win32-x64' : 'linux-x64-gnu';
async function node(script, args = []) {
  const child = spawn(process.execPath, ['--use-system-ca', script, ...args], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '',
    count = 0;
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (chunk) => {
      if ((count += chunk.length) > 1048576) child.kill();
      else output += chunk.toString('utf8');
    });
  const timer = setTimeout(() => child.kill(), 600000);
  let code;
  try {
    code = await new Promise((done, reject) => {
      child.once('error', reject);
      child.once('close', done);
    });
  } finally {
    clearTimeout(timer);
  }
  if (code !== 0) throw new Error('STANDALONE_CI_BUILD_STEP_FAILED');
  try {
    return JSON.parse(output.trim().split(/\r?\n/).at(-1));
  } catch {
    throw new Error('STANDALONE_CI_BUILD_RECEIPT_INVALID');
  }
}
const archive = await node('scripts/fetch-standalone-input.mjs', [
  'node-' + platform,
]);
const payload = await node('scripts/build-standalone-payload.mjs', [
  archive.path,
  ...(windows ? [resolve('build/standalone-host/bridge-service.exe')] : []),
  ...(candidateDirectory ? ['--candidate-archives', candidateDirectory] : []),
]);
let artifact;
if (windows) {
  const wix = await node('scripts/fetch-standalone-input.mjs', ['wix']);
  const util = await node('scripts/fetch-standalone-input.mjs', ['wix-util']);
  const executable = join(
    process.env.SystemRoot,
    'System32/WindowsPowerShell/v1.0/powershell.exe',
  );
  for (const [input, target] of [
    [wix, '.tools/standalone-wix'],
    [util, '.tools/standalone-wix-util'],
  ]) {
    const child = spawn(
      executable,
      [
        '-NoProfile',
        '-NonInteractive',
        '-File',
        'scripts/standalone/extract-node.ps1',
        '-ArchivePath',
        input.path,
        '-DestinationPath',
        resolve(target),
      ],
      { windowsHide: true, stdio: 'inherit' },
    );
    const code = await new Promise((done, reject) => {
      child.once('error', reject);
      child.once('close', done);
    });
    if (code !== 0) throw new Error('STANDALONE_CI_WIX_EXTRACT_FAILED');
  }
  artifact = await node('scripts/build-standalone-msi.mjs', [
    payload.payload,
    resolve('.tools/standalone-wix/tools/net6.0/any/wix.exe'),
    resolve('.tools/standalone-wix-util/wixext4/WixToolset.Util.wixext.dll'),
    ...(production ? [] : ['--development']),
  ]);
} else
  artifact = await node('scripts/build-standalone-deb.mjs', [payload.payload]);
const portable = await node('scripts/build-standalone-portable.mjs', [
  payload.payload,
]);
const report = {
  ...artifact,
  platform,
  candidateOnly: payload.candidateOnly,
  payload: payload.payload,
  portableArchive: portable.output,
  portableRoot: dirname(portable.output),
  portableSha256: portable.sha256,
  prototypeOnly: true,
  installedOsAccepted: false,
};
await writeFile(
  'build/standalone-ci.json',
  JSON.stringify(report, null, 2) + '\n',
);
// Record only concrete build outputs, never a wildcard of caches/runtime files.
const files = await readdir(dirname(artifact.output));
if (!files.includes('build.json'))
  throw new Error('STANDALONE_CI_ARTIFACT_MISSING');
console.log(JSON.stringify(report));
if (process.env.GITHUB_OUTPUT)
  await appendFile(
    process.env.GITHUB_OUTPUT,
    'artifact=' +
      report.output +
      '\npayload=' +
      report.payload +
      '\nportable=' +
      report.portableArchive +
      '\nportable-root=' +
      report.portableRoot +
      '\n',
  );
