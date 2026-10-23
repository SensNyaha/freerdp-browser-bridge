import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { WorkerProcess } from '../../packages/node-bridge/dist/index.js';
import { eventually } from '../fixtures/session-worker.mjs';

const workerPath = join(
  resolve(process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation'),
  'rdp-worker.exe',
);
const options = {
  workerPath,
  ipcTransport: 'framed-pipes',
  maxCpuPercent: 10000,
  maxResidentBytes: 1024 * 1024 * 1024,
  cpuPollIntervalMs: 100,
  residentPollIntervalMs: 100,
};

test(
  'synthetic combined query / actual Windows worker: one shared flight, close abort and joined late-result disposal',
  { skip: process.platform !== 'win32', timeout: 15000 },
  async () => {
    let finish;
    class Delayed extends WorkerProcess {
      calls = 0;
      signal;
      sampleResourceUsage(_pid, signal) {
        ++this.calls;
        this.signal = signal;
        const startedNs = process.hrtime.bigint();
        return new Promise((done) => {
          finish = () =>
            done({
              bytes: Number.MAX_SAFE_INTEGER,
              micros: Number.MAX_SAFE_INTEGER,
              startedNs,
              completedNs: process.hrtime.bigint(),
            });
        });
      }
    }
    const root = await mkdtemp(join(tmpdir(), 'rdp-combined-close-'));
    const worker = new Delayed({ ...options, runtimeRoot: root });
    const failures = [];
    worker.on('failure', (error) => failures.push(error.code));
    let closing;
    try {
      await worker.start();
      await eventually(() => worker.calls === 1, 5000);
      await delay(250);
      assert.equal(worker.calls, 1);
      let closed = false;
      closing = worker.close().then(() => {
        closed = true;
      });
      await eventually(() => worker.signal.aborted, 5000);
      await delay(50);
      assert.equal(closed, false);
      finish();
      await closing;
      assert.equal(worker.calls, 1);
      assert.deepEqual(failures, []);
      assert.deepEqual(await readdir(root), []);
    } finally {
      finish?.();
      await (closing ?? worker.close());
      await rm(root, { recursive: true, force: true, maxRetries: 3 });
    }
  },
);

test(
  'actual Windows combined query: memory breach retains its exact failure and retires native ownership',
  { skip: process.platform !== 'win32', timeout: 15000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'rdp-combined-limit-'));
    const worker = new WorkerProcess({
      ...options,
      maxResidentBytes: 1,
      runtimeRoot: root,
    });
    try {
      const failure = once(worker, 'failure');
      await worker.start();
      const pid = worker.pid;
      assert.equal((await failure)[0].code, 'WORKER_MEMORY_LIMIT');
      await worker.close();
      assert.throws(() => process.kill(pid, 0));
      assert.deepEqual(await readdir(root), []);
    } finally {
      await worker.close();
      await rm(root, { recursive: true, force: true, maxRetries: 3 });
    }
  },
);
