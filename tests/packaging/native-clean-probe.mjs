// Independent artifact-only fixture: no workspace packages, RDP server or devices.
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  mkdtemp,
  writeFile,
  readdir,
  access,
  rm,
  realpath,
} from 'node:fs/promises';
import { join, relative, isAbsolute, sep } from 'node:path';

assert.equal(process.platform, 'linux');
assert.match(process.version, /^v24\./);
assert.notEqual(process.getuid(), 0);
assert.equal(process.argv.length, 3);
const root = await realpath(process.argv[2]);
const workerPath = join(root, 'bin', 'rdp-worker');
const env = Object.fromEntries(
  ['PATH', 'HOME'].flatMap((key) =>
    process.env[key] === undefined ? [] : [[key, process.env[key]]],
  ),
);
const run = (file, args) =>
  promisify(execFile)(file, args, { env, timeout: 5000, maxBuffer: 16384 });
const info = JSON.parse((await run(workerPath, ['--version'])).stdout);
assert.equal(info.freeRdpVersion, '3.32.1');
const output = (await run(join(root, 'bin', 'rdp-runtime-check'), [])).stdout;
const probe = Object.fromEntries(
  output
    .trim()
    .split('\n')
    .map((line) => {
      const at = line.indexOf('=');
      return [line.slice(0, at), line.slice(at + 1)];
    }),
);
for (const name of [
  'jpegRoundtrip',
  'h264Roundtrip',
  'freerdpAvc420Roundtrip',
  'opusRoundtrip',
  'udevContextRoundtrip',
])
  assert.equal(probe[name], 'true');
const modules = [
  'runtime',
  'freerdpRuntime',
  'jpegRuntime',
  'openh264Runtime',
  'opusRuntime',
  'udevRuntime',
];
for (const name of modules) {
  const part = relative(root, await realpath(probe[name]));
  assert.ok(
    part !== '' &&
      part !== '..' &&
      !part.startsWith('..' + sep) &&
      !isAbsolute(part),
  );
}
const runtimeRoot = '/run/rdp-bridge-tests';
assert.deepEqual(await readdir(runtimeRoot), []);
const directory = await mkdtemp(join(runtimeRoot, 'worker-'));
await writeFile(join(directory, '.rdp-worker-owned'), 'runtime-v1', {
  mode: 0o600,
  flag: 'wx',
});
const packet = (kind, id, body = Buffer.alloc(0)) => {
  const header = Buffer.alloc(24);
  header.write('RWI1');
  header.writeUInt16BE(1, 4);
  header.writeUInt16BE(kind, 6);
  header.writeBigUInt64BE(id, 12);
  header.writeUInt32BE(body.length, 20);
  return Buffer.concat([header, body]);
};
const child = spawn(workerPath, [], {
  cwd: directory,
  env,
  stdio: ['pipe', 'pipe', 'pipe'],
});
const closed = new Promise((resolve) => child.once('close', resolve));
try {
  const reply = await new Promise((resolve, reject) => {
    let bytes = Buffer.alloc(0);
    let stderr = false;
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Native clean lifecycle deadline'));
    }, 5000);
    child.stdout.on('data', (chunk) => {
      if (bytes.length + chunk.length > 8192) {
        child.kill('SIGKILL');
        reject(new Error('Native clean reply bound'));
      } else bytes = Buffer.concat([bytes, chunk]);
    });
    child.stderr.on('data', () => {
      stderr = true;
    });
    child.stdin.on('error', reject);
    child.on('error', reject);
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      if (code !== 0 || signal || stderr)
        reject(new Error('Native clean lifecycle failed'));
      else resolve(bytes);
    });
    child.stdin.end(
      Buffer.concat([
        packet(1, 1n, Buffer.from('0001000100000000', 'hex')),
        packet(3, 2n),
        packet(5, 3n),
      ]),
    );
  });
  let at = 0;
  for (const [kind, id] of [
    [2, 1n],
    [4, 2n],
    [6, 3n],
  ]) {
    assert.ok(reply.length >= at + 24);
    assert.equal(reply.toString('ascii', at, at + 4), 'RWI1');
    assert.equal(reply.readUInt16BE(at + 4), 1);
    assert.equal(reply.readUInt16BE(at + 6), kind);
    assert.equal(reply.readUInt32BE(at + 8), 0);
    assert.equal(reply.readBigUInt64BE(at + 12), id);
    const length = reply.readUInt32BE(at + 20);
    assert.ok(kind === 2 ? length >= 8 && length <= 4096 : length === 0);
    assert.ok(reply.length >= at + 24 + length);
    at += 24 + length;
  }
  assert.equal(at, reply.length);
  await assert.rejects(access(directory), { code: 'ENOENT' });
  assert.deepEqual(await readdir(runtimeRoot), []);
  console.log(
    JSON.stringify({
      node: process.version,
      uid: process.getuid(),
      freerdp: info.freeRdpVersion,
      modules: modules.length,
      acknowledgements: 3,
      cleanup: true,
    }),
  );
} finally {
  if (child.exitCode === null && child.signalCode === null)
    child.kill('SIGKILL');
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Native clean termination deadline')),
      2000,
    );
    void closed.then(() => {
      clearTimeout(timeout);
      resolve();
    });
  });
  await rm(directory, { recursive: true, force: true });
}
