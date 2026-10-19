import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  SessionManager,
  WorkerProcess,
} from '../../packages/node-bridge/dist/index.js';
import { eventually } from '../fixtures/session-worker.mjs';
import { NativeLifecycleWorker } from '../fixtures/native-lifecycle-worker.mjs';
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
class ObservedProcess extends WorkerProcess {
  cpuSamples = 0;
  residentSamples = 0;
  combinedSamples = 0;
  maxCpuQueryMs = 0;
  maxResidentQueryMs = 0;
  peakResidentBytes = 0;
  firstCpuMicros;
  lastCpuMicros;
  lastFailure;
  constructor(options) {
    super(options);
    this.on('failure', (error) => {
      this.lastFailure = error.code;
    });
  }
  async sampleResourceUsage(pid, signal) {
    const value = await super.sampleResourceUsage(pid, signal);
    ++this.combinedSamples;
    return value;
  }
  async sampleCpuMicros(pid, signal) {
    const started = performance.now();
    try {
      const value = await super.sampleCpuMicros(pid, signal);
      this.firstCpuMicros ??= value;
      this.lastCpuMicros = value;
      ++this.cpuSamples;
      return value;
    } finally {
      this.maxCpuQueryMs = Math.max(
        this.maxCpuQueryMs,
        performance.now() - started,
      );
    }
  }
  async sampleResidentBytes(pid, signal) {
    const started = performance.now();
    try {
      const value = await super.sampleResidentBytes(pid, signal);
      this.peakResidentBytes = Math.max(this.peakResidentBytes, value);
      ++this.residentSamples;
      return value;
    } finally {
      this.maxResidentQueryMs = Math.max(
        this.maxResidentQueryMs,
        performance.now() - started,
      );
    }
  }
}
class ResourceLifecycleWorker extends NativeLifecycleWorker {
  createWorkerProcess(options) {
    return new ObservedProcess(options);
  }
}

