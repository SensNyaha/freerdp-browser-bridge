import { spawnSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readdir,
  opendir,
  lstat,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { resolve, dirname, basename, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readDependencyReceipt } from './dependency-input.mjs';
import { nodeTestDirectories } from './node-test-directories.mjs';
import { readNativeBuildProfile } from './native-build-profile.mjs';
import { nativeCleanArtifactHashes } from './native-clean-artifacts.mjs';
import {
  nativeCleanProfile,
  requireWindowsSdkCrt,
} from './native-clean-profile.mjs';

const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
const windows = process.platform === 'win32';
const [catchSource, mode = 'foundation', sdkReceiptPath, ...extra] =
  process.argv.slice(2);
const { linked, buildType, receiptRequired } = nativeCleanProfile(mode);
if (
  (!windows && process.platform !== 'linux') ||
  process.versions.node.split('.')[0] !== '24' ||
  resolve('.') !== project ||
  !catchSource ||
  (sdkReceiptPath && !linked) ||
  extra.length
)
  throw new Error(
    'Use the project root, Node 24, offline Catch2 source and optional linked mode',
  );
if (receiptRequired && !sdkReceiptPath)
  throw new Error('Linked Debug requires a rebuilt SDK receipt');
const version = await readFile(
  resolve(catchSource, 'src/catch2/catch_version_macros.hpp'),
  'utf8',
);
for (const [name, number] of [
  ['MAJOR', 3],
  ['MINOR', 8],
  ['PATCH', 1],
])
  if (
    !new RegExp(
      '#define CATCH_VERSION_' + name + '\\s+' + number + '(?:\\s|$)',
    ).test(version)
  )
    throw new Error('Expected prepared Catch2 3.8.1 sources');
const triplet = windows ? 'x64-windows-bundled' : 'x64-linux-bundled';
let dependencyInstalledRoot = resolve('.deps/installed');
let prefix = resolve(dependencyInstalledRoot, triplet);
let dependencyInput, dependencyReceiptPath;
let freerdpPrefix = resolve('.deps/freerdp-install');
let sdkSourcePath = resolve('.deps/FreeRDP');
let sdkCachePath = resolve('build/freerdp-local/CMakeCache.txt');
let sdkReceiptBytes;
if (sdkReceiptPath) {
  const path = resolve(sdkReceiptPath);
  const root = dirname(path);
  if (
    !root.startsWith(resolve('build') + sep) ||
    basename(path) !== 'receipt.json' ||
    !/^freerdp-source-clean-[A-Za-z0-9_-]+$/.test(basename(root))
  )
    throw new Error('Invalid rebuilt SDK receipt path');
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 65536)
    throw new Error('Invalid rebuilt SDK receipt');
  sdkReceiptBytes = await readFile(path);
  let receipt;
  try {
    receipt = JSON.parse(sdkReceiptBytes.toString('utf8'));
  } catch {
    throw new Error('Invalid rebuilt SDK receipt');
  }
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt))
    throw new Error('Invalid rebuilt SDK receipt');
  if (receipt.dependencyBuildSourceRebuilt === true) {
    dependencyReceiptPath = receipt.dependencyBuildReceipt;
    if (typeof dependencyReceiptPath !== 'string')
      throw new Error('Missing bound dependency receipt');
    dependencyInput = readDependencyReceipt(dependencyReceiptPath, triplet);
    if (dependencyInput.sha256 !== receipt.dependencyBuildReceiptHash)
      throw new Error('SDK dependency receipt hash mismatch');
    prefix = dependencyInput.prefix;
    dependencyInstalledRoot = dependencyInput.installedRoot;
  }
  if (
    !root.startsWith(resolve('build') + sep) ||
    receipt.source !== resolve(root, 'source') ||
    receipt.binary !== resolve(root, 'out') ||
    receipt.installed !== resolve(root, 'installed') ||
    receipt.reusedDependencyPrefix !== prefix ||
    receipt.freerdpRebuilt !== true ||
    receipt.dependenciesRebuilt !== false ||
    receipt.foreignPrefixRejected !== true ||
    receipt.nativeTests !== 1 ||
    receipt.runtime?.version !== '3.32.1' ||
    receipt.runtime?.winpr !== '3.32.1' ||
    receipt.runtime?.privateModules !== 3
  )
    throw new Error(
      'Rebuilt SDK receipt does not describe the isolated pinned profile',
    );
  freerdpPrefix = receipt.installed;
  sdkSourcePath = receipt.source;
  sdkCachePath = resolve(receipt.binary, 'CMakeCache.txt');
  if (windows)
    requireWindowsSdkCrt(
      receipt,
      await readFile(sdkCachePath, 'utf8'),
      buildType,
    );
}
let sdkSourceCommit;
const checkSdkSource = () => {
  for (const [args, expected] of [
    [['rev-parse', 'HEAD'], sdkSourceCommit],
    [['status', '--porcelain'], ''],
  ]) {
    const result = spawnSync('git', ['-C', sdkSourcePath, ...args], {
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 65536,
      windowsHide: true,
    });
    if (result.status !== 0 || result.stdout.trim() !== expected)
      throw new Error(
        'Prepared FreeRDP source does not match the clean pinned checkout',
      );
  }
};
if (linked) {
  const lock = JSON.parse(
    await readFile(resolve('native/dependencies.json'), 'utf8'),
  );
  sdkSourceCommit = lock.freerdp.commit;
  if (
    lock.freerdp.version !== '3.32.1' ||
    !/^[a-f0-9]{40}$/.test(sdkSourceCommit)
  )
    throw new Error('Unsupported FreeRDP build pin');
  checkSdkSource();
  if (
    sdkReceiptBytes &&
    JSON.parse(sdkReceiptBytes.toString('utf8')).commit !== sdkSourceCommit
  )
    throw new Error('Rebuilt SDK receipt pin mismatch');
}
await mkdir(resolve('build'), { recursive: true });
const root = await mkdtemp(resolve('build/native-clean-'));
const source = resolve(root, 'source'),
  binary = resolve(root, 'out');
