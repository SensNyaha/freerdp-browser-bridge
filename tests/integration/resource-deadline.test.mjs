import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { WorkerProcess } from '../../packages/node-bridge/dist/index.js';

const workerPath = join(
  resolve(process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation'),
  'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
);
class LateSample extends WorkerProcess {
  returned = false;
  resourceCalls = 0;
  constructor(options, shared) {
    super(options);
    this.shared = shared;
    this.produced = new Promise((done) => {
      this.produce = done;
    });
  }
  async result(value, signal) {
    if (!this.returned) {
      this.signal = signal;
      const start = performance.now();
      // One bounded stall in the test subprocess; no CPU spin or OS setting change.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3100);
      this.elapsedMs = performance.now() - start;
      this.returned = true;
      this.produce();
    }
    return value;
  }
  sampleResidentBytes(pid, signal) {
    this.residentSignal = signal;
    if (this.shared) return super.sampleResidentBytes(pid, signal);
    return this.result(1, signal);
  }
  sampleCpuMicros(pid, signal) {
    this.cpuSignal = signal;
    if (this.shared) return super.sampleCpuMicros(pid, signal);
    return this.result(0, signal);
  }
  async sampleResourceUsage(_pid, signal) {
    ++this.resourceCalls;
    const startedNs = process.hrtime.bigint();
    const value = await this.result({ bytes: 1, micros: 0 }, signal);
    return { ...value, startedNs, completedNs: process.hrtime.bigint() };
  }
}
for (const mode of ['resident', 'cpu', 'paired', 'shared'])
  test(
    `synthetic late ${mode} sample / actual native worker: event-loop stall cannot revive an expired query`,
    {
      skip:
        !['win32', 'linux'].includes(process.platform) ||
        (['paired', 'shared'].includes(mode) && process.platform !== 'win32'),
      timeout: 15000,
    },
    async (context) => {
      const root = await mkdtemp(join(tmpdir(), 'rdp-resource-deadline-'));
      const worker = new LateSample(
        {
          workerPath,
          runtimeRoot: root,
          ipcTransport: 'framed-pipes',
          heartbeatIntervalMs: 10000,
          ...(mode !== 'cpu'
            ? {
                maxResidentBytes: 1024 * 1024 * 1024,
                residentPollIntervalMs: 100,
              }
            : {}),
          ...(mode !== 'resident'
            ? { maxCpuPercent: 100, cpuPollIntervalMs: 100 }
            : {}),
        },
        mode === 'shared',
      );
      let failure, pid;
      worker.on('failure', (error) => {
        failure ??= error;
      });
      try {
        await worker.start();
        pid = worker.pid;
        await worker.ping();
        await worker.produced;
        // Let promise reactions and due timers settle; no extra policy window is granted.
        await delay(25);
        const policySignal = worker.residentSignal ?? worker.cpuSignal;
        context.diagnostic(
          JSON.stringify({
            mode,
            stalledMs: Math.ceil(worker.elapsedMs),
            state: worker.state,
            failure: failure?.code ?? 'NONE',
            aborted: policySignal.aborted,
            sharedQueries: worker.resourceCalls,
          }),
        );
        assert.ok(worker.elapsedMs >= 3000);
        assert.equal(failure?.code, 'WORKER_RESOURCE_UNAVAILABLE');
        assert.equal(policySignal.aborted, true);
        if (mode === 'paired') assert.equal(worker.cpuSignal, undefined);
        if (mode === 'shared') assert.equal(worker.resourceCalls, 1);
      } finally {
        worker.terminate();
        try {
          await worker.close();
          assert.deepEqual(await readdir(root), []);
          if (pid !== undefined)
            assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
        } finally {
          await rm(root, { recursive: true, force: true, maxRetries: 3 });
        }
      }
    },
  );
