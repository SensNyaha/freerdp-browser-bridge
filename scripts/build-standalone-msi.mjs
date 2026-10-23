import { resolve, join } from 'node:path';
import { mkdtemp, mkdir, writeFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  standalonePayloadInventory,
  readStandalonePayloadFile,
} from './standalone/payload.mjs';
import { standaloneWindowsMsi } from './standalone/windows-msi.mjs';

if (
  process.platform !== 'win32' ||
  process.versions.node.split('.')[0] !== '24' ||
  ![5, 6].includes(process.argv.length) ||
  (process.argv[5] !== undefined && process.argv[5] !== '--development')
)
  throw new Error('STANDALONE_MSI_USAGE');
const payload = resolve(process.argv[2]);
const wix = resolve(process.argv[3]);
const extension = resolve(process.argv[4]);
const development = process.argv[5] === '--development';
const manifest = JSON.parse(
  (
    await readStandalonePayloadFile(
      join(payload, 'service/package.json'),
      65536,
    )
  ).toString('utf8'),
);
const native = JSON.parse(
  (
    await readStandalonePayloadFile(
      join(
        payload,
        'service/node_modules/@freerdp-bridge/runtime-win32-x64/package.json',
      ),
      65536,
    )
  ).toString('utf8'),
);
if (
  manifest.private !== true ||
  manifest.name !== '@freerdp-bridge/standalone' ||
  native.version !== manifest.version ||
  manifest.dependencies?.['@freerdp-bridge/runtime-win32-x64'] !==
    manifest.version ||
  manifest.dependencies?.['@freerdp-bridge/api'] !== manifest.version
)
  throw new Error('STANDALONE_MSI_VERSION_MISMATCH');
const files = await standalonePayloadInventory(payload);
const wixLicense = await readStandalonePayloadFile(
  join(payload, 'notices/WIX-UTIL-LICENSE.txt'),
  65536,
);
if (
  createHash('sha256').update(wixLicense).digest('hex') !==
  'dfdf2048787635215a6baf3b9d461dee89a2904d246787258a44f072a98d4786'
)
  throw new Error('STANDALONE_MSI_UTIL_NOTICE_MISMATCH');
const source = standaloneWindowsMsi({
  version: manifest.version,
  files,
  development,
});
await mkdir('build', { recursive: true });
const directory = await mkdtemp(resolve('build/standalone-msi-'));
const output = join(
  directory,
  `freerdp-bridge-${development ? 'development-' : ''}${manifest.version}-win32-x64.msi`,
);
const sourcePath = join(directory, 'service.wxs');
await writeFile(sourcePath, source);
await writeFile(
  join(directory, 'payload.json'),
  JSON.stringify({ version: manifest.version, development, files }, null, 2) +
    '\n',
);
const child = spawn(
  wix,
  [
    'build',
    '-arch',
    'x64',
    '-ext',
    extension,
    '-d',
    'PayloadRoot=' + payload,
    '-pdbtype',
    'none',
    '-intermediatefolder',
    join(directory, 'wix-work'),
    '-out',
    output,
    sourcePath,
  ],
  { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
);
let outputBytes = 0;
const chunks = [];
for (const stream of [child.stdout, child.stderr])
  stream.on('data', (bytes) => {
    if ((outputBytes += bytes.length) > 1048576) child.kill();
    else chunks.push(bytes);
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
const artifact = code === 0 ? await realpath(output) : output;
const sha256 =
  code === 0
    ? createHash('sha256')
        .update(await readStandalonePayloadFile(output, 536870912))
        .digest('hex')
    : undefined;
await writeFile(
  join(directory, 'build.json'),
  JSON.stringify(
    {
      version: manifest.version,
      development,
      files: files.length,
      exitCode: code,
      output: artifact,
      sha256,
    },
    null,
    2,
  ) + '\n',
);
if (code !== 0) throw new Error('STANDALONE_MSI_BUILD_FAILED');
console.log(
  JSON.stringify({
    version: manifest.version,
    development,
    files: files.length,
    output: artifact,
    sha256,
  }),
);
