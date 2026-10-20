import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { ProcessQueryGate } from '../../packages/node-bridge/dist/process-query-gate.js';

test('process query launch bursts permit an event-loop observer between consecutive invocations', async () => {
  const gate = new ProcessQueryGate(16, 128, 3000);
  let observed = 0;
  const before = [];
  const results = await Promise.all(
    Array.from({ length: 16 }, (_, index) =>
      gate.run(undefined, async () => {
        before.push(observed);
        void nextTurn().then(() => {
          ++observed;
        });
        return index;
      }),
    ),
  );
  await nextTurn();
  assert.deepEqual(
    before,
    Array.from({ length: 16 }, (_, index) => index),
  );
  assert.deepEqual(
    results,
    Array.from({ length: 16 }, (_, index) => index),
  );
  assert.equal(observed, 16);
  assert.equal(gate.snapshot().active, 0);
  assert.equal(gate.snapshot().waiting, 0);
});

test('process query invocation staging retains the absolute admission bound', async (t) => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const gate = new ProcessQueryGate(2, 1, 20);
  let lateStarted = false;
  const results = await Promise.allSettled([
    gate.run(undefined, async () => {
      now = 21;
      return 1;
    }),
    gate.run(undefined, async () => {
      lateStarted = true;
      return 2;
    }),
  ]);
  assert.deepEqual(results[0], { status: 'fulfilled', value: 1 });
  assert.equal(results[1].status, 'rejected');
  assert.equal(results[1].reason.message, 'PROCESS_QUERY_UNAVAILABLE');
  assert.equal(lateStarted, false);
  assert.equal(gate.snapshot().expired, 1);
  assert.equal(gate.snapshot().taskFailures, 0);
  assert.equal(gate.snapshot().active, 0);
  assert.equal(gate.snapshot().waiting, 0);
});

test('process query invocation turns retain sixteen concurrently pending tasks', async () => {
  const gate = new ProcessQueryGate(16, 128, 3000);
  const begun = Promise.withResolvers();
  const finish = Promise.withResolvers();
  let active = 0,
    peak = 0,
    timer;
  const pending = Array.from({ length: 16 }, () =>
    gate.run(undefined, async () => {
      ++active;
      peak = Math.max(peak, active);
      if (active === 16) begun.resolve();
      try {
        await finish.promise;
      } finally {
        --active;
      }
    }),
  );
  try {
    await Promise.race([
      begun.promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('TEST_LAUNCH_CHAIN_HELD_THROUGH_COMPLETION')),
          1000,
        );
      }),
    ]);
    assert.equal(peak, 16);
    assert.equal(active, 16);
    assert.equal(gate.snapshot().active, 16);
  } finally {
    clearTimeout(timer);
    finish.resolve();
    const results = await Promise.allSettled(pending);
    for (const result of results) assert.equal(result.status, 'fulfilled');
  }
  assert.equal(active, 0);
  assert.equal(gate.snapshot().active, 0);
  assert.equal(gate.snapshot().waiting, 0);
});

test('process query invocation cancellation releases the launch chain and preserves following work', async () => {
  const gate = new ProcessQueryGate(2, 1, 1000);
  const abort = new AbortController();
  const invoked = [];
  const results = await Promise.allSettled([
    gate.run(undefined, async () => {
      invoked.push(1);
      abort.abort('synthetic-private-reason');
      return 1;
    }),
    gate.run(abort.signal, async () => {
      invoked.push(2);
      return 2;
    }),
    gate.run(undefined, async () => {
      invoked.push(3);
      return 3;
    }),
  ]);
  assert.deepEqual(invoked, [1, 3]);
  assert.deepEqual(results[0], { status: 'fulfilled', value: 1 });
  assert.equal(results[1].status, 'rejected');
  assert.equal(results[1].reason.message, 'PROCESS_QUERY_CANCELLED');
  assert.equal(results[1].reason.cause, undefined);
  assert.deepEqual(results[2], { status: 'fulfilled', value: 3 });
  assert.equal(await gate.run(undefined, async () => 4), 4);
  assert.equal(gate.snapshot().active, 0);
  assert.equal(gate.snapshot().waiting, 0);
});
