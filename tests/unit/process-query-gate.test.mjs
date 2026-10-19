import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import {
  ProcessQueryGate,
  withProcessQuery,
} from '../../packages/node-bridge/dist/process-query-gate.js';

test('process query admission bounds concurrency and refuses overflow before invoking a task', async () => {
  const gate = new ProcessQueryGate(1, 1, 1000);
  let finish,
    starts = 0;
  const active = gate.run(undefined, async () => {
    ++starts;
    await new Promise((done) => {
      finish = done;
    });
    return 1;
  });
  const waiting = gate.run(undefined, async () => {
    ++starts;
    return 2;
  });
  await assert.rejects(
    gate.run(undefined, async () => {
      ++starts;
    }),
    { message: 'PROCESS_QUERY_UNAVAILABLE' },
  );
  assert.equal(starts, 1);
  finish();
  assert.deepEqual(await Promise.all([active, waiting]), [1, 2]);
  assert.equal(starts, 2);
});

test('process query queued cancellation removes its record and never forwards the abort reason', async () => {
  const gate = new ProcessQueryGate(1, 1, 1000);
  let finish,
    cancelledStarted = false;
  const active = gate.run(
    undefined,
    () =>
      new Promise((done) => {
        finish = done;
      }),
  );
  const abort = new AbortController();
  const waiting = gate.run(abort.signal, async () => {
    cancelledStarted = true;
  });
  const rejected = assert.rejects(waiting, (error) => {
    assert.equal(error.message, 'PROCESS_QUERY_CANCELLED');
    assert.equal(error.cause, undefined);
    return true;
  });
  abort.abort('private-reason');
  await rejected;
  const replacement = gate.run(undefined, async () => 3);
  finish();
  await active;
  assert.equal(await replacement, 3);
  assert.equal(cancelledStarted, false);
});

test('process query finite admission deadline removes an expired task and permits replacement', async () => {
  const gate = new ProcessQueryGate(1, 1, 25);
  let finish,
    expiredStarted = false;
  const active = gate.run(
    undefined,
    () =>
      new Promise((done) => {
        finish = done;
      }),
  );
  await assert.rejects(
    gate.run(undefined, async () => {
      expiredStarted = true;
    }),
    { message: 'PROCESS_QUERY_UNAVAILABLE' },
  );
  const replacement = gate.run(undefined, async () => 4);
  finish();
  await active;
  assert.equal(await replacement, 4);
  assert.equal(expiredStarted, false);
});

test('process query pre/invocation cancellation and task rejection always retire admission', async () => {
  const gate = new ProcessQueryGate(1, 1, 1000);
  const before = new AbortController();
  before.abort('private-reason');
  let starts = 0;
  await assert.rejects(
    gate.run(before.signal, async () => {
      ++starts;
    }),
    { message: 'PROCESS_QUERY_CANCELLED' },
  );
  const after = new AbortController();
  const pending = gate.run(after.signal, async () => {
    ++starts;
  });
  after.abort('private-reason');
  await assert.rejects(pending, { message: 'PROCESS_QUERY_CANCELLED' });
  await assert.rejects(
    gate.run(undefined, async () => {
      throw new Error('TEST_TASK_FAILED');
    }),
    { message: 'TEST_TASK_FAILED' },
  );
  assert.equal(await gate.run(undefined, async () => 5), 5);
  assert.equal(starts, 0);
});

test('process query never starts an expired waiter when event-loop timers are delayed', async () => {
  const gate = new ProcessQueryGate(1, 1, 20);
  let finish,
    started = false;
  const active = gate.run(
    undefined,
    () =>
      new Promise((done) => {
        finish = done;
      }),
  );
  const waiting = gate.run(undefined, async () => {
    started = true;
  });
  const rejected = assert.rejects(waiting, {
    message: 'PROCESS_QUERY_UNAVAILABLE',
  });
  await Promise.resolve();
  const until = performance.now() + 30;
  while (performance.now() < until) {
    /* Hold this turn past the admission deadline. */
  }
  finish();
  await active;
  await rejected;
  assert.equal(started, false);
  assert.equal(await gate.run(undefined, async () => 6), 6);
});

test('process query owner keeps a fixed four-way bound across a forty-task burst', async () => {
  const gate = new ProcessQueryGate();
  let active = 0,
    peak = 0;
  const results = await Promise.all(
    Array.from({ length: 40 }, (_, index) =>
      gate.run(undefined, async () => {
        ++active;
        peak = Math.max(peak, active);
        try {
          await delay(2);
          return index;
        } finally {
          --active;
        }
      }),
    ),
  );
  assert.equal(peak, 4);
  assert.equal(active, 0);
  assert.deepEqual(
    results,
    Array.from({ length: 40 }, (_, index) => index),
  );
  for (const args of [
    [0, 1, 1],
    [1, 0, 1],
    [1, 1, 0],
    [65, 1, 1],
    [1, 1025, 1],
    [1, 1, 60001],
    [1.5, 1, 1],
  ])
    assert.throws(() => new ProcessQueryGate(...args), {
      message: 'INVALID_PROCESS_QUERY_OPTIONS',
    });
});

test('shared process query owner admits at most sixteen helper tasks across all callers', async () => {
  let active = 0,
    peak = 0;
  await Promise.all(
    Array.from({ length: 40 }, () =>
      withProcessQuery(undefined, async () => {
        ++active;
        peak = Math.max(peak, active);
        try {
          await delay(2);
        } finally {
          --active;
        }
      }),
    ),
  );
  assert.equal(peak, 16);
  assert.equal(active, 0);
});
