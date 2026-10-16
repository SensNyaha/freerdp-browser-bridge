import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { readDependencyReceipt } from './dependency-input.mjs';

const windows = process.platform === 'win32';
const triplet = windows ? 'x64-windows-bundled' : 'x64-linux-bundled';
let dependencyInstalledRoot = resolve('.deps/installed');
let prefix = resolve(dependencyInstalledRoot, triplet);
const arguments_ = process.argv.slice(2);
if (
  arguments_.length &&
  (arguments_.length > 2 || arguments_[0] !== '--clean-local')
)
  throw new Error(
    'Expected optional --clean-local and completed dependency receipt',
  );
const cleanLocal = arguments_.length >= 1;
const dependencyReceiptPath = arguments_[1];
const dependencyInput = dependencyReceiptPath
  ? readDependencyReceipt(dependencyReceiptPath, triplet)
  : undefined;
if (dependencyInput) {
  prefix = dependencyInput.prefix;
  dependencyInstalledRoot = dependencyInput.installedRoot;
}
if (process.versions.node.split('.')[0] !== '24')
  throw new Error('Use Node 24');
const cachedSource = resolve('.deps/FreeRDP');
const lock = JSON.parse(
  readFileSync('native/dependencies.json', 'utf8'),
).freerdp;
const checkSource = (path) => {
  for (const [args, expected] of [
    [['rev-parse', 'HEAD'], lock.commit],
    [['status', '--porcelain'], ''],
  ]) {
    const result = spawnSync('git', ['-C', path, ...args], {
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 65536,
      windowsHide: true,
    });
    if (result.status !== 0 || result.stdout.trim() !== expected)
      throw new Error(
        'FreeRDP source does not match the clean pinned checkout',
      );
  }
};
if (cleanLocal) checkSource(cachedSource);
mkdirSync('build', { recursive: true });
const cleanRoot = cleanLocal
  ? mkdtempSync(resolve('build/freerdp-source-clean-'))
  : undefined;
const source = cleanLocal ? join(cleanRoot, 'source') : cachedSource;
const binary = cleanLocal
  ? join(cleanRoot, 'out')
  : resolve('build/freerdp-local');
const freerdpPrefix = cleanLocal
  ? join(cleanRoot, 'installed')
  : resolve('.deps/freerdp-install');
