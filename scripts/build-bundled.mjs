import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
if (resolve('.') !== projectRoot)
  throw new Error('Run the bundled build from the repository root');

const windows = process.platform === 'win32';
const triplet = windows ? 'x64-windows-bundled' : 'x64-linux-bundled';
const prefix = resolve('.deps/installed', triplet);
function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.status !== 0)
    throw new Error('Bundled native build failed; inspect the build log');
}
run(process.execPath, ['scripts/inspect-native-build.mjs']);
run('cmake', [
  '-S',
  '.',
  '-B',
  'build/bundled',
  '-G',
  'Ninja',
  '-DCMAKE_BUILD_TYPE=Release',
  '-DBRIDGE_WITH_FREERDP=ON',
  `-DBRIDGE_NODE_IPC=${windows ? 'OFF' : 'ON'}`,
  `-DBRIDGE_DEPENDENCY_PREFIX=${prefix}`,
  `-DBRIDGE_FREERDP_PREFIX=${resolve('.deps/freerdp-install')}`,
  `-DCMAKE_PREFIX_PATH=${resolve('.deps/freerdp-install')};${prefix}`,
  `-DCMAKE_TOOLCHAIN_FILE=${resolve('.deps/vcpkg/scripts/buildsystems/vcpkg.cmake')}`,
  `-DVCPKG_INSTALLED_DIR=${resolve('.deps/installed')}`,
  `-DVCPKG_TARGET_TRIPLET=${triplet}`,
  '-DVCPKG_MANIFEST_INSTALL=OFF',
  '-DCMAKE_INSTALL_RPATH=$ORIGIN/../lib;$ORIGIN',
  '-DCMAKE_INSTALL_RPATH_USE_LINK_PATH=OFF',
]);
run('cmake', ['--build', 'build/bundled', '--parallel', '8']);
run('ctest', ['--test-dir', 'build/bundled', '--output-on-failure']);
// This fixed staging path is inside the project's build directory; never carry old DLLs forward.
const stage = resolve('build/native-stage');
if (!stage.startsWith(resolve('build') + (windows ? '\\' : '/')))
  throw new Error('Invalid native staging directory');
rmSync(stage, { recursive: true, force: true });
run('cmake', ['--install', 'build/bundled', '--prefix', stage]);
if (process.platform === 'linux')
  run(process.execPath, ['scripts/verify-linux-runtime.mjs', stage]);
run('cpack', [
  '--config',
  'build/bundled/CPackConfig.cmake',
  '-G',
  windows ? 'ZIP' : 'TGZ',
  '-B',
  resolve('build/packages'),
]);
for (const name of readdirSync(resolve('build/packages'))) {
  if (
    !name.startsWith('freerdp-bridge-native-') ||
    !/\.(zip|tar\.gz)$/.test(name)
  )
    continue;
  const archive = resolve('build/packages', name);
  const checksum = createHash('sha256')
    .update(readFileSync(archive))
    .digest('hex');
  writeFileSync(archive + '.sha256', `${checksum}  ${name}\n`);
}
