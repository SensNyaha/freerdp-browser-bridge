import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import {
  WorkerProcess,
  ProcessSampleError,
} from '../../packages/node-bridge/dist/index.js';
import { eventually } from '../fixtures/session-worker.mjs';

const binary = resolve(
  process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
);
const workerPath = join(
  binary,
  'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
);
const supported = ['win32', 'linux'].includes(process.platform);
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
async function withWorker(Worker, options, run, acceptedCloseCode) {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'rdp-memory-watchdog-'));
  const worker = new Worker({
    workerPath,
    runtimeRoot,
    ipcTransport: 'framed-pipes',
    ...options,
  });
  try {
    await run(worker, runtimeRoot);
  } finally {
    worker.terminate();
    try {
      await worker.close().catch((error) => {
        if (!acceptedCloseCode) throw error;
        assert.equal(error.code, acceptedCloseCode);
      });
    } finally {
      await rm(runtimeRoot, { recursive: true, force: true, maxRetries: 3 });
    }
  }
}

test(
  'synthetic failed RSS retirement / actual native worker: native cleanup ends but close refuses uncertain sampler retirement',
  { skip: !supported, timeout: 15000 },
  async () => {
    class Uncertain extends WorkerProcess {
      sampleResidentBytes() {
        return Promise.reject(
          new ProcessSampleError('PROCESS_SAMPLE_CLOSE_FAILED'),
        );
      }
    }
    await withWorker(
      Uncertain,
      { maxResidentBytes: 1024, residentPollIntervalMs: 100 },
      async (worker, root) => {
        const failure = once(worker, 'failure');
        await worker.start();
        const pid = worker.pid;
        assert.equal((await failure)[0].code, 'WORKER_RESOURCE_UNAVAILABLE');
        await assert.rejects(worker.close(), {
          code: 'WORKER_RESOURCE_CLOSE_FAILED',
        });
        assert.equal(alive(pid), false);
        assert.deepEqual(await readdir(root), []);
      },
      'WORKER_RESOURCE_CLOSE_FAILED',
    );
  },
);

test(
  'actual native RSS watchdog: an explicit one-byte policy fails the owned worker and joins process/runtime cleanup',
  { skip: !supported, timeout: 15000 },
  async () => {
    await withWorker(
      WorkerProcess,
      { maxResidentBytes: 1, residentPollIntervalMs: 100 },
      async (worker, root) => {
        const failure = once(worker, 'failure');
        await worker.start();
        const pid = worker.pid;
        const [error] = await failure;
        assert.equal(error.code, 'WORKER_MEMORY_LIMIT');
        await worker.close();
        assert.equal(alive(pid), false);
        assert.deepEqual(await readdir(root), []);
      },
    );
  },
);

test(
  'actual native RSS watchdog: a large explicit budget preserves heartbeat and normal close',
  { skip: !supported, timeout: 15000 },
  async () => {
    class Observed extends WorkerProcess {
      samples = 0;
      sampleResidentBytes(pid, signal) {
        this.samples++;
        return super.sampleResidentBytes(pid, signal);
      }
    }
    await withWorker(
      Observed,
      { maxResidentBytes: 1024 * 1024 * 1024, residentPollIntervalMs: 100 },
      async (worker, root) => {
        let failures = 0;
        worker.on('failure', () => failures++);
        await worker.start();
        await eventually(() => worker.samples >= 2, 5000);
        await worker.ping();
        await worker.close();
        assert.equal(failures, 0);
        assert.deepEqual(await readdir(root), []);
      },
    );
  },
);

test(
  'actual native lifecycle: omitted resident policy performs no resource queries',
  { skip: !supported, timeout: 15000 },
  async () => {
    class Unobserved extends WorkerProcess {
      samples = 0;
      sampleResidentBytes() {
        this.samples++;
        throw new Error('Unexpected sampler');
      }
    }
    await withWorker(Unobserved, {}, async (worker) => {
      await worker.start();
      await delay(1100);
      await worker.ping();
      assert.equal(worker.samples, 0);
      await worker.close();
    });
  },
);

for (const [label, sample] of [
  [
    'unavailable',
    () => Promise.reject(new ProcessSampleError('PROCESS_SAMPLE_UNAVAILABLE')),
  ],
  ['invalid scalar', () => Promise.resolve(NaN)],
])
  test(
    `synthetic RSS probe / actual native worker: ${label} fails with a fixed unavailable error`,
    { skip: !supported, timeout: 15000 },
    async () => {
      class Fault extends WorkerProcess {
        sampleResidentBytes() {
          return sample();
        }
      }
      await withWorker(
        Fault,
        { maxResidentBytes: 1024, residentPollIntervalMs: 100 },
        async (worker, root) => {
          const failure = once(worker, 'failure');
          await worker.start();
          assert.equal((await failure)[0].code, 'WORKER_RESOURCE_UNAVAILABLE');
          await worker.close();
          assert.deepEqual(await readdir(root), []);
        },
      );
    },
  );

test(
  'synthetic RSS probe / actual native worker: one pending sample is joined on close and its late oversized result is inert',
  { skip: !supported, timeout: 15000 },
  async () => {
    let finish;
    class Delayed extends WorkerProcess {
      samples = 0;
      sampleResidentBytes() {
        this.samples++;
        return new Promise((done) => {
          finish = done;
        });
      }
    }
    await withWorker(
      Delayed,
      { maxResidentBytes: 1024, residentPollIntervalMs: 100 },
      async (worker, root) => {
        let failures = 0;
        worker.on('failure', () => failures++);
        await worker.start();
        await eventually(() => Boolean(finish));
        await delay(250);
        assert.equal(worker.samples, 1);
        let closed = false;
        const closing = worker.close().then(() => {
          closed = true;
        });
        await delay(50);
        assert.equal(closed, false);
        finish(Number.MAX_SAFE_INTEGER);
        await closing;
        await delay(150);
        assert.equal(worker.samples, 1);
        assert.equal(failures, 0);
        assert.deepEqual(await readdir(root), []);
      },
    );
  },
);

test(
  'synthetic cancellable RSS probe / actual native worker: three-second sample deadline fails closed and joins cancellation',
  { skip: !supported, timeout: 15000 },
  async () => {
    class Stalled extends WorkerProcess {
      sampleResidentBytes(_pid, signal) {
        return new Promise((_, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new ProcessSampleError('PROCESS_SAMPLE_CANCELLED')),
            { once: true },
          );
        });
      }
    }
    await withWorker(
      Stalled,
      { maxResidentBytes: 1024, residentPollIntervalMs: 100 },
      async (worker, root) => {
        const failure = once(worker, 'failure');
        await worker.start();
        assert.equal((await failure)[0].code, 'WORKER_RESOURCE_UNAVAILABLE');
        await worker.close();
        assert.deepEqual(await readdir(root), []);
      },
    );
  },
);