const krb5Config = join(prefix, 'tools', 'krb5', 'bin', 'krb5-config');
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    windowsHide: true,
    timeout: 600000,
    env,
  });
  if (result.status !== 0)
    throw new Error('Pinned FreeRDP build failed; inspect the build log');
}
if (cleanLocal) {
  run('git', [
    'clone',
    '--no-hardlinks',
    '--no-checkout',
    cachedSource,
    source,
  ]);
  run('git', [
    '-C',
    source,
    '-c',
    'core.autocrlf=false',
    'checkout',
    '--detach',
    lock.commit,
  ]);
  checkSource(source);
} else run(process.execPath, [resolve('scripts/fetch-freerdp.mjs')]);
if (!windows) {
  for (const mode of ['--cflags', '--libs']) {
    const result = spawnSync(krb5Config, [mode], {
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 65536,
    });
    const paths = result.stdout
      ?.trim()
      .split(/\s+/)
      .filter((flag) => /^-[IL]/.test(flag));
    if (
      result.status !== 0 ||
      !paths?.length ||
      paths.some((flag) => !resolve(flag.slice(2)).startsWith(prefix + '/'))
    )
      throw new Error(
        'Kerberos configuration escaped the private dependency prefix',
      );
  }
}
run('cmake', [
  '-S',
  source,
  '-B',
  binary,
  '-G',
  'Ninja',
  '-C',
  'native/freerdp-profile.cmake',
  '-DCMAKE_BUILD_TYPE=Release',
  `-DCMAKE_PROJECT_FreeRDP_INCLUDE=${resolve('native/freerdp-build.cmake')}`,
  `-DCMAKE_INSTALL_PREFIX=${freerdpPrefix}`,
  `-DCMAKE_TOOLCHAIN_FILE=${resolve('.deps/vcpkg/scripts/buildsystems/vcpkg.cmake')}`,
  `-DVCPKG_INSTALLED_DIR=${dependencyInstalledRoot}`,
  `-DVCPKG_TARGET_TRIPLET=${triplet}`,
  '-DVCPKG_MANIFEST_INSTALL=OFF',
  `-DVCPKG_OVERLAY_TRIPLETS=${resolve('native/vcpkg/triplets')}`,
  `-DCMAKE_PREFIX_PATH=${prefix}`,
  `-DZLIB_ROOT=${prefix}`,
  `-DOPENSSL_ROOT_DIR=${prefix}`,
  `-DOPENH264_ROOT=${prefix}`,
  ...(!windows ? [`-DKRB5_ROOT_CONFIG=${krb5Config}`] : []),
  '-DCMAKE_INSTALL_RPATH=$ORIGIN;$ORIGIN/../lib',
  '-DCMAKE_INSTALL_RPATH_USE_LINK_PATH=OFF',
]);
// Fail if a mandatory dependency accidentally resolves to an external system installation.
const cache = readFileSync(join(binary, 'CMakeCache.txt'), 'utf8');
for (const key of [
  'ZLIB_INCLUDE_DIR',
  'OPENSSL_INCLUDE_DIR',
  'LIBUSB_1_INCLUDE_DIR',
  'OPENH264_INCLUDE_DIR',
  'OPENH264_LIBRARY',
  ...(!windows
    ? [
        'ICU_INCLUDE_DIR',
        'ICU_I18N_LIBRARY_RELEASE',
        'ICU_UC_LIBRARY_RELEASE',
        'ICU_IO_LIBRARY_RELEASE',
        'ICU_DATA_LIBRARY_RELEASE',
        'CUPS_INCLUDE_DIR',
        'CUPS_LIBRARIES',
        'FUSE3_INCLUDEDIR',
        'FUSE3_LIBDIR',
        'pkgcfg_lib_FUSE3_fuse3',
      ]
    : []),
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
if (!windows) {
  if (
    !cache
      .split('\n')
      .some((line) => line.trim() === `KRB5_ROOT_CONFIG:STRING=${krb5Config}`)
  )
    throw new Error(
      'Kerberos configuration does not use the private dependency tool',
    );
}
for (const [key, expected] of [
  ['WITH_OPENH264', 'ON'],
  ['WITH_OPENH264_LOADING', 'OFF'],
  ['WITH_MEDIA_FOUNDATION', 'OFF'],
]) {
  if (
    !cache.split('\n').some((line) => line.trim() === `${key}:BOOL=${expected}`)
  )
    throw new Error(`Unexpected private decoder build option: ${key}`);
}
run('cmake', ['--build', binary, '--parallel', cleanLocal ? '2' : '8']);
run('cmake', ['--install', binary]);
const features = cleanLocal
  ? join(cleanRoot, 'native-features.json')
  : resolve('build/native-features.json');
run(process.execPath, [
  resolve('scripts/inspect-native-build.mjs'),
  join(binary, 'CMakeCache.txt'),
  freerdpPrefix,
  features,
  dependencyInstalledRoot,
]);
if (cleanLocal) {
  const probeBinary = join(cleanRoot, 'probe');
  run('cmake', [
    '-S',
    resolve('tests/fixtures/freerdp-sdk'),
    '-B',
    probeBinary,
    '-G',
    'Ninja',
    `-DCMAKE_PREFIX_PATH=${freerdpPrefix};${prefix}`,
    `-DBRIDGE_SDK_PREFIX=${freerdpPrefix}`,
    '-DCMAKE_BUILD_TYPE=Release',
    ...(!windows
      ? [`-DCMAKE_EXE_LINKER_FLAGS=-Wl,-rpath-link,${join(prefix, 'lib')}`]
      : []),
  ]);
  run('cmake', ['--build', probeBinary, '--parallel', '2']);
  const result = spawnSync(
    join(probeBinary, windows ? 'sdk-probe.exe' : 'sdk-probe'),
    [freerdpPrefix],
    {
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 65536,
      windowsHide: true,
      env: {
        ...process.env,
        ...(windows
          ? {
              PATH:
                join(freerdpPrefix, 'bin') +
                ';' +
                join(prefix, 'bin') +
                ';' +
                process.env.PATH,
            }
          : {
              LD_LIBRARY_PATH:
                join(freerdpPrefix, 'lib') + ':' + join(prefix, 'lib'),
            }),
      },
    },
  );
  if (result.status !== 0) throw new Error('New SDK runtime probe failed');
  const runtimeEnvironment = {
    ...process.env,
    ...(windows
      ? {
          PATH:
            join(freerdpPrefix, 'bin') +
            ';' +
            join(prefix, 'bin') +
            ';' +
            process.env.PATH,
        }
      : {
          LD_LIBRARY_PATH:
            join(freerdpPrefix, 'lib') + ':' + join(prefix, 'lib'),
        }),
  };
  const foreignPrefix = spawnSync(
    join(probeBinary, windows ? 'sdk-probe.exe' : 'sdk-probe'),
    [prefix],
    {
      env: runtimeEnvironment,
      timeout: 10000,
      maxBuffer: 65536,
      windowsHide: true,
    },
  );
  if (foreignPrefix.status !== 2)
    throw new Error('New SDK probe did not reject a foreign expected prefix');
  run(
    'ctest',
    ['--test-dir', probeBinary, '--output-on-failure', '--no-tests=error'],
    runtimeEnvironment,
  );
  const runtime = JSON.parse(result.stdout);
  const inventory = JSON.parse(readFileSync(features, 'utf8'));
  if (
    runtime.version !== lock.version ||
    runtime.winpr !== lock.version ||
    JSON.stringify(runtime.channels) !==
      JSON.stringify(inventory.enabledChannels)
  )
    throw new Error(
      'New SDK runtime inventory does not match the pinned profile',
    );
  checkSource(source);
  checkSource(cachedSource);
  if (
    dependencyInput &&
    !dependencyInput.bytes.equals(
      readDependencyReceipt(dependencyReceiptPath, triplet).bytes,
    )
  )
    throw new Error('Dependency receipt changed during SDK build');
  const receipt = {
    source,
    binary,
    installed: freerdpPrefix,
    commit: lock.commit,
    sourceOverrides: JSON.parse(
      readFileSync(
        join(freerdpPrefix, 'share/freerdp-bridge/freerdp-overrides.json'),
        'utf8',
      ),
    ),
    freerdpRebuilt: true,
    dependenciesRebuilt: false,
    foreignPrefixRejected: true,
    nativeTests: 1,
    reusedDependencyPrefix: prefix,
    ...(dependencyInput
      ? {
          dependencyBuildReceipt: resolve(dependencyReceiptPath),
          dependencyBuildReceiptHash: dependencyInput.sha256,
          dependencyBuildSourceRebuilt: true,
        }
      : {}),
    runtime,
    features,
  };
  writeFileSync(
    join(cleanRoot, 'receipt.json'),
    JSON.stringify(receipt, null, 2) + '\n',
  );
  console.log(JSON.stringify(receipt, null, 2));
}
console.log(`Installed pinned FreeRDP locally: ${join(freerdpPrefix, 'bin')}`);
