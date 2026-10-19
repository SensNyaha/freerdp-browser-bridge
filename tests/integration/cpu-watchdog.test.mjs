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

const workerPath = join(
  resolve(process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation'),
  'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
);
const supported = {
  skip: !['win32', 'linux'].includes(process.platform),
  timeout: 15000,
};
const policy = { maxCpuPercent: 100, cpuPollIntervalMs: 100 };
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
async function withWorker(Worker, options, run, closeCode) {
  const root = await mkdtemp(join(tmpdir(), 'rdp-cpu-watchdog-'));
  const worker = new Worker({
    workerPath,
    runtimeRoot: root,
    ipcTransport: 'framed-pipes',
    ...options,
  });
  try {
    await run(worker, root);
  } finally {
    worker.terminate();
    try {
      await worker.close().catch((error) => {
        if (!closeCode) throw error;
        assert.equal(error.code, closeCode);
      });
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 3 });
    }
  }
}

test(
  'actual native CPU breach: bounded heartbeat load exceeds the host limit, retires only its worker and preserves a sibling',
  supported,
  async (t) => {
    class Observed extends WorkerProcess {
      samples = 0;
      firstMicros;
      lastMicros;
      async sampleCpuMicros(pid, signal) {
        const micros = await super.sampleCpuMicros(pid, signal);
        this.firstMicros ??= micros;
        this.lastMicros = micros;
        ++this.samples;
        return micros;
      }
    }
    await withWorker(WorkerProcess, {}, async (sibling) => {
      await sibling.start();
      await withWorker(
        Observed,
        { ...policy, maxCpuPercent: 1 },
        async (worker, root) => {
          let failureCode,
            completedPings = 0,
            loading = Promise.resolve();
          worker.on('failure', (error) => {
            failureCode = error.code;
          });
          try {
            await worker.start();
            const pid = worker.pid;
            await eventually(() => worker.samples > 0, 3000);
            loading = (async () => {
              while (worker.state === 'ready') {
                // Fixed 16-flight admission; each batch joins before the next.
                const results = await Promise.allSettled(
                  Array.from({ length: 16 }, () => worker.ping()),
                );
                completedPings += results.filter(
                  (result) => result.status === 'fulfilled',
                ).length;
                if (results.some((result) => result.status === 'rejected'))
                  break;
              }
            })();
            await eventually(() => failureCode !== undefined, 8000);
            assert.equal(failureCode, 'WORKER_CPU_LIMIT');
            await loading;
            assert.ok(completedPings > 0);
            assert.ok(
              worker.samples >= 2 && worker.lastMicros > worker.firstMicros,
            );
            await worker.close();
            assert.equal(alive(pid), false);
            assert.deepEqual(await readdir(root), []);
            await sibling.ping();
            assert.equal(sibling.state, 'ready');
            t.diagnostic(
              JSON.stringify({
                samples: worker.samples,
                cpuGrowthMicros: worker.lastMicros - worker.firstMicros,
                completedPings,
              }),
            );
          } finally {
            worker.terminate();
            await loading;
          }
        },
      );
    });
  },
);

test(
  'actual native lifecycle: CPU and RSS policies sample together, preserve heartbeat and join close',
  supported,
  async () => {
    class Observed extends WorkerProcess {
      samples = 0;
      async sampleCpuMicros(pid, signal) {
        const result = await super.sampleCpuMicros(pid, signal);
        ++this.samples;
        return result;
      }
    }
    await withWorker(
      Observed,
      {
        ...policy,
        maxCpuPercent: 10000,
        maxResidentBytes: 1024 * 1024 * 1024,
        residentPollIntervalMs: 100,
      },
      async (worker, root) => {
        const failures = [];
        worker.on('failure', (error) => failures.push(error.code));
        await worker.start();
        await eventually(() => worker.samples >= 15, 8000);
        await worker.ping();
        await worker.close();
        assert.deepEqual(failures, []);
        assert.deepEqual(await readdir(root), []);
      },
    );
  },
);