const entries = ['CMakeLists.txt'];
let visited = 0;
const walk = async (name, depth = 0) => {
  if (++visited > 4096 || depth > 32)
    throw new Error('Native source tree exceeded');
  const info = await lstat(resolve(project, name));
  if (info.isSymbolicLink()) throw new Error('Unexpected source link');
  if (info.isDirectory()) {
    for await (const child of await opendir(resolve(project, name)))
      await walk(name + '/' + child.name, depth + 1);
  } else if (info.isFile()) entries.push(name);
  else throw new Error('Unexpected source object');
};
await walk('native');
for await (const child of await opendir(resolve('tests/fixtures')))
  if (child.name.endsWith('.cpp')) await walk('tests/fixtures/' + child.name);
entries.sort();
if (entries.length > 4096) throw new Error('Native source count exceeded');
let total = 0;
const digest = createHash('sha256');
for (const name of entries) {
  const original = resolve(project, name),
    destination = resolve(source, name);
  if (!destination.startsWith(source + sep))
    throw new Error('Invalid fixture destination');
  const info = await lstat(original);
  if (
    !info.isFile() ||
    info.size > 4 * 1024 * 1024 ||
    (total += info.size) > 128 * 1024 * 1024
  )
    throw new Error('Native source size exceeded');
  const bytes = await readFile(original);
  digest.update(name + '\0' + bytes.length + '\0').update(bytes);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes, { flag: 'wx' });
}
const sourceHash = digest.digest('hex');
// No old binary/output, Git, SDK, Node dependency tree or lab bootstrap is copied.
const before = await readdir(root);
if (before.length !== 1 || before[0] !== 'source')
  throw new Error('Unexpected prebuilt payload');
