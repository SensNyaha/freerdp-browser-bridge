import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, realpath, readdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { stageStandaloneLinux } from './standalone/linux-stage.mjs';
import {
  readStandalonePayloadFile,
  standalonePayloadInventory,
} from './standalone/payload.mjs';

if (
  process.platform !== 'linux' ||
  process.arch !== 'x64' ||
  process.versions.node.split('.')[0] !== '24' ||
  process.argv.length !== 3
)
  throw new Error('STANDALONE_RPM_USAGE');
const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const source = resolve(process.argv[2]);
await mkdir('build', { recursive: true });
const directory = await mkdtemp(resolve('build/standalone-rpm-'));
if (!/^\/[A-Za-z0-9_./-]+$/.test(directory))
  throw new Error('STANDALONE_RPM_SHORT_ASCII_BUILD_PATH_REQUIRED');
const staging = join(directory, 'staging');
const { version, inputFiles } = await stageStandaloneLinux(
  source,
  staging,
  repository,
  { unitRoot: 'usr/lib' },
);
await writeFile(
  join(directory, 'payload.json'),
  JSON.stringify(
    { version, files: await standalonePayloadInventory(staging) },
    null,
    2,
  ) + '\n',
);
const top = join(directory, 'rpmbuild');
for (const name of ['BUILD', 'BUILDROOT', 'RPMS', 'SOURCES', 'SPECS', 'SRPMS'])
  await mkdir(join(top, name), { recursive: true });
const spec = `%global debug_package %{nil}
%global __os_install_post %{nil}
%global _build_id_links none
%global _binary_payload w6.gzdio
Name: freerdp-bridge
Version: ${version}
Release: 1
Summary: Standalone browser RDP bridge service
License: MIT AND LicenseRef-NodejsBundled AND LicenseRef-FreeRDPBridgeNativeBundled AND LicenseRef-FreeRDPBridgeJsBundled
URL: https://github.com/SensNyaha/freerdp-browser-bridge
BuildArch: x86_64
AutoReqProv: no
Requires: glibc >= 2.28
Requires: libstdc++ >= 8
Requires: libgcc
Requires: systemd >= 232
Requires: shadow-utils
Requires: gawk
Requires: coreutils
Requires: /bin/sh

%description
Private Node.js and FreeRDP worker runtime with JWT ownership and approved
destinations. Remote browser access requires an HTTPS reverse proxy.

%prep
%build
%install
mkdir -p %{buildroot}
cp -a ${staging}/. %{buildroot}/

%pre
set -eu
if ! getent group freerdp-bridge >/dev/null; then groupadd --system freerdp-bridge; fi
if ! getent passwd freerdp-bridge >/dev/null; then
  useradd --system --gid freerdp-bridge --home-dir /nonexistent --no-create-home --shell /bin/false freerdp-bridge
fi
test "$(id -u freerdp-bridge)" -ne 0
test "$(id -g freerdp-bridge)" -ne 0
test "$(id -gn freerdp-bridge)" = freerdp-bridge
getent passwd freerdp-bridge | awk -F: '$6 == "/nonexistent" && $7 == "/bin/false" { found = 1 } END { exit !found }'

%post
set -eu
if [ -d /run/systemd/system ]; then
  systemctl daemon-reload
  if [ "$1" -gt 1 ]; then systemctl reset-failed freerdp-bridge.service; fi
  if [ "$1" -eq 1 ]; then systemctl enable --now freerdp-bridge.service; fi
fi

%preun
set -eu
if [ "$1" -eq 0 ] && [ -d /run/systemd/system ]; then
  systemctl disable --now freerdp-bridge.service
fi

%postun
set -eu
if [ -d /run/systemd/system ]; then
  systemctl daemon-reload
  if [ "$1" -ge 1 ]; then systemctl try-restart freerdp-bridge.service; fi
fi

%files
%defattr(-,root,root,-)
/opt/freerdp-bridge
%dir %attr(0750,root,freerdp-bridge) /etc/freerdp-bridge
%config(noreplace) %attr(0640,root,freerdp-bridge) /etc/freerdp-bridge/bridge.json
/usr/lib/systemd/system/freerdp-bridge.service
`;
const specPath = join(top, 'SPECS/freerdp-bridge.spec');
await writeFile(specPath, spec);
const child = spawn(
  'rpmbuild',
  [
    '-bb',
    '--define',
    '_topdir ' + top,
    '--define',
    '_buildhost standalone-builder',
    specPath,
  ],
  { detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
);
const chunks = [];
let bytes = 0;
const stop = () => {
  if (child.pid) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
};
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
if (code !== 0) throw new Error('STANDALONE_RPM_BUILD_FAILED');
const artifacts = await readdir(join(top, 'RPMS/x86_64'));
const expected = 'freerdp-bridge-' + version + '-1.x86_64.rpm';
if (artifacts.length !== 1 || artifacts[0] !== expected)
  throw new Error('STANDALONE_RPM_OUTPUT_INVALID');
const output = await realpath(join(top, 'RPMS/x86_64', expected));
const report = {
  version,
  inputFiles,
  output,
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
