import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  WorkerProcess,
  workerResidentBytes,
} from '../../packages/node-bridge/dist/index.js';

const binary = resolve(
  process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
);
const workerPath = join(
  binary,
  'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
);

async function withWorker(run) {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'rdp-resident-sample-'));
  const worker = new WorkerProcess({
    workerPath,
    runtimeRoot,
    ipcTransport: 'framed-pipes',
  });
  try {
    await worker.start();
    assert.ok(Number.isInteger(worker.pid) && worker.pid > 0);
    await run(worker);
    await worker.close();
    assert.deepEqual(await readdir(runtimeRoot), []);
  } finally {
    await worker.close();
    await rm(runtimeRoot, { recursive: true, force: true, maxRetries: 3 });
  }
}

test(
  'actual native lifecycle: shared typed resident sampler reads only positive RSS scalars and preserves heartbeat / framed pipes',
  { skip: !['win32', 'linux'].includes(process.platform), timeout: 30000 },
  async () => {
    await withWorker(async (worker) => {
      for (let i = 0; i < 4; ++i) {
        const bytes = await workerResidentBytes(worker.pid, workerPath);
        assert.ok(Number.isSafeInteger(bytes) && bytes > 0);
      }
      await worker.ping();
    });
  },
);

test(
  'actual native lifecycle: cancelled resident reads retire sampling resources and preserve target heartbeat',
  { skip: !['win32', 'linux'].includes(process.platform), timeout: 30000 },
  async () => {
    await withWorker(async (worker) => {
      const initial = await workerResidentBytes(worker.pid, workerPath);
      assert.ok(Number.isSafeInteger(initial) && initial > 0);
      const fdBaseline =
        process.platform === 'linux'
          ? (await readdir('/proc/self/fd')).length
          : undefined;
      for (let i = 0; i < 8; ++i) {
        const abort = new AbortController();
        const sample = workerResidentBytes(
          worker.pid,
          workerPath,
          abort.signal,
        );
        const rejected = assert.rejects(sample, {
          code: 'PROCESS_SAMPLE_CANCELLED',
          message: 'PROCESS_SAMPLE_CANCELLED',
        });
        abort.abort('private-cancellation-reason');
        await rejected;
        await worker.ping();
      }
      assert.ok((await workerResidentBytes(worker.pid, workerPath)) > 0);
      if (fdBaseline !== undefined)
        assert.equal((await readdir('/proc/self/fd')).length, fdBaseline);
    });
  },
);
