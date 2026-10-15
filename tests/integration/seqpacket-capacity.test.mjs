import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { WorkerProcess } from '../../packages/node-bridge/dist/index.js';

const binaryDir = resolve(
  process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
);
const workerPath = join(binaryDir, 'rdp-worker');
const skip =
  process.platform !== 'linux' || !existsSync(join(binaryDir, 'rdp-ipc.node'));
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test(
  'actual Linux packet capacity: 32 native workers, refused overflow, slot replacement and joined fd/runtime cleanup',
  { skip, timeout: 60000 },
  async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'rdp-packet-capacity-'));
    const all = [],
      live = [],
      pids = new Set();
    const create = () => {
      const worker = new WorkerProcess({
        workerPath,
        runtimeRoot,
        ipcTransport: 'unix-seqpacket-rws1',
        heartbeatIntervalMs: 1000,
      });
      all.push(worker);
      return worker;
    };
    const start = async (count) => {
      // Bounded startup concurrency avoids measuring a machine's spawn burst limit.
      for (let at = 0; at < count; at += 4) {
        const batch = Array.from({ length: Math.min(4, count - at) }, create);
        await Promise.all(
          batch.map(async (worker) => {
            assert.equal(
              (await worker.start()).transport,
              'unix-seqpacket-rws1',
            );
            assert.ok(Number.isInteger(worker.pid));
            pids.add(worker.pid);
            live.push(worker);
          }),
        );
      }
    };
    const close = async (workers) => {
      const results = await Promise.allSettled(
        workers.map((worker) => worker.close()),
      );
      for (const result of results) assert.equal(result.status, 'fulfilled');
    };
    try {
      const warm = create();
      await warm.start();
      await warm.close();
      const before = (await readdir('/proc/self/fd')).length;
      await start(32);
      assert.equal(live.length, 32);
      assert.equal((await readdir(runtimeRoot)).length, 32);
      const extra = create();
      await assert.rejects(extra.start(), { code: 'WORKER_START_FAILED' });
      assert.equal(extra.pid, undefined);
      await extra.close();
      assert.equal((await readdir(runtimeRoot)).length, 32);
      await delay(2200);
      await Promise.all(live.map((worker) => worker.ping()));
      assert.ok(live.every((worker) => worker.state === 'ready'));
      const retired = live.splice(0, 16);
      await close(retired);
      for (const worker of retired) assert.equal(alive(worker.pid), false);
      assert.equal((await readdir(runtimeRoot)).length, 16);
      await start(16);
      assert.equal(live.length, 32);
      await Promise.all(live.map((worker) => worker.ping()));
      assert.equal((await readdir(runtimeRoot)).length, 32);
      await close(live);
      for (const pid of pids) assert.equal(alive(pid), false);
      assert.deepEqual(await readdir(runtimeRoot), []);
      assert.equal((await readdir('/proc/self/fd')).length, before);
    } finally {
      await close(all);
      await rm(runtimeRoot, { recursive: true, force: true });
    }
  },
);