const run = (
  command,
  args,
  env = process.env,
  cwd = root,
  timeout = 180000,
) => {
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: 'inherit',
    timeout,
    windowsHide: true,
  });
  if (result.error?.code === 'ETIMEDOUT')
    throw new Error(
      'Clean native command exceeded its ' + timeout + ' ms deadline',
    );
  if (result.status !== 0)
    throw new Error(
      'Clean native verification failed (exit ' + result.status + ')',
    );
};
let featureHash, featureBytes;
if (linked) {
  const featuresPath = sdkReceiptPath
    ? resolve(root, 'sdk-features.json')
    : resolve(project, 'build/native-features.json');
  run(
    process.execPath,
    [
      resolve('scripts/inspect-native-build.mjs'),
      sdkCachePath,
      freerdpPrefix,
      featuresPath,
      dependencyInstalledRoot,
    ],
    process.env,
    project,
  );
  if ((await lstat(featuresPath)).size > 131072)
    throw new Error('Build feature report exceeded');
  featureBytes = await readFile(featuresPath);
  JSON.parse(featureBytes.toString('utf8'));
  featureHash = createHash('sha256').update(featureBytes).digest('hex');
  // This generated filtered SDK inventory is a declared build input, not a
  // project cache/object/binary. The installed SDK remains external/reused.
  await mkdir(resolve(source, 'build'));
  await writeFile(resolve(source, 'build/native-features.json'), featureBytes, {
    flag: 'wx',
  });
}
const runtimeEnvironment =
  linked && !windows
    ? {
        ...process.env,
        LD_LIBRARY_PATH: freerdpPrefix + '/lib:' + prefix + '/lib',
      }
    : process.env;
const profileQuery = resolve(binary, '.cmake/api/v1/query');
await mkdir(profileQuery, { recursive: true });
await writeFile(resolve(profileQuery, 'toolchains-v1'), '', { flag: 'wx' });
run('cmake', [
  '-S',
  source,
  '-B',
  binary,
  '-G',
  'Ninja',
  '-DCMAKE_BUILD_TYPE=' + buildType,
  '-DBUILD_TESTING=ON',
  '-DBRIDGE_WITH_FREERDP=' + (linked ? 'ON' : 'OFF'),
  '-DBRIDGE_NODE_IPC=' + (linked && !windows ? 'ON' : 'OFF'),
  '-DFETCHCONTENT_FULLY_DISCONNECTED=ON',
  '-DFETCHCONTENT_SOURCE_DIR_CATCH2=' +
    resolve(catchSource).replaceAll('\\', '/'),
  ...(linked
    ? [
        '-DBRIDGE_DEPENDENCY_PREFIX=' + prefix,
        '-DBRIDGE_FREERDP_PREFIX=' + freerdpPrefix,
        '-DBRIDGE_FREERDP_LICENSE_FILE=' + resolve(sdkSourcePath, 'LICENSE'),
        '-DCMAKE_PREFIX_PATH=' + freerdpPrefix + ';' + prefix,
        '-DCMAKE_TOOLCHAIN_FILE=' +
          resolve('.deps/vcpkg/scripts/buildsystems/vcpkg.cmake'),
        '-DVCPKG_INSTALLED_DIR=' + dependencyInstalledRoot,
        '-DVCPKG_TARGET_TRIPLET=' + triplet,
        '-DVCPKG_MANIFEST_INSTALL=OFF',
      ]
    : []),
]);
const buildProfile = await readNativeBuildProfile(binary, buildType);
if (sdkReceiptPath) {
  const cache = await readFile(resolve(binary, 'CMakeCache.txt'), 'utf8');
  for (const [name, packageDirectory] of [
    ['FreeRDP', 'FreeRDP3'],
    ['FreeRDP-Client', 'FreeRDP-Client3'],
    ['WinPR', 'WinPR3'],
  ]) {
    const line = cache
      .split('\n')
      .find((value) => value.startsWith(name + '_DIR:'));
    const value = line?.slice(line.indexOf('=') + 1).trim();
    if (
      !value ||
      resolve(value) !== resolve(freerdpPrefix, 'lib/cmake', packageDirectory)
    )
      throw new Error('Consumer CMake package escaped the rebuilt SDK prefix');
  }
}
// Compilation has a separate finite budget from CTest and process/IPC checks.
run('cmake', ['--build', binary, '--parallel', '8'], process.env, root, 600000);
const query = spawnSync(
  'ctest',
  ['--test-dir', binary, '--show-only=json-v1'],
  {
    cwd: root,
    encoding: 'utf8',
    timeout: 10000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  },
);
if (query.status !== 0) throw new Error('Clean native inventory unavailable');
const tests = JSON.parse(query.stdout).tests;
if (
  !Array.isArray(tests) ||
  tests.length < (linked ? (windows ? 29 : 30) : windows ? 14 : 15) ||
  tests.length > 128 ||
  ![
    'clipboard-text-tests',
    'clipboard-ingress-tests',
    'clipboard-wire-tests',
    'ipc-tests',
    'runtime-ownership-tests',
    'runtime-recovery-tests',
    ...(windows
      ? ['pipe-output-tests', 'private-directory-tests']
      : ['linux-stream-tests', 'linux-seqpacket-worker-tests']),
    ...(linked
      ? [
          'clipboard-receive-tests',
          'clipboard-session-tests',
          'clipboard-worker-tests',
          'gdi-tests',
          'rdpei-tests',
          'rdpsnd-tests',
          'audin-tests',
          'opus-tests',
          'h264-tests',
        ]
      : []),
  ].every((name) => tests.some((entry) => entry.name === name))
)
  throw new Error('Clean native inventory incomplete');
