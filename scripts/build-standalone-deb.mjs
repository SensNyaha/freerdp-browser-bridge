import { spawn } from 'node:child_process';
import {
  cp,
  mkdir,
  mkdtemp,
  writeFile,
  copyFile,
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

if (
  process.platform !== 'linux' ||
  process.versions.node.split('.')[0] !== '24' ||
  process.argv.length !== 3
)
  throw new Error('STANDALONE_DEB_USAGE');
const source = resolve(process.argv[2]);
const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(
  (
    await readStandalonePayloadFile(join(source, 'service/package.json'), 65536)
  ).toString('utf8'),
);
const native = JSON.parse(
  (
    await readStandalonePayloadFile(
      join(
        source,
        'service/node_modules/@freerdp-bridge/runtime-linux-x64-gnu/package.json',
      ),
      65536,
    )
  ).toString('utf8'),
);
if (
  manifest.name !== '@freerdp-bridge/standalone' ||
  manifest.private !== true ||
  !/^0\.[0-9]+\.[0-9]+$/.test(manifest.version) ||
  native.version !== manifest.version ||
  manifest.dependencies?.['@freerdp-bridge/api'] !== manifest.version ||
  manifest.dependencies?.['@freerdp-bridge/runtime-linux-x64-gnu'] !==
    manifest.version
)
  throw new Error('STANDALONE_DEB_VERSION_MISMATCH');
const inventory = await standalonePayloadInventory(source, {
  omitNpmBins: true,
});
await mkdir('build', { recursive: true });
const directory = await mkdtemp(resolve('build/standalone-deb-'));
const root = join(directory, 'root');
const program = join(root, 'opt/freerdp-bridge');
await mkdir(program, { recursive: true });
// A caller supplies only the immutable program payload; runtime/config/logs are
// separate. Never ship a whole working directory or arbitrary build artifacts.
for (const name of ['node', 'service'])
  await cp(join(source, name), join(program, name), {
    recursive: true,
    errorOnExist: true,
    filter: (path) => path !== join(source, 'service/node_modules/.bin'),
  });
await copyFile(join(repository, 'LICENSE'), join(program, 'LICENSE'));
const configDirectory = join(root, 'etc/freerdp-bridge');
await mkdir(configDirectory, { recursive: true, mode: 0o750 });
await copyFile(
  join(repository, 'packaging/standalone/bridge.example.json'),
  join(configDirectory, 'bridge.json'),
);
await chmod(join(configDirectory, 'bridge.json'), 0o640);
const unitDirectory = join(root, 'lib/systemd/system');
await mkdir(unitDirectory, { recursive: true });
await copyFile(
  join(repository, 'packaging/standalone/linux/freerdp-bridge.service'),
  join(unitDirectory, 'freerdp-bridge.service'),
);
const metadata = join(root, 'DEBIAN');
await mkdir(metadata);
await writeFile(
  join(metadata, 'control'),
  `Package: freerdp-bridge
Version: ${manifest.version}
Section: net
Priority: optional
Architecture: amd64
Maintainer: FreeRDP Bridge contributors
Depends: libc6 (>= 2.28), libstdc++6 (>= 8), libgcc1, systemd (>= 232), init-system-helpers (>= 1.48), passwd, gawk | mawk
Description: Standalone browser RDP bridge service
 Private Node.js and FreeRDP worker runtime. Requires an application JWT issuer,
 approved RDP targets and an HTTPS reverse proxy for remote browser access.
`,
);
await writeFile(
  join(metadata, 'conffiles'),
  '/etc/freerdp-bridge/bridge.json\n',
);
for (const name of ['postinst', 'prerm', 'postrm']) {
  await copyFile(
    join(repository, 'packaging/standalone/linux', name),
    join(metadata, name),
  );
  await chmod(join(metadata, name), 0o755);
}
await chmod(join(program, 'node/node'), 0o755);
const output = join(directory, `freerdp-bridge_${manifest.version}_amd64.deb`);
const child = spawn(
  'dpkg-deb',
  ['--build', '--root-owner-group', '-Zgzip', '-z6', root, output],
  { detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
);
const stop = () => {
  if (Number.isSafeInteger(child.pid)) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
};
let bytes = 0;
const chunks = [];
for (const stream of [child.stdout, child.stderr])
  stream.on('data', (chunk) => {
    if ((bytes += chunk.length) > 1048576) stop();
    else chunks.push(chunk);
  });
const timer = setTimeout(stop, 180000);
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
if (code !== 0) throw new Error('STANDALONE_DEB_BUILD_FAILED');
const report = {
  version: manifest.version,
  inputFiles: inventory.length,
  output: await realpath(output),
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
