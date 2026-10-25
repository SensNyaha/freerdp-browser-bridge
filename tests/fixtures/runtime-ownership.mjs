import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, rm, rmdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  Kind,
  PacketDecoder,
  encodePacket,
  helloPayload,
} from '../../packages/protocol/dist/index.js';

const suffix = process.platform === 'win32' ? '.exe' : '';
export const binaryDir = resolve(
  process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
);
const workerPath = join(binaryDir, 'rdp-worker' + suffix);
const exec = promisify(execFile);
export async function runtimeFixture(
  run,
  { ownerId = randomBytes(16).toString('hex') } = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'bridge-native-lease-'));
  const directory = join(
    root,
    `worker-${ownerId}-1-${randomBytes(16).toString('hex')}`,
  );
  try {
    if (process.platform === 'win32') {
      // A fresh mkdtemp can inherit host-specific grants to other users. The
      // positive recovery fixture needs the actual private helper boundary.
      await rmdir(root);
      await exec(
        join(binaryDir, 'rdp-runtime-directory.exe'),
        ['--create-private-directory', root],
        { windowsHide: true, timeout: 5000, maxBuffer: 4096 },
      );
      await exec(
        join(binaryDir, 'rdp-runtime-directory.exe'),
        ['--create-private-directory', directory],
        { windowsHide: true, timeout: 5000, maxBuffer: 4096 },
      );
    } else await mkdir(directory, { mode: 0o700 });
    await writeFile(join(directory, '.rdp-worker-owned'), 'runtime-v1', {
      flag: 'wx',
      mode: 0o600,
    });
    await run(root, directory);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
}
export function launchRuntimeWorker(directory) {
  const child = spawn(workerPath, [], {
    cwd: directory,
    windowsHide: true,
    detached: process.platform === 'win32',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const closed = once(child, 'close');
  child.stdin.on('error', () => {});
  const packets = [];
  const decoder = new PacketDecoder();
  let output = 0;
  let stderr = '';
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  child.stdout.on('data', (bytes) => {
    output += bytes.length;
    if (output > 16384) {
      child.kill('SIGKILL');
      return;
    }
    decoder.push(bytes, (packet) => {
      packets.push(packet);
      if (packet.kind === Kind.HelloAck) resolveReady(true);
    });
  });
  child.stderr.on('data', (bytes) => {
    if (stderr.length + bytes.length > 4096) child.kill('SIGKILL');
    else stderr += bytes.toString('utf8');
  });
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  closed.then(
    () => {
      clearTimeout(timer);
      resolveReady(false);
    },
    () => {
      clearTimeout(timer);
      resolveReady(false);
    },
  );
  child.stdin.write(
    encodePacket({ kind: Kind.Hello, requestId: 1n, payload: helloPayload() }),
  );
  return {
    pid: child.pid,
    ready,
    closed,
    packets,
    diagnostic: () => stderr.replaceAll('\r\n', '\n'),
    async kill() {
      if (child.exitCode === null && child.signalCode === null)
        child.kill('SIGKILL');
      await closed;
    },
    async shutdown() {
      child.stdin.end(
        encodePacket({
          kind: Kind.Shutdown,
          requestId: 2n,
          payload: Buffer.alloc(0),
        }),
      );
      return closed;
    },
  };
}
