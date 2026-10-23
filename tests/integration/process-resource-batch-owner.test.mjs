import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { ProcessResourceBatchOwner } from '../../packages/node-bridge/dist/process-resource-batch.js';
import { windowsProcessResources } from '../../packages/node-bridge/dist/process-resources.js';
import { processQuerySnapshot } from '../../packages/node-bridge/dist/process-query-gate.js';

const prepared =
  process.platform === 'win32' &&
  process.env.BRIDGE_TEST_RESOURCE_BATCH_HELPER === '1';
const workerPath = resolve(
  process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
  'rdp-worker.exe',
);
const signal = () => new AbortController().signal;
function empty(owner) {
  assert.equal(owner.snapshot().activeItems, 0);
  assert.equal(owner.snapshot().inFlightGroups, 0);
  assert.equal(owner.snapshot().collectingGroups, 0);
  assert.equal(processQuerySnapshot().active, 0);
  assert.equal(processQuerySnapshot().waiting, 0);
}

test(
  'prepared Windows batch owner: forty actual owned-process samples use fewer helper launches than scalar control',
  { skip: !prepared, timeout: 20000 },
  async (t) => {
    const legacyStarted = performance.now();
    const scalar = await Promise.allSettled(
      Array.from({ length: 40 }, () =>
        windowsProcessResources(process.pid, workerPath),
      ),
    );
    const legacyMs = Math.ceil(performance.now() - legacyStarted);
    const completed = scalar.filter(
      (result) => result.status === 'fulfilled',
    ).length;
    for (const result of scalar)
      if (result.status === 'rejected') {
        assert.equal(result.reason.code, 'PROCESS_SAMPLE_UNAVAILABLE');
        assert.equal(result.reason.cause, undefined);
      }
    assert.equal(processQuerySnapshot().active, 0);
    assert.equal(processQuerySnapshot().waiting, 0);
    const owner = new ProcessResourceBatchOwner();
    const started = performance.now();
    const values = await Promise.all(
      Array.from({ length: 40 }, () =>
        owner.sample(process.pid, workerPath, signal()),
      ),
    );
    const batchMs = Math.ceil(performance.now() - started);
    for (const value of values) {
      assert.ok(Number.isSafeInteger(value.bytes) && value.bytes > 0);
      assert.ok(Number.isSafeInteger(value.micros) && value.micros >= 0);
      assert.ok(value.completedNs >= value.startedNs);
      assert.deepEqual(Object.keys(value).sort(), [
        'bytes',
        'completedNs',
        'micros',
        'startedNs',
      ]);
    }
    const observation = owner.snapshot();
    assert.equal(values.length, 40);
    assert.equal(observation.dispatchedItems, 40);
    assert.ok(observation.maxBatchItems > 1 && observation.maxBatchItems <= 16);
    // Every successful scalar read starts its own child. This is a lower bound,
    // not a claim that rejected scalar admission necessarily started a process.
    assert.ok(observation.launchAttempts < completed);
    empty(owner);
    t.diagnostic(
      JSON.stringify({
        scalarCompleted: completed,
        scalarRefused: 40 - completed,
        scalarSuccessfulLaunchesAtLeast: completed,
        scalarMs: legacyMs,
        batchMs,
        batch: observation,
      }),
    );
  },
);

test(
  'prepared Windows batch owner: actual target refusal preserves healthy sibling values',
  { skip: !prepared, timeout: 10000 },
  async () => {
    const owner = new ProcessResourceBatchOwner();
    const results = await Promise.allSettled(
      [process.pid, 0xffffffff, process.pid].map((pid) =>
        owner.sample(pid, workerPath, signal()),
      ),
    );
    assert.equal(results[0].status, 'fulfilled');
    assert.equal(results[1].status, 'rejected');
    assert.equal(results[1].reason.code, 'PROCESS_SAMPLE_UNAVAILABLE');
    assert.equal(results[1].reason.cause, undefined);
    assert.equal(results[2].status, 'fulfilled');
    assert.ok(results[0].value.bytes > 0 && results[2].value.bytes > 0);
    empty(owner);
  },
);

test(
  'prepared Windows batch owner: eight pre-dispatch cancellations retire admission and preserve a fresh query',
  { skip: !prepared, timeout: 10000 },
  async () => {
    const owner = new ProcessResourceBatchOwner();
    for (let at = 0; at < 8; ++at) {
      const abort = new AbortController();
      const pending = owner.sample(process.pid, workerPath, abort.signal);
      abort.abort('synthetic-private-reason');
      await assert.rejects(pending, (error) => {
        assert.equal(error.code, 'PROCESS_SAMPLE_CANCELLED');
        assert.equal(error.cause, undefined);
        return true;
      });
      empty(owner);
    }
    assert.equal(owner.snapshot().launchAttempts, 0);
    assert.ok(
      (await owner.sample(process.pid, workerPath, signal())).bytes > 0,
    );
    assert.equal(owner.snapshot().launchAttempts, 1);
    empty(owner);
  },
);
