import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  WorkerProcess,
  windowsWorkerCpuMicros,
} from '../../packages/node-bridge/dist/index.js';

const workerPath = join(
  resolve(process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation'),
  'rdp-worker.exe',
);
async function withWorker(run) {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'rdp-cpu-query-'));
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
  'actual Windows native lifecycle: cumulative CPU samples preserve heartbeat and normal close',
  { skip: process.platform !== 'win32', timeout: 30000 },
  async () => {
    await withWorker(async (worker) => {
      let previous = 0;
      for (let i = 0; i < 4; ++i) {
        const micros = await windowsWorkerCpuMicros(worker.pid, workerPath);
        assert.ok(Number.isSafeInteger(micros) && micros >= previous);
        previous = micros;
        await worker.ping();
      }
    });
  },
);

test(
  'actual Windows native lifecycle: cancelled CPU helpers join while the sampled worker stays alive',
  { skip: process.platform !== 'win32', timeout: 30000 },
  async () => {
    await withWorker(async (worker) => {
      for (let i = 0; i < 8; ++i) {
        const abort = new AbortController();
        const result = windowsWorkerCpuMicros(
          worker.pid,
          workerPath,
          abort.signal,
        );
        const rejected = assert.rejects(result, {
          code: 'PROCESS_SAMPLE_CANCELLED',
          message: 'PROCESS_SAMPLE_CANCELLED',
        });
        abort.abort('private-reason');
        await rejected;
        await worker.ping();
      }
      assert.ok(
        Number.isSafeInteger(
          await windowsWorkerCpuMicros(worker.pid, workerPath),
        ),
      );
    });
  },
);