test(
  'actual native lifecycle: omitted CPU policy never starts CPU queries',
  { timeout: 15000 },
  async () => {
    class Unobserved extends WorkerProcess {
      samples = 0;
      sampleCpuMicros() {
        ++this.samples;
        throw new Error('Unexpected CPU query');
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

test(
  'synthetic CPU breach / actual native workers: only the owned child fails and retires',
  supported,
  async () => {
    class Excessive extends WorkerProcess {
      micros = 0;
      sampleCpuMicros() {
        this.micros += 2000000;
        return Promise.resolve(this.micros);
      }
    }
    await withWorker(WorkerProcess, {}, async (sibling) => {
      await sibling.start();
      await withWorker(
        Excessive,
        { ...policy, maxCpuPercent: 1 },
        async (worker, root) => {
          const failed = once(worker, 'failure');
          await worker.start();
          const pid = worker.pid;
          assert.equal((await failed)[0].code, 'WORKER_CPU_LIMIT');
          await worker.close();
          assert.equal(alive(pid), false);
          assert.deepEqual(await readdir(root), []);
          await sibling.ping();
          assert.equal(sibling.state, 'ready');
        },
      );
    });
  },
);

for (const [label, sample, closeCode] of [
  [
    'unavailable',
    () => Promise.reject(new ProcessSampleError('PROCESS_SAMPLE_UNAVAILABLE')),
  ],
  ['invalid scalar', () => Promise.resolve(NaN)],
  ['counter regression', (count) => Promise.resolve(count === 1 ? 1000 : 0)],
  [
    'uncertain retirement',
    () => Promise.reject(new ProcessSampleError('PROCESS_SAMPLE_CLOSE_FAILED')),
    'WORKER_RESOURCE_CLOSE_FAILED',
  ],
])
  test(
    `synthetic CPU ${label} / actual native worker: fixed failure and joined retirement`,
    supported,
    async () => {
      class Fault extends WorkerProcess {
        count = 0;
        sampleCpuMicros() {
          return sample(++this.count);
        }
      }
      await withWorker(
        Fault,
        policy,
        async (worker, root) => {
          const failed = once(worker, 'failure');
          await worker.start();
          const pid = worker.pid;
          assert.equal((await failed)[0].code, 'WORKER_RESOURCE_UNAVAILABLE');
          if (closeCode)
            await assert.rejects(worker.close(), { code: closeCode });
          else await worker.close();
          assert.equal(alive(pid), false);
          assert.deepEqual(await readdir(root), []);
        },
        closeCode,
      );
    },
  );

test(
  'synthetic pending CPU query / actual native worker: close joins one flight and ignores its late result',
  supported,
  async () => {
    let finish;
    class Pending extends WorkerProcess {
      count = 0;
      sampleCpuMicros() {
        ++this.count;
        return new Promise((done) => {
          finish = done;
        });
      }
    }
    await withWorker(Pending, policy, async (worker, root) => {
      const failures = [];
      worker.on('failure', (error) => failures.push(error.code));
      await worker.start();
      await eventually(() => Boolean(finish));
      await delay(250);
      assert.equal(worker.count, 1);
      let closed = false;
      const closing = worker.close().then(() => {
        closed = true;
      });
      await delay(50);
      assert.equal(closed, false);
      finish(Number.MAX_SAFE_INTEGER);
      await closing;
      await delay(150);
      assert.equal(worker.count, 1);
      assert.deepEqual(failures, []);
      assert.deepEqual(await readdir(root), []);
    });
  },
);

test(
  'synthetic stalled CPU query / actual native worker: deadline fails and joins abort',
  supported,
  async () => {
    class Stalled extends WorkerProcess {
      sampleCpuMicros(_pid, signal) {
        return new Promise((_, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new ProcessSampleError('PROCESS_SAMPLE_CANCELLED')),
            { once: true },
          );
        });
      }
    }
    await withWorker(Stalled, policy, async (worker, root) => {
      const failed = once(worker, 'failure');
      await worker.start();
      assert.equal((await failed)[0].code, 'WORKER_RESOURCE_UNAVAILABLE');
      await worker.close();
      assert.deepEqual(await readdir(root), []);
    });
  },
);
