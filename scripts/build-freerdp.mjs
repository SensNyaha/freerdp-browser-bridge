import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { readFileSync } from 'node:fs';

const triplet =
  process.platform === 'win32' ? 'x64-windows-bundled' : 'x64-linux-bundled';
const prefix = resolve('.deps/installed', triplet);
const freerdpPrefix = resolve('.deps/freerdp-install');
function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.status !== 0)
    throw new Error('Pinned FreeRDP build failed; inspect the build log');
}
run(process.execPath, [resolve('scripts/fetch-freerdp.mjs')]);
run('cmake', [
  '-S',
  '.deps/FreeRDP',
  '-B',
  'build/freerdp-local',
  '-G',
  'Ninja',
  '-C',
  'native/freerdp-profile.cmake',
  '-DCMAKE_BUILD_TYPE=Release',
  `-DCMAKE_INSTALL_PREFIX=${freerdpPrefix}`,
  `-DCMAKE_TOOLCHAIN_FILE=${resolve('.deps/vcpkg/scripts/buildsystems/vcpkg.cmake')}`,
  `-DVCPKG_INSTALLED_DIR=${resolve('.deps/installed')}`,
  `-DVCPKG_TARGET_TRIPLET=${triplet}`,
  '-DVCPKG_MANIFEST_INSTALL=OFF',
  `-DVCPKG_OVERLAY_TRIPLETS=${resolve('native/vcpkg/triplets')}`,
  `-DCMAKE_PREFIX_PATH=${prefix}`,
  `-DZLIB_ROOT=${prefix}`,
  `-DOPENSSL_ROOT_DIR=${prefix}`,
  '-DCMAKE_INSTALL_RPATH=$ORIGIN;$ORIGIN/../lib',
  '-DCMAKE_INSTALL_RPATH_USE_LINK_PATH=OFF',
]);
// Fail if a mandatory dependency accidentally resolves to an external system installation.
const cache = readFileSync(
  resolve('build/freerdp-local/CMakeCache.txt'),
  'utf8',
);
for (const key of [
  'ZLIB_INCLUDE_DIR',
  'OPENSSL_INCLUDE_DIR',
  'LIBUSB_1_INCLUDE_DIR',
]) {
  const line = cache.split('\n').find((value) => value.startsWith(key + ':'));
  const value = line?.slice(line.indexOf('=') + 1).trim();
  if (
    !value ||
    (!resolve(value).startsWith(prefix + '\\') &&
      !resolve(value).startsWith(prefix + '/'))
  )
    throw new Error(`Dependency escaped local prefix: ${key}`);
}
run('cmake', ['--build', 'build/freerdp-local', '--parallel', '8']);
run('cmake', ['--install', 'build/freerdp-local']);
run(process.execPath, [resolve('scripts/inspect-native-build.mjs')]);
console.log(`Installed pinned FreeRDP locally: ${join(freerdpPrefix, 'bin')}`);
