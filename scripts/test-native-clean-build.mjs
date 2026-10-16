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
import { resolve, dirname, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
const windows = process.platform === 'win32';
const [catchSource, ...extra] = process.argv.slice(2);
if (
  (!windows && process.platform !== 'linux') ||
  process.versions.node.split('.')[0] !== '24' ||
  resolve('.') !== project ||
  !catchSource ||
  extra.length
)
  throw new Error(
    'Use the Linux/Windows project root, Node 24 and explicit offline Catch2 source',
  );
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
const run = (command, args, env = process.env, cwd = root) => {
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: 'inherit',
    timeout: 180000,
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error('Clean native verification failed');
};
run('cmake', [
  '-S',
  source,
  '-B',
  binary,
  '-G',
  'Ninja',
  '-DCMAKE_BUILD_TYPE=Debug',
  '-DBUILD_TESTING=ON',
  '-DBRIDGE_WITH_FREERDP=OFF',
  '-DBRIDGE_NODE_IPC=OFF',
  '-DFETCHCONTENT_FULLY_DISCONNECTED=ON',
  '-DFETCHCONTENT_SOURCE_DIR_CATCH2=' +
    resolve(catchSource).replaceAll('\\', '/'),
]);
run('cmake', ['--build', binary, '--parallel', '8']);
const query = spawnSync(
  'ctest',
  ['--test-dir', binary, '--show-only=json-v1'],
  {
    cwd: root,
    encoding: 'utf8',
    timeout: 10000,
    maxBuffer: 1024 * 1024,
  },
);
if (query.status !== 0) throw new Error('Clean native inventory unavailable');
const tests = JSON.parse(query.stdout).tests;
if (
  !Array.isArray(tests) ||
  tests.length < (windows ? 14 : 15) ||
  tests.length > 128 ||
  ![
    'clipboard-text-tests',
    'clipboard-ingress-tests',
    'clipboard-wire-tests',
    'ipc-tests',
    ...(windows
      ? ['pipe-output-tests', 'private-directory-tests']
      : ['linux-stream-tests', 'linux-seqpacket-worker-tests']),
  ].every((name) => tests.some((entry) => entry.name === name))
)
  throw new Error('Clean native inventory incomplete');
run('ctest', ['--test-dir', binary, '--output-on-failure', '--no-tests=error']);
const cli = spawnSync(
  resolve(binary, 'rdp-worker' + (windows ? '.exe' : '')),
  ['--capabilities'],
  {
    cwd: root,
    encoding: 'utf8',
    timeout: 10000,
    maxBuffer: 8192,
  },
);
if (cli.status !== 0) throw new Error('Clean native CLI unavailable');
const build = JSON.parse(cli.stdout);
if (
  build.freeRdpVersion !== null ||
  build.targetFreeRdpVersion !== '3.32.1' ||
  build.capabilities?.lifecycle !== true ||
  build.capabilities?.rdp !== false ||
  build.capabilities?.connectCore !== false ||
  build.transport !== 'framed-pipes'
)
  throw new Error('Clean foundation profile mismatch');
run(
  process.execPath,
  [
    '--test',
    '--test-concurrency=1',
    resolve(project, 'tests/integration/clipboard-codec.test.mjs'),
    resolve(project, 'tests/integration/worker.test.mjs'),
  ],
  { ...process.env, BRIDGE_TEST_BINARY_DIR: binary },
  project,
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
const receipt = {
  cleanNativeSource: true,
  platform: process.platform,
  sourceFiles: entries.length,
  sourceBytes: total,
  sourceHash,
  fixture: relative(project, root),
  prebuiltOutput: false,
  foundation: true,
  freerdpRebuilt: false,
  offlineCatch2: '3.8.1',
  nativeCtest: true,
  nativeTests: tests.length,
  nodeLifecycle: true,
  sourceUnchanged: true,
};
await writeFile(
  resolve(root, 'receipt.json'),
  JSON.stringify(receipt, null, 2) + '\n',
  { flag: 'wx' },
);
console.log(JSON.stringify(receipt));
