import { spawn } from 'node:child_process';
import {
  cp,
  copyFile,
  mkdir,
  mkdtemp,
  writeFile,
  chmod,
  realpath,
} from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  standalonePayloadInventory,
  readStandalonePayloadFile,
} from './standalone/payload.mjs';

const windows = process.platform === 'win32';
if (
  !['win32', 'linux'].includes(process.platform) ||
  process.arch !== 'x64' ||
  process.argv.length !== 3 ||
  process.versions.node.split('.')[0] !== '24'
)
  throw new Error('STANDALONE_PORTABLE_USAGE');
const source = resolve(process.argv[2]);
const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const platform = windows ? 'win32-x64' : 'linux-x64-gnu';
const manifest = JSON.parse(
  (
    await readStandalonePayloadFile(join(source, 'service/package.json'), 65536)
  ).toString('utf8'),
);
if (
  manifest.name !== '@freerdp-bridge/standalone' ||
  manifest.private !== true ||
  !/^0\.[0-9]+\.[0-9]+$/.test(manifest.version)
)
  throw new Error('STANDALONE_PORTABLE_VERSION_INVALID');
const native = JSON.parse(
  (
    await readStandalonePayloadFile(
      join(
        source,
        'service/node_modules/@freerdp-bridge/runtime-' +
          platform +
          '/package.json',
      ),
      65536,
    )
  ).toString('utf8'),
);
if (
  native.version !== manifest.version ||
  manifest.dependencies?.['@freerdp-bridge/runtime-' + platform] !==
    manifest.version ||
  manifest.dependencies?.['@freerdp-bridge/api'] !== manifest.version
)
  throw new Error('STANDALONE_PORTABLE_VERSION_MISMATCH');
await standalonePayloadInventory(source, { omitNpmBins: !windows });
await mkdir('build', { recursive: true });
const directory = await mkdtemp(resolve('build/standalone-portable-'));
const rootName = 'freerdp-bridge-' + manifest.version + '-' + platform;
const root = join(directory, rootName);
await cp(source, root, {
  recursive: true,
  errorOnExist: true,
  filter: (path) => path !== join(source, 'service/node_modules/.bin'),
});
await mkdir(join(root, 'config'));
await copyFile(
  join(repository, 'packaging/standalone/bridge.example.json'),
  join(root, 'config/bridge.json'),
);
const launcher = windows ? 'start.ps1' : 'start.sh';
await copyFile(
  join(repository, 'packaging/standalone/portable', launcher),
  join(root, launcher),
);
await copyFile(
  join(repository, 'packaging/standalone/portable/README.md'),
  join(root, 'README.md'),
);
await copyFile(
  join(repository, 'packaging/standalone/THIRD_PARTY.md'),
  join(root, 'THIRD_PARTY.md'),
);
await copyFile(join(repository, 'LICENSE'), join(root, 'LICENSE'));
if (!windows) {
  await chmod(join(root, launcher), 0o755);
  await chmod(join(root, 'node/node'), 0o755);
}
const files = await standalonePayloadInventory(root);
const output = join(directory, rootName + (windows ? '.zip' : '.tar.gz'));
const command = windows
  ? join(
      process.env.SystemRoot,
      'System32/WindowsPowerShell/v1.0/powershell.exe',
    )
  : 'tar';
const args = windows
  ? [
      '-NoProfile',
      '-NonInteractive',
      '-File',
      join(repository, 'scripts/standalone/compress-portable.ps1'),
      '-RootPath',
      root,
      '-ArchivePath',
      output,
    ]
  : ['-czf', output, '-C', directory, rootName];
const child = spawn(command, args, {
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
const chunks = [];
let bytes = 0;
for (const stream of [child.stdout, child.stderr])
  stream.on('data', (chunk) => {
    if ((bytes += chunk.length) > 1048576) child.kill();
    else chunks.push(chunk);
  });
const timer = setTimeout(() => child.kill(), 180000);
let code;
try {
  code = await new Promise((done, reject) => {
    child.once('error', reject);
    child.once('close', done);
  });
} finally {
  clearTimeout(timer);
  await writeFile(join(directory, 'build.log'), Buffer.concat(chunks));
}
if (code !== 0) throw new Error('STANDALONE_PORTABLE_BUILD_FAILED');
await writeFile(
  join(directory, 'payload.json'),
  JSON.stringify(
    { version: manifest.version, platform, rootName, files },
    null,
    2,
  ) + '\n',
);
const report = {
  version: manifest.version,
  platform,
  rootName,
  output: await realpath(output),
  files: files.length,
  sha256: createHash('sha256')
    .update(await readStandalonePayloadFile(output, 536870912))
    .digest('hex'),
  installedOsAccepted: false,
};
await writeFile(
  join(directory, 'build.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report));
