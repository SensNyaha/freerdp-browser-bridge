import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  WorkerProcess,
  workerResidentBytes,
} from '../../packages/node-bridge/dist/index.js';

test(
  'actual native lifecycle: shared typed resident sampler reads only positive RSS scalars and preserves heartbeat / framed pipes',
  { skip: !['win32', 'linux'].includes(process.platform), timeout: 30000 },
  async () => {
    const binary = resolve(
      process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
    );
    const workerPath = join(
      binary,
      'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
    );
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'rdp-resident-sample-'));
    const worker = new WorkerProcess({
      workerPath,
      runtimeRoot,
      ipcTransport: 'framed-pipes',
    });
    try {
      await worker.start();
      assert.ok(Number.isInteger(worker.pid) && worker.pid > 0);
      for (let i = 0; i < 4; ++i) {
        const bytes = await workerResidentBytes(worker.pid, workerPath);
        assert.ok(Number.isSafeInteger(bytes) && bytes > 0);
      }
      await worker.ping();
      await worker.close();
      assert.deepEqual(await readdir(runtimeRoot), []);
    } finally {
      await worker.close();
      await rm(runtimeRoot, { recursive: true, force: true, maxRetries: 3 });
    }
  },
);
