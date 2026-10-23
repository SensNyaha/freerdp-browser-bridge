import { spawn } from 'node:child_process';
import {
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
import { readStandalonePayloadFile } from './standalone/payload.mjs';
import { stageStandaloneLinux } from './standalone/linux-stage.mjs';

if (
  process.platform !== 'linux' ||
  process.versions.node.split('.')[0] !== '24' ||
  process.argv.length !== 3
)
  throw new Error('STANDALONE_DEB_USAGE');
const source = resolve(process.argv[2]);
const repository = dirname(dirname(fileURLToPath(import.meta.url)));
await mkdir('build', { recursive: true });
const directory = await mkdtemp(resolve('build/standalone-deb-'));
const root = join(directory, 'root');
const { version, inputFiles } = await stageStandaloneLinux(
  source,
  root,
  repository,
);
const metadata = join(root, 'DEBIAN');
await mkdir(metadata);
await writeFile(
  join(metadata, 'control'),
  `Package: freerdp-bridge
Version: ${version}
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
const output = join(directory, `freerdp-bridge_${version}_amd64.deb`);
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
  version,
  inputFiles,
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
