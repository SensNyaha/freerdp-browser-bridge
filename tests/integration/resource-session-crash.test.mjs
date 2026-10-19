import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import {
  SessionManager,
  WorkerProcess,
} from '../../packages/node-bridge/dist/index.js';
import { NativeLifecycleWorker } from '../fixtures/native-lifecycle-worker.mjs';
import { eventually } from '../fixtures/session-worker.mjs';
import { processQuerySnapshot } from '../../packages/node-bridge/dist/process-query-gate.js';

const workerPath = join(
  resolve(process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation'),
  'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
);
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test(
  'actual native registry crash / synthetic query-retirement barrier: capacity waits for the pending CPU/RSS owner, siblings sample and a replacement starts',
  { skip: !['win32', 'linux'].includes(process.platform), timeout: 30000 },
  async (t) => {
    class Observed extends WorkerProcess {
      holdNext = false;
      heldSignal;
      releaseHeld;
      cpuSamples = 0;
      residentSamples = 0;
      hold(value, signal) {
        if (!this.holdNext) return value;
        this.holdNext = false;
        this.heldSignal = signal;
        return new Promise((done) => {
          this.releaseHeld = () => done(value);
        });
      }
      async sampleResourceUsage(pid, signal) {
        const value = await super.sampleResourceUsage(pid, signal);
        return this.hold(value, signal);
      }
      async sampleCpuMicros(pid, signal) {
        const value = await super.sampleCpuMicros(pid, signal);
        ++this.cpuSamples;
        return process.platform === 'linux' ? this.hold(value, signal) : value;
      }
      async sampleResidentBytes(pid, signal) {
        const value = await super.sampleResidentBytes(pid, signal);
        ++this.residentSamples;
        return value;
      }
    }
    class ResourceWorker extends NativeLifecycleWorker {
      createWorkerProcess(options) {
        return new Observed(options);
      }
    }
    const root = await mkdtemp(join(tmpdir(), 'rdp-resource-crash-'));
    const workers = [],
      pids = new Set();
    const owner = { id: 'resource-crash' };
    const config = { target: { host: 'capacity.invalid' }, auth: {} };
    const manager = new SessionManager({
      maxSessions: 3,
      maxPerPrincipal: 3,
      createBurst: 10,
      workerFactory() {
        const worker = new ResourceWorker({
          workerPath,
          runtimeRoot: root,
          ipcTransport: 'framed-pipes',
          maxCpuPercent: 10000,
          maxResidentBytes: 1024 * 1024 * 1024,
          cpuPollIntervalMs: 500,
          residentPollIntervalMs: 500,
        });
        workers.push(worker);
        return worker;
      },
    });
    const refuse = () => {
      const factories = workers.length;
      assert.throws(() => manager.create(config, owner, '127.0.0.1'), {
        code: 'SESSION_LIMIT',
      });
      assert.equal(workers.length, factories);
    };
    try {
      const records = Array.from({ length: 3 }, () =>
        manager.create(config, owner, '127.0.0.1'),
      );
      await eventually(
        () =>
          workers.every(
            ({ native }) =>
              native.state === 'ready' &&
              native.cpuSamples > 0 &&
              native.residentSamples > 0,
          ),
        10000,
      );
      for (const { native } of workers) pids.add(native.pid);
      const crashed = workers[0].native,
        pid = crashed.pid;
      crashed.holdNext = true;
      await eventually(() => crashed.heldSignal !== undefined, 5000);
      const siblingSamples = workers.slice(1).map(({ native }) => ({
        cpu: native.cpuSamples,
        resident: native.residentSamples,
      }));
      assert.equal(process.kill(pid, 'SIGKILL'), true);
      await eventually(
        () =>
          manager.get(records[0].sessionId, owner).state === 'failed' &&
          crashed.heldSignal.aborted &&
          !alive(pid),
        5000,
      );
      assert.equal(
        manager.get(records[0].sessionId, owner).error.code,
        'WORKER_FAILED',
      );
      await delay(100);
      assert.equal(manager.statistics().active, 3);
      assert.equal((await readdir(root)).length, 3);
      refuse();
      await Promise.all(workers.slice(1).map(({ native }) => native.ping()));
      crashed.releaseHeld();
      await eventually(() => manager.statistics().active === 2, 5000);
      assert.equal((await readdir(root)).length, 2);
      await eventually(
        () =>
          workers
            .slice(1)
            .every(
              ({ native }, index) =>
                native.cpuSamples > siblingSamples[index].cpu &&
                native.residentSamples > siblingSamples[index].resident &&
                native.state === 'ready',
            ),
        5000,
      );
      const replacement = manager.create(config, owner, '127.0.0.1');
      await eventually(
        () =>
          workers[3].native.state === 'ready' &&
          workers[3].native.cpuSamples > 0 &&
          workers[3].native.residentSamples > 0,
        10000,
      );
      pids.add(workers[3].native.pid);
      assert.equal(
        manager.get(replacement.sessionId, owner).state,
        'connecting',
      );
      assert.equal(manager.statistics().active, 3);
      refuse();
      await Promise.all(workers.slice(1).map(({ native }) => native.ping()));
      await manager.shutdown();
      assert.equal(manager.statistics().active, 0);
      assert.ok([...pids].every((value) => !alive(value)));
      assert.deepEqual(await readdir(root), []);
      assert.equal(processQuerySnapshot().active, 0);
      assert.equal(processQuerySnapshot().waiting, 0);
      t.diagnostic(
        JSON.stringify({
          workers: workers.length,
          crashed: 1,
          surviving: 2,
          replacement: 1,
          pairedQuery: process.platform === 'win32',
        }),
      );
    } finally {
      for (const { native } of workers) native.releaseHeld?.();
      await manager.shutdown();
      await Promise.all(workers.map((worker) => worker.close()));
      await rm(root, { recursive: true, force: true, maxRetries: 3 });
    }
  },
);
