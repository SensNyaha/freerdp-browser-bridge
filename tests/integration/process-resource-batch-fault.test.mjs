import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { ProcessResourceBatchOwner } from '../../packages/node-bridge/dist/process-resource-batch.js';
import { processQuerySnapshot } from '../../packages/node-bridge/dist/process-query-gate.js';
import { eventually } from '../fixtures/session-worker.mjs';

const enabled =
  process.platform === 'win32' &&
  process.env.BRIDGE_TEST_RESOURCE_BATCH_HELPER === '1';
const binary = resolve(
  process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
);
const healthyPath = join(binary, 'rdp-worker.exe');
const signal = () => new AbortController().signal;

function empty(owner) {
  assert.equal(owner.snapshot().collectingGroups, 0);
  assert.equal(owner.snapshot().inFlightGroups, 0);
  assert.equal(owner.snapshot().activeItems, 0);
  assert.equal(processQuerySnapshot().active, 0);
  assert.equal(processQuerySnapshot().waiting, 0);
}
function refused(result, code) {
  assert.equal(result.status, 'rejected');
  assert.equal(result.reason.code, code);
  assert.equal(result.reason.message, code);
  assert.equal(result.reason.cause, undefined);
  assert.deepEqual(Object.keys(result.reason), ['code']);
}
async function withFixture(run) {
  // This existing IPC fixture blocks on stdin; execFile keeps that pipe open.
  // It simulates a hung query child, not a failed real process-query API.
  const root = await mkdtemp(resolve('build/resource-batch-fault-'));
  const helper = join(root, 'rdp-runtime-directory.exe');
  try {
    await copyFile(join(binary, 'fixture-worker-1.exe'), helper);
    await run(join(root, 'rdp-worker.exe'));
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
}
async function dispatched(owner, items) {
  await eventually(() => owner.snapshot().dispatchedItems === items, 1000);
  assert.equal(owner.snapshot().launchAttempts, 1);
  assert.equal(owner.snapshot().inFlightGroups, 1);
  assert.equal(owner.snapshot().activeItems, items);
}

test(
  'actual hung fixture child: one cancelled batch member joins shared timeout while another helper path stays healthy',
  { skip: !enabled, timeout: 10000 },
  async (t) => {
    await withFixture(async (workerPath) => {
      const owner = new ProcessResourceBatchOwner();
      const abort = new AbortController();
      const sibling = new AbortController();
      let completed = 0;
      const requests = [
        owner.sample(process.pid, workerPath, abort.signal),
        owner.sample(process.pid, workerPath, sibling.signal),
      ];
      const pending = Promise.allSettled(
        requests.map((request) => request.finally(() => ++completed)),
      );
      try {
        await dispatched(owner, 2);
        abort.abort('synthetic-private-cancel-reason');
        await nextTurn();
        assert.equal(completed, 0);
        assert.equal(processQuerySnapshot().active, 2);
        const healthy = await owner.sample(process.pid, healthyPath, signal());
        assert.ok(healthy.bytes > 0 && healthy.micros >= 0);
        assert.equal(completed, 0);
        assert.equal(owner.snapshot().activeItems, 2);
        const results = await pending;
        refused(results[0], 'PROCESS_SAMPLE_CANCELLED');
        refused(results[1], 'PROCESS_SAMPLE_UNAVAILABLE');
        empty(owner);
        assert.equal(owner.snapshot().launchAttempts, 2);
        t.diagnostic(
          JSON.stringify({
            sharedTimedOutItems: 2,
            independentHealthyItems: 1,
            batch: owner.snapshot(),
          }),
        );
      } finally {
        abort.abort();
        sibling.abort();
        await pending;
      }
    });
  },
);

test(
  'actual hung fixture child: all dispatched members cancel, join and permit a fresh group',
  { skip: !enabled, timeout: 10000 },
  async (t) => {
    await withFixture(async (workerPath) => {
      const owner = new ProcessResourceBatchOwner();
      let maxCancellationMs = 0;
      for (let at = 0; at < 4; ++at) {
        const before = owner.snapshot();
        const aborts = [new AbortController(), new AbortController()];
        const pending = Promise.allSettled(
          aborts.map((abort) =>
            owner.sample(process.pid, workerPath, abort.signal),
          ),
        );
        try {
          await eventually(
            () =>
              owner.snapshot().dispatchedItems === before.dispatchedItems + 2,
            1000,
          );
          assert.equal(
            owner.snapshot().launchAttempts,
            before.launchAttempts + 1,
          );
          assert.equal(owner.snapshot().activeItems, 2);
          const started = performance.now();
          for (const abort of aborts) abort.abort('synthetic-private-abort');
          for (const result of await pending)
            refused(result, 'PROCESS_SAMPLE_CANCELLED');
          const elapsed = performance.now() - started;
          maxCancellationMs = Math.max(maxCancellationMs, Math.ceil(elapsed));
          // Distinguish requested cancellation from waiting for the 2 s timeout.
          // This is a finite fixture criterion, not a hard OS retirement guarantee.
          assert.ok(elapsed < 1500);
          empty(owner);
        } finally {
          for (const abort of aborts) abort.abort();
          await pending;
        }
      }
      assert.ok(
        (await owner.sample(process.pid, healthyPath, signal())).bytes > 0,
      );
      empty(owner);
      assert.equal(owner.snapshot().launchAttempts, 5);
      t.diagnostic(
        JSON.stringify({
          cancelledDispatchedItems: 8,
          maxCancellationMs,
          freshHealthyItems: 1,
          batch: owner.snapshot(),
        }),
      );
    });
  },
);

test(
  'actual missing batch executable: shared launch failure returns fixed errors and preserves an unrelated path',
  { skip: !enabled, timeout: 10000 },
  async () => {
    const root = await mkdtemp(resolve('build/resource-batch-missing-'));
    const owner = new ProcessResourceBatchOwner();
    try {
      const workerPath = join(root, 'rdp-worker.exe');
      const results = await Promise.allSettled([
        owner.sample(process.pid, workerPath, signal()),
        owner.sample(process.pid, workerPath, signal()),
        owner.sample(process.pid, healthyPath, signal()),
      ]);
      refused(results[0], 'PROCESS_SAMPLE_UNAVAILABLE');
      refused(results[1], 'PROCESS_SAMPLE_UNAVAILABLE');
      assert.equal(results[2].status, 'fulfilled');
      assert.ok(results[2].value.bytes > 0);
      assert.deepEqual(await readdir(root), []);
      empty(owner);
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 3 });
    }
  },
);
