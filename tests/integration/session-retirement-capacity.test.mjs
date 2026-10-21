import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { SessionManager } from '../../packages/node-bridge/dist/index.js';
import { NativeLifecycleWorker } from '../fixtures/native-lifecycle-worker.mjs';
import { eventually } from '../fixtures/session-worker.mjs';

const workerPath = resolve(
  process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
  'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
);
const owner = { id: 'native-retirement-capacity' };
const config = () => ({
  target: { host: 'rdp.example.test' },
  auth: { username: 'fixture', password: 'synthetic-only' },
});
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test(
  'actual native lifecycle / held completion: forced deadline keeps the slot until joined confirmation and permits replacement',
  { skip: !['win32', 'linux'].includes(process.platform), timeout: 15000 },
  async () => {
    const runtimeRoot = await mkdtemp(resolve('build/session-retirement-'));
    assert.equal(dirname(runtimeRoot), resolve('build'));
    const graceful = Promise.withResolvers();
    const confirm = Promise.withResolvers();
    let joined,
      forced = 0;
    class HeldCompletion extends NativeLifecycleWorker {
      close() {
        this.closing = true;
        return graceful.promise;
      }
      terminate() {
        ++forced;
        this.closing = true;
        this.native.terminate();
        joined ??= this.native.close();
        return Promise.all([joined, confirm.promise]).then(() => {});
      }
    }
    const workers = [];
    const manager = new SessionManager({
      maxSessions: 1,
      maxPerPrincipal: 1,
      shutdownTimeoutMs: 20,
      terminationTimeoutMs: 20,
      workerFactory: () => {
        const Worker = workers.length ? NativeLifecycleWorker : HeldCompletion;
        const worker = new Worker({
          workerPath,
          runtimeRoot,
          ipcTransport: 'framed-pipes',
        });
        workers.push(worker);
        return worker;
      },
    });
    try {
      const session = manager.create(config(), owner, '127.0.0.1');
      await eventually(() => workers[0].native.state === 'ready', 5000);
      await nextTurn();
      const pid = workers[0].native.pid;
      assert.ok(Number.isInteger(pid));
      await workers[0].native.ping();
      assert.equal(
        (await manager.close(session.sessionId, owner)).state,
        'closed',
      );
      assert.equal(forced, 1);
      assert.equal(manager.statistics().active, 1);
      assert.throws(() => manager.create(config(), owner, '127.0.0.1'), {
        code: 'SESSION_LIMIT',
      });
      assert.equal(workers.length, 1);
      // Only the test's completion gate remains held; actual native close is joined.
      await joined;
      assert.equal(alive(pid), false);
      assert.deepEqual(await readdir(runtimeRoot), []);
      assert.equal(manager.statistics().active, 1);
      confirm.resolve();
      await eventually(() => manager.statistics().active === 0);
      const replacement = manager.create(config(), owner, '127.0.0.1');
      await eventually(() => workers[1].native.state === 'ready', 5000);
      const replacementPid = workers[1].native.pid;
      await workers[1].native.ping();
      await manager.close(replacement.sessionId, owner);
      await eventually(() => manager.statistics().active === 0);
      assert.equal(alive(replacementPid), false);
      assert.deepEqual(await readdir(runtimeRoot), []);
    } finally {
      confirm.resolve();
      graceful.resolve();
      for (const worker of workers) {
        worker.closing = true;
        worker.native.terminate();
      }
      await manager.shutdown();
      await Promise.all(workers.map((worker) => worker.native.close()));
      await rm(runtimeRoot, { recursive: true, force: true, maxRetries: 3 });
    }
  },
);
