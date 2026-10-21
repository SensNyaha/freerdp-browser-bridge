import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  setImmediate as nextTurn,
  setTimeout as delay,
} from 'node:timers/promises';
import { SessionManager } from '../../packages/node-bridge/dist/index.js';
import { NativeLifecycleWorker } from '../fixtures/native-lifecycle-worker.mjs';
import { eventually } from '../fixtures/session-worker.mjs';

const supported = {
  skip: !['win32', 'linux'].includes(process.platform),
  timeout: 15000,
};
const owner = { id: 'native-startup-deadline' };
const config = () => ({
  target: { host: 'rdp.example.test' },
  auth: { username: 'fixture', password: 'synthetic-only' },
});
const workerPath = resolve(
  process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
  'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
);
async function rootFor(run) {
  const root = await mkdtemp(resolve('build/session-startup-'));
  assert.equal(dirname(root), resolve('build'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
}
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test(
  'native lifecycle adapter: expired pre-invocation startup does not call the backend or create a PID/runtime',
  supported,
  async () => {
    await rootFor(async (runtimeRoot) => {
      const worker = new NativeLifecycleWorker({
        workerPath,
        runtimeRoot,
        ipcTransport: 'framed-pipes',
      });
      let calls = 0;
      const start = worker.start.bind(worker);
      worker.start = (...args) => {
        ++calls;
        return start(...args);
      };
      const manager = new SessionManager({
        workerFactory: () => worker,
        startupTimeoutMs: 5,
      });
      try {
        const blocked = Promise.resolve().then(() =>
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40),
        );
        const session = manager.create(config(), owner, '127.0.0.1');
        await blocked;
        await eventually(
          () => manager.get(session.sessionId, owner).state === 'failed',
        );
        await manager.close(session.sessionId, owner);
        assert.equal(
          manager.get(session.sessionId, owner).error.code,
          'WORKER_START_TIMEOUT',
        );
        assert.equal(calls, 0);
        assert.equal(worker.native.pid, undefined);
        assert.equal(manager.statistics().active, 0);
        assert.deepEqual(await readdir(runtimeRoot), []);
      } finally {
        await manager.shutdown();
      }
    });
  },
);

test(
  'actual native worker / synthetic registry progress: completed startup survives its old deadline and joins normal close',
  supported,
  async () => {
    await rootFor(async (runtimeRoot) => {
      const worker = new NativeLifecycleWorker({
        workerPath,
        runtimeRoot,
        ipcTransport: 'framed-pipes',
      });
      const manager = new SessionManager({
        workerFactory: () => worker,
        startupTimeoutMs: 5000,
      });
      let pid;
      try {
        const session = manager.create(config(), owner, '127.0.0.1');
        await eventually(() => worker.native.state === 'ready', 5000);
        await nextTurn();
        pid = worker.native.pid;
        assert.ok(Number.isInteger(pid));
        await worker.native.ping();
        await delay(5100);
        // A lifecycle-only state repeat exercises the retired startup owner.
        worker.emit('state', 'connecting');
        assert.equal(manager.get(session.sessionId, owner).state, 'connecting');
        assert.equal(manager.get(session.sessionId, owner).error, undefined);
        await worker.native.ping();
        await manager.close(session.sessionId, owner);
        assert.equal(manager.statistics().active, 0);
        assert.equal(alive(pid), false);
        assert.deepEqual(await readdir(runtimeRoot), []);
      } finally {
        await manager.shutdown();
      }
    });
  },
);
