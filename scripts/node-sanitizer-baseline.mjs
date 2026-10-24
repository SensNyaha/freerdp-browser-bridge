import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { realpath, stat, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const controls = [
  [
    'identity',
    `const assert = require('node:assert/strict');
assert.equal(process.platform, 'linux');
assert.equal(process.versions.node, '24.21.0');
assert.equal(process.config.variables.asan, 1);
process.stdout.write(JSON.stringify({ node: process.versions.node, asan: true }));`,
  ],
  [
    'evaluation',
    `const assert = require('node:assert/strict');
const vm = require('node:vm');
assert.equal(vm.runInNewContext('6 * 7'), 42);
assert.equal(Buffer.alloc(4096, 7).at(-1), 7);`,
  ],
  [
    'crypto',
    `const assert = require('node:assert/strict');
const { createHash, generateKeyPairSync, sign, verify } = require('node:crypto');
assert.equal(createHash('sha256').update('abc').digest('hex'),
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const message = Buffer.from('bridge sanitizer control');
assert.equal(verify(null, message, publicKey, sign(null, message, privateKey)), true);`,
  ],
  [
    'worker-thread',
    `const assert = require('node:assert/strict');
const { Worker } = require('node:worker_threads');
const worker = new Worker(
  "require('node:worker_threads').parentPort.postMessage(Buffer.alloc(8192, 9).at(-1))",
  { eval: true });
let received = false;
worker.on('message', value => { assert.equal(value, 9); received = true; });
worker.on('error', error => { throw error; });
worker.on('exit', code => { assert.equal(code, 0); assert.equal(received, true); });`,
  ],
];

/** No inherited loader flags, preloads or sanitizer overrides enter a control. */
export function sanitizerControlEnvironment(nodePath, inherited = process.env) {
  for (const name of [
    'ASAN_OPTIONS',
    'LSAN_OPTIONS',
    'UBSAN_OPTIONS',
    'LD_PRELOAD',
    'LD_AUDIT',
    'LD_LIBRARY_PATH',
    'NODE_OPTIONS',
    'NODE_PATH',
  ]) {
    if (inherited[name])
      throw new Error('SANITIZER_CONTROL_ENVIRONMENT_OVERRIDE');
  }
  return { PATH: dirname(nodePath) + ':/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' };
}

export function runSanitizerControl(
  nodePath,
  source,
  { env, timeoutMs = 30000 },
) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000)
    throw new Error('SANITIZER_CONTROL_INVALID_DEADLINE');
  return new Promise((resolveResult) => {
    const child = spawn(nodePath, ['--eval', source], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const chunks = { stdout: [], stderr: [] };
    let bytes = 0,
      timedOut = false,
      outputExceeded = false,
      spawnFailed = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    for (const name of ['stdout', 'stderr']) {
      child[name].on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > 1024 * 1024) {
          outputExceeded = true;
          child.kill('SIGKILL');
        } else chunks[name].push(chunk);
      });
    }
    child.on('error', () => {
      spawnFailed = true;
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(chunks.stdout).toString('utf8');
      const stderr = Buffer.concat(chunks.stderr).toString('utf8');
      const diagnostic =
        /(?:Address|Leak|UndefinedBehavior)Sanitizer|runtime error:/i.test(
          stdout + stderr,
        );
      resolveResult({
        passed:
          code === 0 &&
          signal === null &&
          !timedOut &&
          !outputExceeded &&
          !spawnFailed &&
          !diagnostic,
        code,
        signal,
        timedOut,
        outputExceeded,
        spawnFailed,
        diagnostic,
        stdout,
        stderr,
      });
    });
  });
}

/** A successful baseline permits addon testing; it is not addon acceptance. */
export async function verifyNodeSanitizerBaseline(nodePath, outputDirectory) {
  await mkdir(outputDirectory, { recursive: true });
  const receiptPath = join(outputDirectory, 'node-sanitizer-baseline.json');
  // An unavailable/invalid runtime must not leave a previous successful receipt.
  await writeFile(
    receiptPath,
    JSON.stringify({ schema: 1, passed: false }) + '\n',
  );
  const executable = await realpath(nodePath);
  const environment = sanitizerControlEnvironment(executable);
  const size = (await stat(executable)).size;
  if (size < 1 || size > 2 * 1024 * 1024 * 1024)
    throw new Error('SANITIZER_NODE_BINARY_SIZE');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(executable)) hash.update(chunk);
  const receipt = {
    schema: 1,
    nodeVersion: '24.21.0',
    nodeBinarySha256: hash.digest('hex'),
    defaultSanitizerOptions: true,
    bridgeAddonLoaded: false,
    controls: [],
    passed: false,
  };
  for (const [name, source] of controls) {
    const result = await runSanitizerControl(executable, source, {
      env: environment,
    });
    if (
      name === 'identity' &&
      result.stdout !== JSON.stringify({ node: '24.21.0', asan: true })
    )
      result.passed = false;
    receipt.controls.push({
      name,
      passed: result.passed,
      exitCode: result.code,
      signal: result.signal,
      timedOut: result.timedOut,
      outputExceeded: result.outputExceeded,
      spawnFailed: result.spawnFailed,
      sanitizerDiagnostic: result.diagnostic,
      stderrBytes: Buffer.byteLength(result.stderr),
      stderrSha256: createHash('sha256').update(result.stderr).digest('hex'),
    });
    if (!result.passed) {
      await writeFile(
        join(outputDirectory, 'node-sanitizer-baseline.stderr.log'),
        result.stderr,
      );
      break;
    }
  }
  receipt.passed =
    receipt.controls.length === controls.length &&
    receipt.controls.every((control) => control.passed);
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  if (!receipt.passed) throw new Error('SANITIZER_NODE_BASELINE_FAILED');
  return receipt;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    if (process.argv.length !== 4)
      throw new Error(
        'Usage: node scripts/node-sanitizer-baseline.mjs NODE OUTPUT_DIRECTORY',
      );
    const receipt = await verifyNodeSanitizerBaseline(
      process.argv[2],
      process.argv[3],
    );
    console.log(JSON.stringify(receipt));
  } catch (error) {
    console.error(
      error.message === 'SANITIZER_NODE_BASELINE_FAILED'
        ? error.message
        : 'SANITIZER_NODE_BASELINE_UNAVAILABLE',
    );
    process.exitCode = 1;
  }
}
