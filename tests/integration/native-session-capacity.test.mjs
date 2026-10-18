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
import { eventually } from '../fixtures/session-worker.mjs';
import { NativeLifecycleWorker } from '../fixtures/native-lifecycle-worker.mjs';

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

test(
  'native lifecycle fixture startup cancellation: abort before filesystem preparation completes prevents child spawn and joins cleanup',
  { skip: !['win32', 'linux'].includes(process.platform), timeout: 30000 },
  async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'rdp-lifecycle-abort-'));
    const worker = new NativeLifecycleWorker({
      workerPath,
      runtimeRoot,
      ipcTransport: 'framed-pipes',
    });
    const abort = new AbortController();
    let starting;
    try {
      starting = worker.start(undefined, abort.signal);
      const refused = assert.rejects(starting);
      assert.equal(worker.native.state, 'starting');
      abort.abort();
      await refused;
      assert.equal(worker.native.pid, undefined);
      await worker.close();
      assert.deepEqual(await readdir(runtimeRoot), []);
    } finally {
      // Independent retirement also cleans up the intentionally failing
      // before-fix control, even if the fixture's own cached close is faulty.
      worker.native.terminate();
      await starting?.catch(() => {});
      await worker.native.close();
      await rm(runtimeRoot, { recursive: true, force: true, maxRetries: 3 });
    }
  },
);
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
        const worker = new NativeLifecycleWorker(options);
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

test(
  'native registry crash: failed worker releases its slot while siblings keep heartbeat and a replacement starts / framed pipes',
  { skip: !['win32', 'linux'].includes(process.platform), timeout: 45000 },
  async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'rdp-registry-crash-'));
    const workers = [],
      pids = new Set();
    const manager = new SessionManager({
      maxSessions: 3,
      maxPerPrincipal: 2,
      createBurst: 10,
      workerFactory() {
        const worker = new NativeLifecycleWorker({
          workerPath,
          runtimeRoot,
          ipcTransport: 'framed-pipes',
        });
        workers.push(worker);
        return worker;
      },
    });
    const owners = [{ id: 'crash-a' }, { id: 'crash-b' }];
    const config = { target: { host: 'capacity.invalid' }, auth: {} };
    try {
      const records = [owners[0], owners[0], owners[1]].map((owner) => ({
        owner,
        id: manager.create(config, owner, '127.0.0.1').sessionId,
      }));
      assert.throws(
        () => manager.create(config, { id: 'crash-c' }, '127.0.0.1'),
        { code: 'SESSION_LIMIT' },
      );
      assert.equal(workers.length, 3);
      await eventually(
        () => workers.every((worker) => worker.native.state === 'ready'),
        15000,
      );
      for (const worker of workers) {
        assert.ok(Number.isInteger(worker.native.pid) && worker.native.pid > 0);
        pids.add(worker.native.pid);
      }
      assert.equal(pids.size, 3);
      await Promise.all(workers.map((worker) => worker.native.ping()));
      const crashedPid = workers[0].native.pid;
      assert.equal(process.kill(crashedPid, 'SIGKILL'), true);
      await eventually(
        () =>
          manager.get(records[0].id, records[0].owner).state === 'failed' &&
          manager.statistics().active === 2,
        15000,
      );
      assert.equal(
        manager.get(records[0].id, records[0].owner).error.code,
        'WORKER_FAILED',
      );
      assert.equal(alive(crashedPid), false);
      assert.equal((await readdir(runtimeRoot)).length, 2);
      for (const { id, owner } of records.slice(1))
        assert.equal(manager.get(id, owner).state, 'connecting');
      await Promise.all(workers.slice(1).map((worker) => worker.native.ping()));
      const replacement = manager.create(config, owners[0], '127.0.0.1');
      assert.equal(workers.length, 4);
      await eventually(() => workers[3].native.state === 'ready', 15000);
      assert.ok(
        Number.isInteger(workers[3].native.pid) && workers[3].native.pid > 0,
      );
      pids.add(workers[3].native.pid);
      assert.equal(
        manager.get(replacement.sessionId, owners[0]).state,
        'connecting',
      );
      assert.equal(manager.statistics().active, 3);
      assert.equal((await readdir(runtimeRoot)).length, 3);
      await Promise.all(workers.slice(1).map((worker) => worker.native.ping()));
      await manager.shutdown();
      assert.equal(manager.statistics().active, 0);
      assert.ok([...pids].every((pid) => !alive(pid)));
      assert.deepEqual(await readdir(runtimeRoot), []);
    } finally {
      try {
        await manager.shutdown();
      } finally {
        const closed = await Promise.allSettled(
          workers.map((worker) => worker.close()),
        );
        for (const result of closed) assert.equal(result.status, 'fulfilled');
        await rm(runtimeRoot, { recursive: true, force: true, maxRetries: 3 });
      }
    }
  },
);
