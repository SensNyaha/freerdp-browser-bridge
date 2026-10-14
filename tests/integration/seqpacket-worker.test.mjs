import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { WorkerProcess } from '../../packages/node-bridge/dist/index.js';
import { createBuildServer } from '../../apps/bridge-api/dist/index.js';
import { Kind } from '../../packages/protocol/dist/index.js';

const binaryDir = resolve(
  process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
);
const workerPath = join(binaryDir, 'rdp-worker');
const skip =
  process.platform !== 'linux' || !existsSync(join(binaryDir, 'rdp-ipc.node'));
const transport = 'unix-seqpacket-rws1';
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
async function withRoot(run) {
  const root = await mkdtemp(join(tmpdir(), 'rdp-socket-supervisor-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test(
  'actual Node packet supervisor: 100 sequential native workers, heartbeat, close and no descriptor/runtime leak',
  { skip, timeout: 120000 },
  async () => {
    const before = (await readdir('/proc/self/fd')).length;
    await withRoot(async (runtimeRoot) => {
      for (let i = 0; i < 100; i++) {
        const worker = new WorkerProcess({
          workerPath,
          runtimeRoot,
          ipcTransport: transport,
        });
        try {
          const build = await worker.start();
          const pid = worker.pid;
          assert.equal(build.transport, transport);
          assert.equal(build.targetFreeRdpVersion, '3.32.1');
          await worker.ping();
          await worker.close();
          await worker.close();
          assert.equal(worker.state, 'closed');
          assert.equal(alive(pid), false);
          assert.deepEqual(await readdir(runtimeRoot), []);
        } finally {
          await worker.close();
        }
      }
    });
    assert.equal((await readdir('/proc/self/fd')).length, before);
  },
);
test(
  'actual Node packet supervisor: worker crash joins native socket cleanup before lifecycle completion',
  { skip, timeout: 10000 },
  async () => {
    await withRoot(async (runtimeRoot) => {
      const worker = new WorkerProcess({
        workerPath,
        runtimeRoot,
        ipcTransport: transport,
      });
      await worker.start();
      const failed = once(worker, 'failure');
      process.kill(worker.pid, 'SIGKILL');
      await failed;
      await worker.close();
      assert.equal(worker.state, 'failed');
      assert.deepEqual(await readdir(runtimeRoot), []);
    });
  },
);
test(
  'actual packet parent death: hard-killed Node owner closes worker/socket and removes owned runtime',
  { skip, timeout: 10000 },
  async () => {
    await withRoot(async (runtimeRoot) => {
      const parent = spawn(
        process.execPath,
        [
          resolve('tests/fixtures/parent.mjs'),
          workerPath,
          runtimeRoot,
          transport,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      parent.stderr.resume();
      let pid;
      try {
        const [chunk] = await once(parent.stdout, 'data');
        pid = JSON.parse(chunk.toString()).pid;
        assert.equal(alive(pid), true);
        const closed = once(parent, 'close');
        parent.kill('SIGKILL');
        await closed;
        const due = Date.now() + 5000;
        while (
          Date.now() < due &&
          (alive(pid) || (await readdir(runtimeRoot)).length)
        )
          await delay(25);
        assert.equal(alive(pid), false);
        assert.deepEqual(await readdir(runtimeRoot), []);
      } finally {
        parent.kill('SIGKILL');
        if (pid && alive(pid)) process.kill(pid, 'SIGKILL');
      }
    });
  },
);
test(
  'actual Node packet startup: cancellation during held owner creation joins retirement and never spawns',
  { skip, timeout: 10000 },
  async () => {
    await withRoot(async (runtimeRoot) => {
      let created, release;
      const ready = new Promise((resolve) => {
        created = resolve;
      });
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      let spawns = 0;
      class Held extends WorkerProcess {
        async createPacketOwner() {
          const owner = await super.createPacketOwner();
          created();
          await gate;
          return owner;
        }
        spawnWorker(...args) {
          ++spawns;
          return super.spawnWorker(...args);
        }
      }
      const worker = new Held({
        workerPath,
        runtimeRoot,
        ipcTransport: transport,
      });
      const start = worker.start();
      await ready;
      worker.terminate();
      release();
      await assert.rejects(start, { code: 'WORKER_TERMINATED' });
      await worker.close();
      assert.equal(spawns, 0);
      assert.deepEqual(await readdir(runtimeRoot), []);
    });
  },
);
test(
  'fake legacy framed peer: explicit packet selection fails before configure/secret and joins cleanup',
  { skip, timeout: 10000 },
  async () => {
    await withRoot(async (runtimeRoot) => {
      const worker = new WorkerProcess({
        workerPath: join(binaryDir, 'fixture-worker-1'),
        runtimeRoot,
        ipcTransport: transport,
        startupTimeoutMs: 200,
      });
      await assert.rejects(worker.start(), { code: 'IPC_TIMEOUT' });
      await worker.close();
      assert.deepEqual(await readdir(runtimeRoot), []);
    });
  },
);
test(
  'synthetic packet handshake metadata: wrong carrier identity refuses before connection credentials',
  { skip, timeout: 10000 },
  async () => {
    await withRoot(async (runtimeRoot) => {
      const issued = [];
      class WrongMetadata extends WorkerProcess {
        async createPacketOwner() {
          const owner = await super.createPacketOwner();
          const write = owner.write.bind(owner);
          owner.write = (bytes, done) => {
            issued.push(bytes.readUInt16BE(6));
            return write(bytes, done);
          };
          owner.prependListener('data', (chunk) => {
            const at = chunk.indexOf(transport);
            if (at >= 0) chunk.fill(88, at, at + transport.length);
          });
          return owner;
        }
      }
      const worker = new WrongMetadata({
        workerPath,
        runtimeRoot,
        ipcTransport: transport,
      });
      await assert.rejects(worker.start(), { code: 'IPC_TRANSPORT_MISMATCH' });
      await worker.close();
      assert.deepEqual(issued, [Kind.Hello]);
      assert.deepEqual(await readdir(runtimeRoot), []);
    });
  },
);
test(
  'actual packet build REST: selected carrier comes from the real handshake and cleanup stays empty',
  { skip, timeout: 10000 },
  async () => {
    await withRoot(async (runtimeRoot) => {
      const server = await createBuildServer({
        workerPath,
        runtimeRoot,
        ipcTransport: transport,
      });
      try {
        const response = await server.inject('/v1/build');
        assert.equal(response.statusCode, 200);
        assert.equal(response.json().transport, transport);
      } finally {
        await server.close();
      }
      assert.deepEqual(await readdir(runtimeRoot), []);
    });
  },
);
test(
  'actual packet private settings/secret: local connection refusal leaves heartbeat healthy with no credentials in argv/env',
  { skip, timeout: 15000 },
  async (t) => {
    await withRoot(async (runtimeRoot) => {
      const password = 'synthetic-packet-private-password';
      let spawned;
      class Recorded extends WorkerProcess {
        spawnWorker(directory, env) {
          assert.equal(
            Object.values(env).some((value) => value.includes(password)),
            false,
          );
          spawned = super.spawnWorker(directory, env);
          return spawned;
        }
      }
      const worker = new Recorded({
        workerPath,
        runtimeRoot,
        ipcTransport: transport,
      });
      try {
        const build = await worker.start();
        if (!build.capabilities.connectCore) {
          t.skip('foundation lacks native settings');
          return;
        }
        await worker.connect({
          target: { host: '127.0.0.1', port: 1 },
          auth: { username: 'synthetic-user', password },
        });
        assert.equal(
          spawned.spawnargs.some(
            (value) =>
              value.includes(password) || value.includes('synthetic-user'),
          ),
          false,
        );
        assert.deepEqual(spawned.spawnargs.slice(1), ['--ipc-seqpacket-fd=3']);
        await worker.ping();
      } finally {
        await worker.close();
      }
      assert.deepEqual(await readdir(runtimeRoot), []);
    });
  },
);