test(
  'actual native resource-policy capacity: 40 framed workers, paired CPU/RSS queries, five replacements and joined cleanup',
  { skip: !['win32', 'linux'].includes(process.platform), timeout: 90000 },
  async (t) => {
    const cpuStarted = process.cpuUsage();
    const wallStarted = performance.now();
    let peakParentRssBytes = process.memoryUsage.rss();
    const monitor = setInterval(() => {
      peakParentRssBytes = Math.max(
        peakParentRssBytes,
        process.memoryUsage.rss(),
      );
    }, 250);
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'rdp-resource-capacity-'));
    const options = {
      workerPath,
      runtimeRoot,
      ipcTransport: 'framed-pipes',
      maxCpuPercent: 10000,
      maxResidentBytes: 1024 * 1024 * 1024,
      // Exercise ordinary 1,000 ms polls, not a retuned slow capacity profile.
    };
    const workers = [],
      records = [],
      pids = new Set();
    const manager = new SessionManager({
      maxSessions: 40,
      maxPerPrincipal: 20,
      createBurst: 64,
      workerFactory() {
        const worker = new ResourceLifecycleWorker(options);
        workers.push(worker);
        return worker;
      },
    });
    const owners = [
      { id: 'resource-capacity-a' },
      { id: 'resource-capacity-b' },
    ];
    const config = { target: { host: 'capacity.invalid' }, auth: {} };
    const warm = new ObservedProcess(options);
    async function add(owner, count) {
      for (let at = 0; at < count; at += 4) {
        const batch = [];
        for (let i = 0; i < Math.min(4, count - at); ++i) {
          const id = manager.create(config, owner, '127.0.0.1').sessionId;
          const worker = workers.at(-1);
          const record = { id, owner, worker };
          records.push(record);
          batch.push(record);
        }
        await eventually(() => {
          for (const record of batch)
            if (record.worker.native.lastFailure)
              throw new Error(record.worker.native.lastFailure);
          return batch.every(
            (record) => record.worker.native.state === 'ready',
          );
        }, 15000);
        for (const record of batch) {
          assert.equal(manager.get(record.id, owner).state, 'connecting');
          assert.ok(Number.isInteger(record.worker.native.pid));
          pids.add(record.worker.native.pid);
        }
      }
    }
    function refuse(owner) {
      const factories = workers.length;
      assert.throws(() => manager.create(config, owner, '127.0.0.1'), {
        code: 'SESSION_LIMIT',
      });
      assert.equal(workers.length, factories);
    }
    async function sampled(active, minimum) {
      await eventually(
        () =>
          active.every(
            (record) =>
              record.worker.native.cpuSamples >= minimum &&
              record.worker.native.residentSamples >= minimum,
          ),
        15000,
      );
      for (const record of active)
        assert.equal(record.worker.native.state, 'ready');
      await Promise.all(active.map((record) => record.worker.native.ping()));
    }
    try {
      await warm.start();
      pids.add(warm.pid);
      await eventually(
        () => warm.cpuSamples > 0 && warm.residentSamples > 0,
        5000,
      );
      await warm.close();
      const fdBaseline =
        process.platform === 'linux'
          ? (await readdir('/proc/self/fd')).length
          : undefined;
      await add(owners[0], 20);
      refuse(owners[0]);
      await add(owners[1], 20);
      refuse({ id: 'resource-capacity-c' });
      assert.equal(manager.statistics().active, 40);
      assert.equal((await readdir(runtimeRoot)).length, 40);
      await sampled(records, 3);
      const retired = records.splice(0, 5);
      const retiredPids = retired.map((record) => record.worker.native.pid);
      await Promise.all(
        retired.map((record) => manager.close(record.id, record.owner)),
      );
      assert.ok(retiredPids.every((pid) => !alive(pid)));
      assert.equal(manager.statistics().active, 35);
      await add(owners[0], 5);
      assert.equal(manager.statistics().active, 40);
      await sampled(records, 2);
      refuse({ id: 'resource-capacity-c' });
      const totals = workers.reduce(
        (value, worker) => ({
          cpu: value.cpu + worker.native.cpuSamples,
          resident: value.resident + worker.native.residentSamples,
          combined: value.combined + worker.native.combinedSamples,
        }),
        { cpu: 0, resident: 0, combined: 0 },
      );
      await manager.shutdown();
      assert.equal(manager.statistics().active, 0);
      assert.ok([...pids].every((pid) => !alive(pid)));
      assert.deepEqual(await readdir(runtimeRoot), []);
      if (fdBaseline !== undefined)
        assert.equal((await readdir('/proc/self/fd')).length, fdBaseline);
      if (process.platform === 'win32')
        assert.ok(
          totals.combined > 0 && totals.combined < totals.cpu + totals.resident,
        );
      else assert.equal(totals.combined, 0);
      t.diagnostic(
        JSON.stringify({
          workers: workers.length,
          cpuQueries: totals.cpu,
          residentQueries: totals.resident,
          combinedQueries: totals.combined,
        }),
      );
    } finally {
      clearInterval(monitor);
      const cpu = process.cpuUsage(cpuStarted);
      const failures = {};
      for (const worker of workers)
        if (worker.native.lastFailure)
          failures[worker.native.lastFailure] =
            (failures[worker.native.lastFailure] ?? 0) + 1;
      t.diagnostic(
        JSON.stringify({
          factories: workers.length,
          failures,
          maxCpuQueryMs: Math.ceil(
            Math.max(
              0,
              ...workers.map((worker) => worker.native.maxCpuQueryMs),
            ),
          ),
          maxResidentQueryMs: Math.ceil(
            Math.max(
              0,
              ...workers.map((worker) => worker.native.maxResidentQueryMs),
            ),
          ),
          queryOwner: processQuerySnapshot(),
          parentCpuMicros: cpu.user + cpu.system,
          parentRssPeakBytes: peakParentRssBytes,
          workerRssPeakBytes: Math.max(
            0,
            ...workers.map((worker) => worker.native.peakResidentBytes),
          ),
          observedWorkerCpuGrowthMicros: workers.reduce(
            (sum, worker) =>
              sum +
              (worker.native.lastCpuMicros === undefined
                ? 0
                : worker.native.lastCpuMicros - worker.native.firstCpuMicros),
            0,
          ),
          observedMs: Math.ceil(performance.now() - wallStarted),
        }),
      );
      try {
        await manager.shutdown();
      } finally {
        const closed = await Promise.allSettled([
          warm.close(),
          ...workers.map((worker) => worker.close()),
        ]);
        for (const result of closed) assert.equal(result.status, 'fulfilled');
        await rm(runtimeRoot, { recursive: true, force: true, maxRetries: 3 });
      }
    }
  },
);
