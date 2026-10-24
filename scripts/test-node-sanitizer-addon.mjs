import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  sanitizerControlEnvironment,
  verifyNodeSanitizerBaseline,
} from './node-sanitizer-baseline.mjs';

const connectedTest =
  'actual packet private settings/secret: local connection refusal leaves heartbeat healthy with no credentials in argv/env';

/** The foundation has one explicitly separate connected-RDP test, never a blanket skip allowance. */
export function assessSanitizerAddonTap(output, expectedTests, foundation) {
  const entries = [...output.matchAll(/^(not )?ok \d+ - (.+)$/gm)];
  const skipped = entries.filter((entry) => / # SKIP(?: |$)/.test(entry[2]));
  const expectedSkipped = foundation ? 1 : 0;
  if (
    entries.length !== expectedTests ||
    entries.some((entry) => entry[1] || / # TODO(?: |$)/.test(entry[2])) ||
    skipped.length !== expectedSkipped ||
    (foundation &&
      skipped[0]?.[2] !==
        connectedTest + ' # SKIP foundation lacks native settings') ||
    !output.includes('# tests ' + expectedTests + '\n') ||
    !output.includes('# pass ' + (expectedTests - expectedSkipped) + '\n') ||
    !output.includes('# fail 0\n') ||
    !output.includes('# skipped ' + expectedSkipped + '\n')
  )
    throw new Error('SANITIZER_ADDON_REQUIRED_TESTS_INCOMPLETE');
  return { passed: expectedTests - expectedSkipped, skipped: expectedSkipped };
}

async function sha256(path) {
  const hash = createHash('sha256');
  let size = 0;
  for await (const bytes of createReadStream(path)) {
    if ((size += bytes.length) > 1024 * 1024 * 1024)
      throw new Error('SANITIZER_ADDON_INPUT_SIZE');
    hash.update(bytes);
  }
  return hash.digest('hex');
}

/** Run from a prepared Linux checkout with a fresh sanitizer+IPC foundation tree. */
export async function verifySanitizerAddon(node, binary, output) {
  await mkdir(output, { recursive: true });
  const receiptPath = join(output, 'node-sanitizer-addon.json');
  const receipt = {
    schema: 1,
    passed: false,
    scope: 'linux-ipc-only-foundation',
  };
  await writeFile(receiptPath, JSON.stringify(receipt) + '\n');
  const project = await realpath('.');
  const executable = await realpath(node);
  binary = await realpath(binary);
  const environment = sanitizerControlEnvironment(executable);
  if (process.platform !== 'linux')
    throw new Error('SANITIZER_ADDON_REQUIRES_LINUX');
  const cache = await readFile(join(binary, 'CMakeCache.txt'), 'utf8');
  for (const entry of [
    'BRIDGE_SANITIZERS:BOOL=ON',
    'BRIDGE_NODE_IPC:BOOL=ON',
    'BRIDGE_WITH_FREERDP:BOOL=OFF',
    'BUILD_TESTING:BOOL=ON',
    'CMAKE_BUILD_TYPE:STRING=Debug',
    'CMAKE_HOME_DIRECTORY:INTERNAL=' + project,
    'BRIDGE_NODE_EXECUTABLE:FILEPATH=' + executable,
    'BRIDGE_NODE_INCLUDE_DIR:PATH=' + resolve(executable, '../../include/node'),
  ])
    if (!cache.split('\n').includes(entry))
      throw new Error('SANITIZER_ADDON_BUILD_PROFILE');

  receipt.baseline = await verifyNodeSanitizerBaseline(executable, output);
  // Compiler tools may be on a dedicated public-tools PATH; runtime children
  // still receive only the verifier's minimal environment and one binary path.
  const toolEnvironment = { ...environment, PATH: process.env.PATH };
  function run(name, command, args, env = toolEnvironment, timeout = 180000) {
    const result = spawnSync(command, args, {
      env,
      encoding: 'utf8',
      timeout,
      maxBuffer: 2 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const text = (result.stdout ?? '') + (result.stderr ?? '');
    // Retain at most the same bounded subprocess output in the evidence.
    return writeFile(join(output, name + '.log'), text).then(() => {
      if (
        result.error ||
        result.status !== 0 ||
        result.signal ||
        /(?:Address|Leak|UndefinedBehavior)Sanitizer|runtime error:/i.test(text)
      )
        throw new Error('SANITIZER_ADDON_' + name.toUpperCase() + '_FAILED');
      return text;
    });
  }
  await run(
    'build',
    'cmake',
    ['--build', binary, '--parallel', '2'],
    toolEnvironment,
    600000,
  );
  const commands = JSON.parse(
    await readFile(join(binary, 'compile_commands.json'), 'utf8'),
  );
  const owned = commands.filter((entry) =>
    entry.file.startsWith(project + '/native/'),
  );
  if (
    owned.length < 94 ||
    !owned.every((entry) =>
      [
        '-fsanitize=address,undefined',
        '-fno-sanitize-recover=undefined',
        '-fno-omit-frame-pointer',
      ].every((flag) => entry.command.split(/\s+/).includes(flag)),
    )
  )
    throw new Error('SANITIZER_ADDON_COMPILE_FLAGS');
  receipt.ownedTranslationUnits = owned.length;
  receipt.sources = {};
  for (const file of [
    ...new Set([
      join(project, 'CMakeLists.txt'),
      ...owned.map((entry) => entry.file),
    ]),
  ].sort())
    receipt.sources[file.slice(project.length + 1)] = await sha256(file);
  receipt.artifacts = {};
  for (const name of [
    'rdp-worker',
    'rdp-ipc.node',
    'fixture-node-sanitizer.node',
  ]) {
    const path = join(binary, name);
    const dynamic = await run('elf-' + name, 'readelf', ['-d', path]);
    for (const family of ['asan', 'ubsan'])
      if (!new RegExp('NEEDED.*lib' + family + '\\.so').test(dynamic))
        throw new Error('SANITIZER_ADDON_ELF_RUNTIME');
    if (/NEEDED.*(?:freerdp|winpr)/i.test(dynamic))
      throw new Error('SANITIZER_ADDON_FREERDP_BOUNDARY');
    receipt.artifacts[name] = await sha256(path);
  }
  const inventory = JSON.parse(
    await run('ctest-inventory', 'ctest', [
      '--test-dir',
      binary,
      '--show-only=json-v1',
    ]),
  );
  const names = inventory.tests.map((entry) => entry.name);
  if (
    names.length !== 22 ||
    !['sanitizer-runtime-tests', 'node-sanitizer-runtime-tests'].every((name) =>
      names.includes(name),
    )
  )
    throw new Error('SANITIZER_ADDON_CTEST_INCOMPLETE');
  await run('ctest', 'ctest', [
    '--test-dir',
    binary,
    '--output-on-failure',
    '--no-tests=error',
  ]);
  receipt.nativeTests = names.length;
  receipt.suites = {};
  for (const [suite, count] of [
    ['seqpacket-addon', 14],
    ['seqpacket-worker', 10],
    ['seqpacket-capacity', 1],
  ]) {
    const tap = await run(
      suite,
      executable,
      [
        '--test',
        '--test-concurrency=1',
        '--test-reporter=tap',
        'tests/integration/' + suite + '.test.mjs',
      ],
      { ...environment, BRIDGE_TEST_BINARY_DIR: binary },
    );
    receipt.suites[suite] = assessSanitizerAddonTap(
      tap,
      count,
      suite === 'seqpacket-worker',
    );
  }
  const origins = await run(
    'loaded-runtimes',
    executable,
    [
      '--eval',
      `
const assert = require('node:assert/strict');
require(${JSON.stringify(join(binary, 'rdp-ipc.node'))});
const maps = require('node:fs').readFileSync('/proc/self/maps', 'utf8');
assert.doesNotMatch(maps, /\\/lib(?:freerdp|winpr)[^/\\s]*\\.so/i);
const paths = [...new Set(maps.split('\\n').map(line => line.trim().split(/\\s+/).at(-1)).filter(path => /\\/lib(?:asan|ubsan)\\.so\\./.test(path)))].sort();
for (const family of ['asan', 'ubsan']) assert.equal(paths.filter(path => path.includes('/lib' + family + '.so.')).length, 1);
process.stdout.write(JSON.stringify(paths));
`,
    ],
    environment,
  );
  receipt.loadedSanitizerRuntimes = JSON.parse(origins);
  for (const [name, hash] of Object.entries(receipt.sources))
    if ((await sha256(join(project, name))) !== hash)
      throw new Error('SANITIZER_ADDON_SOURCE_CHANGED');
  for (const [name, hash] of Object.entries(receipt.artifacts))
    if ((await sha256(join(binary, name))) !== hash)
      throw new Error('SANITIZER_ADDON_ARTIFACT_CHANGED');
  receipt.passed = true;
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  return receipt;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    if (process.argv.length !== 5) throw new Error('SANITIZER_ADDON_ARGUMENTS');
    const receipt = await verifySanitizerAddon(...process.argv.slice(2));
    console.log(
      JSON.stringify({ passed: receipt.passed, suites: receipt.suites }),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
