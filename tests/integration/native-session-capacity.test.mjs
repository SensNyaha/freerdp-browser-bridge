import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import {
  SessionManager,
  WorkerProcess,
} from '../../packages/node-bridge/dist/index.js';
import { eventually } from '../fixtures/session-worker.mjs';

const binary = resolve(
  process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
);
const suffix = process.platform === 'win32' ? '.exe' : '';
const workerPath = join(binary, 'rdp-worker' + suffix);
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// Test-only registry adapter for real native lifecycle IPC. It never sends
// CONFIGURE, SECRET or CONNECT and never reports an RDP connected state.
class LifecycleWorker extends EventEmitter {
  constructor(options) {
    super();
    this.native = new WorkerProcess(options);
    this.native.on('failure', () => {
      if (!this.closing) this.emit('failure', 'WORKER_FAILED');
    });
  }
  onState(listener) {
    this.on('state', listener);
    return () => this.off('state', listener);
  }
  onFailure(listener) {
    this.on('failure', listener);
    return () => this.off('failure', listener);
  }
  async start(_config, signal) {
    if (signal.aborted) throw new Error('Lifecycle startup was cancelled');
    const abort = () => {
      // The final joined close observes rejection of this same promise.
      void this.close().catch(() => {});
    };
    signal.addEventListener('abort', abort, { once: true });
    try {
      this.emit('state', 'connecting');
      assert.equal((await this.native.start()).transport, 'framed-pipes');
      if (signal.aborted) throw new Error('Lifecycle startup was cancelled');
    } finally {
      signal.removeEventListener('abort', abort);
    }
  }
  close() {
    this.closing = true;
    this.closePromise ??= this.native.close().then(() => {
      this.emit('state', 'closed');
    });
    return this.closePromise;
  }
  terminate() {
    return this.close();
  }
}

test(
  'native lifecycle capacity: configured 40 global / 20 per principal, pre-factory refusal, replacement and joined cleanup / framed pipes',
  { skip: !['win32', 'linux'].includes(process.platform), timeout: 90000 },
  async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'rdp-registry-capacity-'));
    const workers = [],
      records = [],
      pids = new Set();
    const options = { workerPath, runtimeRoot, ipcTransport: 'framed-pipes' };
    const manager = new SessionManager({
      maxSessions: 40,
      maxPerPrincipal: 20,
      createBurst: 64,
      workerFactory() {
        const worker = new LifecycleWorker(options);
        workers.push(worker);
        return worker;
      },
    });
    const owners = [{ id: 'capacity-a' }, { id: 'capacity-b' }];
    const config = { target: { host: 'capacity.invalid' }, auth: {} };
    const warm = new WorkerProcess(options);
    const refuse = (owner, count) => {
      assert.throws(() => manager.create(config, owner, '127.0.0.1'), {
        code: 'SESSION_LIMIT',
      });
      assert.equal(workers.length, count);
    };
    const start = async (owner, count, full) => {
      for (let at = 0; at < count; at += 4) {
        const batch = [];
        for (let i = 0; i < Math.min(4, count - at); ++i) {
          const snapshot = manager.create(config, owner, '127.0.0.1');
          const worker = workers.at(-1);
          const record = { id: snapshot.sessionId, owner, worker };
          records.push(record);
          batch.push(record);
        }
        // The final newly constructed batch is still starting: admission must
        // refuse overflow before another backend or native child is created.
        if (at + batch.length === count) full?.();
        await eventually(
          () => batch.every(({ worker }) => worker.native.state === 'ready'),
          15000,
        );
        for (const { id, worker } of batch) {
          assert.equal(manager.get(id, owner).state, 'connecting');
          assert.ok(Number.isInteger(worker.native.pid));
          pids.add(worker.native.pid);
        }
      }
    };
    try {
      await warm.start();
      pids.add(warm.pid);
      await warm.close();
      const fdBaseline =
        process.platform === 'linux'
          ? (await readdir('/proc/self/fd')).length
          : undefined;
      await start(owners[0], 20, () => refuse(owners[0], 20));
      await start(owners[1], 20, () => refuse({ id: 'capacity-c' }, 40));
      assert.equal(manager.statistics().active, 40);
      assert.equal((await readdir(runtimeRoot)).length, 40);
      await delay(2200);
      await Promise.all(records.map(({ worker }) => worker.native.ping()));
      const retired = records.splice(0, 10);
      const retiredPids = retired.map(({ worker }) => worker.native.pid);
      await Promise.all(
        retired.map(({ id, owner }) => manager.close(id, owner)),
      );
      assert.ok(retiredPids.every((pid) => !alive(pid)));
      assert.equal(manager.statistics().active, 30);
      assert.equal((await readdir(runtimeRoot)).length, 30);
      await start(owners[0], 10);
      assert.equal(manager.statistics().active, 40);
      refuse({ id: 'capacity-c' }, 50);
      await Promise.all(records.map(({ worker }) => worker.native.ping()));
      assert.equal((await readdir(runtimeRoot)).length, 40);
      await manager.shutdown();
      assert.equal(manager.statistics().active, 0);
      assert.ok([...pids].every((pid) => !alive(pid)));
      assert.deepEqual(await readdir(runtimeRoot), []);
      if (fdBaseline !== undefined)
        assert.equal((await readdir('/proc/self/fd')).length, fdBaseline);
    } finally {
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
