import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { runRuntimeRecoveryHelper } from '../../packages/node-bridge/dist/runtime-recovery.js';
import { setTimeout as delay } from 'node:timers/promises';
const helper = resolve(
  process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
  'fixture-recovery-helper' + (process.platform === 'win32' ? '.exe' : ''),
);
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
};
async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'recovery-helper-control-'));
  try {
    await run(join(root, 'owned-pid'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
async function pidAt(path) {
  const due = performance.now() + 3000;
  while (performance.now() < due) {
    try {
      const text = await readFile(path, 'utf8');
      if (/^[1-9][0-9]{0,9}$/.test(text)) return Number(text);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await delay(5);
  }
  throw new Error('RECOVERY_FIXTURE_PID_UNAVAILABLE');
}
test(
  'synthetic recovery helper: cancellation kills and joins the actual child without caller reason disclosure',
  { timeout: 10000 },
  async () =>
    fixture(async (path) => {
      const controller = new AbortController();
      const pending = runRuntimeRecoveryHelper(helper, path, 'c', {
        due: performance.now() + 5000,
        signal: controller.signal,
      });
      const rejected = assert.rejects(pending, {
        code: 'RUNTIME_RECOVERY_CANCELLED',
        message: 'RUNTIME_RECOVERY_CANCELLED',
      });
      const pid = await pidAt(path);
      assert.equal(alive(pid), true);
      controller.abort('synthetic-secret-sentinel');
      await rejected;
      assert.equal(alive(pid), false);
    }),
);
test(
  'synthetic recovery helper: operation deadline joins a waiting process before returning timeout',
  { timeout: 10000 },
  async () =>
    fixture(async (path) => {
      const pending = runRuntimeRecoveryHelper(helper, path, 'c', {
        due: performance.now() + 1000,
      });
      const rejected = assert.rejects(pending, {
        code: 'RUNTIME_RECOVERY_TIMEOUT',
      });
      const pid = await pidAt(path);
      await rejected;
      assert.equal(alive(pid), false);
    }),
);
test(
  'synthetic recovery helper: oversized stdout stderr and nonzero exit yield fixed refusal and joined child',
  { timeout: 10000 },
  async () => {
    for (const mode of ['f', 'e', 'x'])
      await fixture(async (path) => {
        await assert.rejects(
          runRuntimeRecoveryHelper(helper, path, mode, {
            due: performance.now() + 5000,
          }),
          {
            code: 'RUNTIME_RECOVERY_UNAVAILABLE',
            message: 'RUNTIME_RECOVERY_UNAVAILABLE',
          },
        );
        assert.equal(alive(await pidAt(path)), false);
      });
  },
);
