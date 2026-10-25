import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, rm, rmdir, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import {
  WorkerProcess,
  recoverRuntimeSessions,
} from '../../packages/node-bridge/dist/index.js';
import { probeRuntimeOwner } from '../../packages/node-bridge/dist/runtime-owner.js';
import {
  binaryDir,
  runtimeFixture,
  launchRuntimeWorker,
} from '../fixtures/runtime-ownership.mjs';

const workerPath = join(
  binaryDir,
  'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
);
test('SDK recovery is available from each server adapter without a direct lower-level import', async () => {
  for (const name of ['express', 'fastify', 'http', 'nestjs']) {
    const adapter = await import(`../../packages/${name}/dist/index.js`);
    assert.equal(adapter.recoverRuntimeSessions, recoverRuntimeSessions);
    assert.equal(typeof adapter.RuntimeRecoveryError, 'function');
  }
});
test(
  'SDK runtime recovery: verified native cohort removes an orphan and missing root remains absent',
  { timeout: 20000 },
  async () =>
    runtimeFixture(async (root, directory) => {
      const result = await recoverRuntimeSessions({
        workerPath,
        runtimeRoot: root,
      });
      assert.deepEqual(result, {
        supported: true,
        complete: true,
        scanned: 1,
        removed: 1,
        active: 0,
        retained: 0,
      });
      assert.deepEqual(await readdir(root), []);
      const missing = join(root, 'missing');
      assert.deepEqual(
        await recoverRuntimeSessions({ workerPath, runtimeRoot: missing }),
        {
          supported: true,
          complete: true,
          scanned: 0,
          removed: 0,
          active: 0,
          retained: 0,
        },
      );
      await assert.rejects(readdir(missing), { code: 'ENOENT' });
      assert.equal(basename(directory).length, 74);
    }),
);
test(
  'SDK managed startup: two real workers share a root with independent owner endpoints and joined cleanup',
  { timeout: 20000 },
  async () =>
    runtimeFixture(async (root, initial) => {
      await rm(join(initial, '.rdp-worker-owned'));
      await rmdir(initial);
      const workers = [
        new WorkerProcess({ workerPath, runtimeRoot: root }),
        new WorkerProcess({ workerPath, runtimeRoot: root }),
      ];
      const owners = [];
      try {
        await Promise.all(workers.map((worker) => worker.start()));
        const names = await readdir(root);
        assert.equal(names.length, 2);
        for (const name of names) {
          const match = /^worker-([a-f0-9]{32})-1-[a-f0-9]{32}$/.exec(name);
          assert.ok(match);
          owners.push(match[1]);
          assert.equal(await probeRuntimeOwner(match[1]), 'live');
        }
        assert.notEqual(owners[0], owners[1]);
        assert.deepEqual(
          await recoverRuntimeSessions({ workerPath, runtimeRoot: root }),
          {
            supported: true,
            complete: true,
            scanned: 2,
            removed: 0,
            active: 2,
            retained: 0,
          },
        );
        for (const worker of workers) await worker.ping();
      } finally {
        await Promise.all(workers.map((worker) => worker.close()));
      }
      for (const owner of owners)
        assert.equal(await probeRuntimeOwner(owner), 'absent');
      assert.deepEqual(await readdir(root), []);
    }),
);
test(
  'SDK runtime recovery: surviving worker lock retains its directory until hard kill',
  { timeout: 20000 },
  async () =>
    runtimeFixture(async (root, directory) => {
      const worker = launchRuntimeWorker(directory);
      try {
        assert.equal(await worker.ready, true, worker.diagnostic());
        assert.deepEqual(
          await recoverRuntimeSessions({ workerPath, runtimeRoot: root }),
          {
            supported: true,
            complete: true,
            scanned: 1,
            removed: 0,
            active: 1,
            retained: 0,
          },
        );
        assert.deepEqual(await readdir(directory), ['.rdp-worker-owned']);
      } finally {
        await worker.kill();
      }
      assert.equal(
        (await recoverRuntimeSessions({ workerPath, runtimeRoot: root }))
          .removed,
        1,
      );
    }),
);
test(
  'SDK runtime recovery: finite scan reports incomplete and preserves unknown directory contents',
  { timeout: 20000 },
  async () =>
    runtimeFixture(async (root, directory) => {
      await writeFile(join(root, 'unknown-one'), 'preserve');
      await writeFile(join(root, 'unknown-two'), 'preserve');
      await writeFile(join(directory, 'unknown-child'), 'preserve');
      const limited = await recoverRuntimeSessions({
        workerPath,
        runtimeRoot: root,
        maxEntries: 1,
      });
      assert.equal(limited.supported, true);
      assert.equal(limited.complete, false);
      assert.equal(limited.scanned, 1);
      assert.equal(limited.removed, 0);
      assert.equal(limited.retained, 1);
      const complete = await recoverRuntimeSessions({
        workerPath,
        runtimeRoot: root,
      });
      assert.deepEqual(complete, {
        supported: true,
        complete: true,
        scanned: 3,
        removed: 0,
        active: 0,
        retained: 3,
      });
      assert.equal(
        await readFile(join(directory, 'unknown-child'), 'utf8'),
        'preserve',
      );
      assert.equal(
        await readFile(join(directory, '.rdp-worker-owned'), 'utf8'),
        'runtime-v1',
      );
    }),
);