run(
  'ctest',
  ['--test-dir', binary, '--output-on-failure', '--no-tests=error'],
  runtimeEnvironment,
);
const cli = spawnSync(
  resolve(binary, 'rdp-worker' + (windows ? '.exe' : '')),
  ['--capabilities'],
  {
    cwd: root,
    encoding: 'utf8',
    timeout: 10000,
    maxBuffer: 8192,
    env: runtimeEnvironment,
    windowsHide: true,
  },
);
if (cli.status !== 0) throw new Error('Clean native CLI unavailable');
const build = JSON.parse(cli.stdout);
const workerName = 'rdp-worker' + (windows ? '.exe' : '');
const recoveryName = 'rdp-runtime-recovery' + (windows ? '.exe' : '');
const cohort = JSON.parse(
  await readFile(resolve(binary, 'rdp-worker.runtime.json'), 'utf8'),
);
if (
  Object.keys(cohort).sort().join(',') !==
    'directorySchema,helper,helperSha256,v,worker,workerSha256' ||
  cohort.v !== 1 ||
  cohort.directorySchema !== 1 ||
  cohort.worker !== workerName ||
  cohort.helper !== recoveryName ||
  cohort.workerSha256 !==
    createHash('sha256')
      .update(await readFile(resolve(binary, workerName)))
      .digest('hex') ||
  cohort.helperSha256 !==
    createHash('sha256')
      .update(await readFile(resolve(binary, recoveryName)))
      .digest('hex')
)
  throw new Error('Clean native runtime cohort mismatch');
if (
  build.freeRdpVersion !== (linked ? '3.32.1' : null) ||
  build.targetFreeRdpVersion !== '3.32.1' ||
  build.capabilities?.lifecycle !== true ||
  build.capabilities?.rdp !== false ||
  build.capabilities?.connectCore !== linked ||
  (linked &&
    (build.capabilities?.clipboardText !== true ||
      build.capabilities?.clipboardRevoke !== true)) ||
  build.transport !== 'framed-pipes'
)
  throw new Error('Clean native profile mismatch');
