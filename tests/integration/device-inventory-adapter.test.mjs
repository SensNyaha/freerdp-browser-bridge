import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { WorkerProcess } from '../../packages/node-bridge/dist/index.js';

async function run(mode, body) {
  const root = await mkdtemp(join(tmpdir(), 'bridge-synthetic-inventory-'));
  class Synthetic extends WorkerProcess {
    spawnWorker(cwd, env) {
      return spawn(
        process.execPath,
        [resolve('tests/fixtures/device-inventory-worker.mjs'), mode],
        { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
      );
    }
  }
  const worker = new Synthetic({
    workerPath: resolve(
      process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
      'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
    ),
    runtimeRoot: root,
    ipcTransport: 'framed-pipes',
    requestTimeoutMs: 150,
    heartbeatIntervalMs: 60000,
  });
  let pid;
  try {
    await worker.start();
    pid = worker.pid;
    await body(worker);
  } finally {
    await worker.close();
    assert.deepEqual(await readdir(root), []);
    if (pid) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    await rmdir(root);
  }
}
test('synthetic inventory adapter refuses legacy capability before RPC and preserves heartbeat', async () => {
  await run('legacy', async (worker) => {
    await assert.rejects(
      worker.nativeHostInventory({ classes: ['serial'], maxDevices: 1 }),
      { code: 'DEVICE_INVENTORY_NOT_IMPLEMENTED' },
    );
    await worker.ping();
  });
});
test('synthetic inventory adapter binds response classes, refuses malformed data and joins stalled child', async () => {
  for (const mode of ['foreign', 'malformed', 'stall'])
    await run(mode, async (worker) => {
      await assert.rejects(
        worker.nativeHostInventory({ classes: ['serial'], maxDevices: 1 }),
      );
      await assert.rejects(
        worker.nativeHostInventory({ classes: ['serial'], maxDevices: 1 }),
        { code: 'INVALID_STATE' },
      );
    });
});
test('synthetic inventory adapter returns typed bridge-host metadata and prevents use as a session worker', async () => {
  await run('valid', async (worker) => {
    const report = await worker.nativeHostInventory({
      classes: ['serial'],
      maxDevices: 1,
    });
    assert.deepEqual(report, {
      classes: [{ kind: 'serial', status: 'available', devices: [] }],
    });
    await worker.ping();
    await assert.rejects(worker.connect({}), { code: 'INVALID_STATE' });
    await assert.rejects(
      worker.nativeFileCommand({
        operation: 'retire',
        id: 0n,
        argument: 0n,
        value: 0n,
      }),
      { code: 'INVALID_STATE' },
    );
  });
});