if (linked && !windows) {
  const imports = spawnSync(
    'readelf',
    ['-d', resolve(binary, 'rdp-ipc.node')],
    {
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 65536,
    },
  );
  if (
    imports.status !== 0 ||
    imports.stdout
      .split('\n')
      .some((line) => line.includes('(NEEDED)') && /freerdp|winpr/i.test(line))
  )
    throw new Error('IPC-only Node addon import boundary failed');
}
const nodeDirectories = nodeTestDirectories(project, binary);
run(
  process.execPath,
  [
    '--test',
    '--test-concurrency=1',
    resolve(
      nodeDirectories.project,
      'tests/integration/clipboard-codec.test.mjs',
    ),
    resolve(nodeDirectories.project, 'tests/integration/worker.test.mjs'),
    resolve(
      nodeDirectories.project,
      'tests/integration/runtime-ownership-worker.test.mjs',
    ),
    resolve(
      nodeDirectories.project,
      'tests/integration/runtime-recovery-worker.test.mjs',
    ),
    resolve(
      nodeDirectories.project,
      'tests/integration/runtime-recovery-sdk.test.mjs',
    ),
    resolve(
      nodeDirectories.project,
      'tests/integration/runtime-recovery-cancellation.test.mjs',
    ),
    ...(windows
      ? [
          resolve(
            nodeDirectories.project,
            'tests/integration/native-node-paths.test.mjs',
          ),
        ]
      : []),
    ...(linked
      ? [
          resolve(
            nodeDirectories.project,
            'tests/integration/clipboard-worker-native.test.mjs',
          ),
          resolve(
            nodeDirectories.project,
            'tests/integration/clipboard-native-session.test.mjs',
          ),
          ...(!windows
            ? [
                resolve(
                  nodeDirectories.project,
                  'tests/integration/seqpacket-worker.test.mjs',
                ),
              ]
            : []),
        ]
      : []),
  ],
  { ...runtimeEnvironment, BRIDGE_TEST_BINARY_DIR: nodeDirectories.binary },
  nodeDirectories.project,
);
const after = createHash('sha256');
for (const name of entries) {
  const bytes = await readFile(resolve(source, name));
  after.update(name + '\0' + bytes.length + '\0').update(bytes);
  if (!bytes.equals(await readFile(resolve(project, name))))
    throw new Error('Source changed during build');
}
if (after.digest('hex') !== sourceHash)
  throw new Error('Native source fixture changed');
if (linked) {
  checkSdkSource();
  if (
    dependencyInput &&
    !dependencyInput.bytes.equals(
      readDependencyReceipt(dependencyReceiptPath, triplet).bytes,
    )
  )
    throw new Error(
      'Bound dependency receipt changed during consumer verification',
    );
  if (
    sdkReceiptBytes &&
    !sdkReceiptBytes.equals(await readFile(resolve(sdkReceiptPath)))
  )
    throw new Error('Rebuilt SDK receipt changed during verification');
  if (
    !featureBytes.equals(
      await readFile(resolve(source, 'build/native-features.json')),
    )
  )
    throw new Error('Build feature input changed');
}
const artifacts = await nativeCleanArtifactHashes(binary, linked);
artifacts[recoveryName] = cohort.helperSha256;
artifacts['rdp-worker.runtime.json'] = createHash('sha256')
  .update(await readFile(resolve(binary, 'rdp-worker.runtime.json')))
  .digest('hex');
const receipt = {
  cleanNativeSource: true,
  buildProfile,
  platform: process.platform,
  sourceFiles: entries.length,
  sourceBytes: total,
  sourceHash,
  fixture: relative(project, root),
  prebuiltOutput: false,
  buildDeadlineMs: 600000,
  foundation: !linked,
  linked,
  freerdpRebuilt: false,
  offlineCatch2: '3.8.1',
  nativeCtest: true,
  nativeTests: tests.length,
  nodeLifecycle: true,
  sourceUnchanged: true,
  ...(linked
    ? {
        sdkSourceCommit,
        ...(dependencyInput
          ? {
              dependencyBuildReceipt: relative(
                project,
                resolve(dependencyReceiptPath),
              ),
              dependencyBuildReceiptHash: dependencyInput.sha256,
              dependencyBuildSourceRebuilt: true,
            }
          : {}),
        ...(sdkReceiptBytes
          ? {
              rebuiltSdkReceipt: relative(project, resolve(sdkReceiptPath)),
              rebuiltSdkReceiptHash: createHash('sha256')
                .update(sdkReceiptBytes)
                .digest('hex'),
              sdkBuildRebuilt: true,
            }
          : {}),
        featureHash,
        artifacts,
        ...(!windows ? { nodeAddonFreerdpNeeded: false } : {}),
      }
    : { artifacts }),
};
await writeFile(
  resolve(root, 'receipt.json'),
  JSON.stringify(receipt, null, 2) + '\n',
  { flag: 'wx' },
);
console.log(JSON.stringify(receipt));
