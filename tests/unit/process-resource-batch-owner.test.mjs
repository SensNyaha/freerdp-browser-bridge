import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { ProcessQueryGate } from '../../packages/node-bridge/dist/process-query-gate.js';
import { ProcessResourceBatchOwner } from '../../packages/node-bridge/dist/process-resource-batch.js';

const rows = (pids) =>
  pids.map((pid) => ({ bytes: pid * 10, micros: pid, error: 0 }));
const signal = () => new AbortController().signal;
const fixture = (execute, maximum = 16, waiting = 128) => {
  const gate = new ProcessQueryGate(maximum, waiting, 1000);
  return {
    gate,
    owner: new ProcessResourceBatchOwner(execute, (abort, task) =>
      gate.runWithPermit(abort, task),
    ),
  };
};
async function until(check) {
  for (let at = 0; at < 512; ++at) {
    if (check()) return;
    await nextTurn();
  }
  assert.fail('TEST_BATCH_PHASE_NOT_OBSERVED');
}
function empty(owner, gate) {
  assert.equal(owner.snapshot().collectingGroups, 0);
  assert.equal(owner.snapshot().inFlightGroups, 0);
  assert.equal(owner.snapshot().activeItems, 0);
  assert.equal(gate.snapshot().active, 0);
  assert.equal(gate.snapshot().waiting, 0);
}
function failure(result, code = 'PROCESS_SAMPLE_UNAVAILABLE') {
  assert.equal(result.status, 'rejected');
  assert.equal(result.reason.code, code);
  assert.equal(result.reason.message, code);
  assert.equal(result.reason.cause, undefined);
}

test('synthetic batch owner coalesces forty callers through the same sixteen-permit admission', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  const { owner, gate } = fixture(async (path, pids) => {
    calls.push({ path, pids });
    return rows(pids);
  });
  const pending = Array.from({ length: 40 }, (_, i) =>
    owner.sample(i + 1, 'build/batch/rdp-worker.exe', signal()),
  );
  const settled = Promise.allSettled(pending);
  for (const [index, count] of [16, 16, 8].entries()) {
    await until(
      () =>
        owner.snapshot().collectingGroups === 1 &&
        owner.snapshot().activeItems === count,
    );
    assert.ok(gate.snapshot().active <= 16);
    t.mock.timers.tick(5);
    await until(() => calls.length === index + 1);
  }
  const results = await settled;
  for (const [i, result] of results.entries()) {
    assert.equal(result.status, 'fulfilled');
    assert.equal(result.value.bytes, (i + 1) * 10);
    assert.equal(result.value.micros, i + 1);
    assert.ok(result.value.completedNs >= result.value.startedNs);
    assert.deepEqual(Object.keys(result.value).sort(), [
      'bytes',
      'completedNs',
      'micros',
      'startedNs',
    ]);
  }
  assert.deepEqual(
    calls.map((call) => call.pids.length),
    [16, 16, 8],
  );
  assert.deepEqual(
    calls.flatMap((call) => call.pids),
    Array.from({ length: 40 }, (_, i) => i + 1),
  );
  assert.equal(owner.snapshot().launchAttempts, 3);
  assert.equal(owner.snapshot().dispatchedItems, 40);
  assert.equal(owner.snapshot().maxBatchItems, 16);
  empty(owner, gate);
  const fresh = owner.sample(1, 'build/batch/rdp-worker.exe', signal());
  await until(() => owner.snapshot().activeItems === 1);
  t.mock.timers.tick(5);
  assert.equal((await fresh).bytes, 10);
  assert.equal(owner.snapshot().launchAttempts, 4);
  assert.equal(owner.snapshot().dispatchedItems, 41);
  empty(owner, gate);
});

test('synthetic batch owner and ordinary queries share overflow and joined capacity release', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const started = Promise.withResolvers();
  const finishOrdinary = Promise.withResolvers();
  const finishChildren = Promise.withResolvers();
  let calls = 0;
  const { owner, gate } = fixture(
    async (_path, pids) => {
      ++calls;
      await finishChildren.promise;
      return rows(pids);
    },
    2,
    1,
  );
  const ordinary = gate.run(undefined, async () => {
    started.resolve();
    await finishOrdinary.promise;
    return 1;
  });
  await started.promise;
  const pending = [
    owner.sample(2, 'batch/worker.exe', signal()),
    owner.sample(3, 'batch/worker.exe', signal()),
  ];
  const settled = Promise.allSettled(pending);
  await until(() => owner.snapshot().activeItems === 1);
  assert.equal(gate.snapshot().active, 2);
  assert.equal(gate.snapshot().waiting, 1);
  await assert.rejects(
    gate.run(undefined, async () => assert.fail()),
    { message: 'PROCESS_QUERY_UNAVAILABLE' },
  );
  t.mock.timers.tick(5);
  await until(() => calls === 1);
  assert.equal(gate.snapshot().active, 2);
  finishOrdinary.resolve();
  assert.equal(await ordinary, 1);
  await until(
    () =>
      owner.snapshot().collectingGroups === 1 &&
      owner.snapshot().activeItems === 2,
  );
  t.mock.timers.tick(5);
  await until(() => calls === 2);
  finishChildren.resolve();
  for (const result of await settled) assert.equal(result.status, 'fulfilled');
  empty(owner, gate);
});

test('synthetic batch owner excludes cancelled unsent PID and keeps the cancelled leader permit through shared completion', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const finish = Promise.withResolvers();
  let nativeSignal, dispatched;
  const { owner, gate } = fixture(async (_path, pids, abort) => {
    dispatched = pids;
    nativeSignal = abort;
    await finish.promise;
    return rows(pids);
  });
  const first = new AbortController();
  const pending = [
    owner.sample(1, 'batch/worker.exe', first.signal),
    owner.sample(2, 'batch/worker.exe', signal()),
  ];
  const settled = Promise.allSettled(pending);
  await until(() => owner.snapshot().activeItems === 2);
  first.abort('synthetic-private-reason');
  t.mock.timers.tick(5);
  await until(() => dispatched !== undefined);
  assert.deepEqual(dispatched, [2]);
  assert.equal(nativeSignal.aborted, false);
  assert.equal(gate.snapshot().active, 2);
  finish.resolve();
  const results = await settled;
  failure(results[0], 'PROCESS_SAMPLE_CANCELLED');
  assert.equal(results[1].status, 'fulfilled');
  assert.equal(results[1].value.bytes, 20);
  empty(owner, gate);
});

test('synthetic batch owner cancellation of one dispatched PID preserves sibling and joins the child', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const finish = Promise.withResolvers();
  const aborts = [new AbortController(), new AbortController()];
  let nativeSignal,
    closed = false;
  const { owner, gate } = fixture(async (_path, pids, abort) => {
    nativeSignal = abort;
    await finish.promise;
    return rows(pids);
  });
  const settled = Promise.allSettled(
    aborts.map((abort, i) =>
      owner.sample(i + 1, 'batch/worker.exe', abort.signal),
    ),
  ).then((result) => {
    closed = true;
    return result;
  });
  await until(() => owner.snapshot().activeItems === 2);
  t.mock.timers.tick(5);
  await until(() => nativeSignal !== undefined);
  aborts[0].abort('synthetic-private-reason');
  await nextTurn();
  assert.equal(nativeSignal.aborted, false);
  assert.equal(closed, false);
  assert.equal(gate.snapshot().active, 2);
  finish.resolve();
  const results = await settled;
  failure(results[0], 'PROCESS_SAMPLE_CANCELLED');
  assert.equal(results[1].status, 'fulfilled');
  empty(owner, gate);
});

test('synthetic batch owner all-member cancellation aborts its child but keeps permits until joined close', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const finish = Promise.withResolvers();
  const aborts = [new AbortController(), new AbortController()];
  let nativeSignal,
    closed = false;
  const { owner, gate } = fixture(async (_path, pids, abort) => {
    nativeSignal = abort;
    await finish.promise;
    return rows(pids);
  });
  const settled = Promise.allSettled(
    aborts.map((abort, i) =>
      owner.sample(i + 1, 'batch/worker.exe', abort.signal),
    ),
  ).then((result) => {
    closed = true;
    return result;
  });
  await until(() => owner.snapshot().activeItems === 2);
  t.mock.timers.tick(5);
  await until(() => nativeSignal !== undefined);
  for (const abort of aborts) abort.abort('synthetic-private-reason');
  await nextTurn();
  assert.equal(nativeSignal.aborted, true);
  assert.equal(closed, false);
  assert.equal(gate.snapshot().active, 2);
  finish.resolve();
  for (const result of await settled)
    failure(result, 'PROCESS_SAMPLE_CANCELLED');
  empty(owner, gate);
});

test('synthetic batch owner all-cancelled collection launches nothing and cannot poison replacement', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const aborts = [new AbortController(), new AbortController()];
  const calls = [];
  const { owner, gate } = fixture(async (_path, pids) => {
    calls.push(pids);
    return rows(pids);
  });
  const initial = Promise.allSettled(
    aborts.map((abort, i) =>
      owner.sample(i + 1, 'batch/worker.exe', abort.signal),
    ),
  );
  await until(() => owner.snapshot().activeItems === 2);
  for (const abort of aborts) abort.abort('synthetic-private-reason');
  for (const result of await initial)
    failure(result, 'PROCESS_SAMPLE_CANCELLED');
  assert.equal(calls.length, 0);
  empty(owner, gate);
  const fresh = owner.sample(3, 'batch/worker.exe', signal());
  await until(() => owner.snapshot().activeItems === 1);
  t.mock.timers.tick(5);
  assert.equal((await fresh).bytes, 30);
  assert.deepEqual(calls, [[3]]);
  empty(owner, gate);
});

test('synthetic batch owner suppresses expired collection even when policy timer delivery is delayed', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 0,
    calls = 0;
  t.mock.method(performance, 'now', () => now);
  const { owner, gate } = fixture(async (_path, pids) => {
    ++calls;
    return rows(pids);
  });
  const settled = Promise.allSettled(
    [1, 2].map((pid) => owner.sample(pid, 'batch/worker.exe', signal())),
  );
  await until(() => owner.snapshot().activeItems === 2);
  now = 1001;
  t.mock.timers.tick(5);
  for (const result of await settled) failure(result);
  assert.equal(calls, 0);
  assert.equal(gate.snapshot().expired, 2);
  empty(owner, gate);
});

test('synthetic batch owner expired leader cannot suppress a later healthy member', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const calls = [];
  const { owner, gate } = fixture(async (_path, pids) => {
    calls.push(pids);
    return rows(pids);
  });
  const first = owner.sample(1, 'batch/worker.exe', signal());
  const settledFirst = Promise.allSettled([first]);
  await until(() => owner.snapshot().activeItems === 1);
  now = 500;
  const second = owner.sample(2, 'batch/worker.exe', signal());
  await until(() => owner.snapshot().activeItems === 2);
  now = 1001;
  t.mock.timers.tick(5);
  failure((await settledFirst)[0]);
  assert.equal((await second).bytes, 20);
  assert.deepEqual(calls, [[2]]);
  assert.equal(gate.snapshot().expired, 1);
  empty(owner, gate);
});

test('synthetic batch owner keeps per-PID refusal separate and never merges different helper paths', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  const { owner, gate } = fixture(async (path, pids) => {
    calls.push(path);
    if (path.includes('failed'))
      throw new Error('synthetic-private-helper-failure');
    return pids.map((pid) =>
      pid === 2 ? { bytes: 0, micros: 0, error: 5 } : rows([pid])[0],
    );
  });
  const settled = Promise.allSettled([
    owner.sample(1, 'healthy/worker.exe', signal()),
    owner.sample(2, 'healthy/worker.exe', signal()),
    owner.sample(3, 'healthy/worker.exe', signal()),
    owner.sample(4, 'failed/worker.exe', signal()),
  ]);
  await until(() => owner.snapshot().activeItems === 4);
  t.mock.timers.tick(5);
  const results = await settled;
  assert.equal(results[0].status, 'fulfilled');
  failure(results[1]);
  assert.equal(results[2].status, 'fulfilled');
  failure(results[3]);
  assert.equal(new Set(calls).size, 2);
  assert.ok(!JSON.stringify(owner.snapshot()).includes('private'));
  empty(owner, gate);
});

test('synthetic batch owner refuses malformed complete executor data before publishing any member', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const malformed = [
    [],
    Array(2),
    [rows([1])[0], { bytes: 20, micros: -1, error: 0 }],
    [rows([1])[0], { bytes: 0, micros: 0, error: -0 }],
    [
      rows([1])[0],
      {
        get bytes() {
          throw new Error('synthetic-private-getter');
        },
      },
    ],
  ];
  for (const values of malformed) {
    const { owner, gate } = fixture(async () => values);
    const settled = Promise.allSettled(
      [1, 2].map((pid) => owner.sample(pid, 'batch/worker.exe', signal())),
    );
    await until(() => owner.snapshot().activeItems === 2);
    t.mock.timers.tick(5);
    for (const result of await settled) failure(result);
    empty(owner, gate);
  }
});

test('synthetic batch owner validates before admission and never stores caller error reasons', async () => {
  let calls = 0;
  const { owner, gate } = fixture(async () => {
    ++calls;
    return [];
  });
  for (const pid of [0, -1, 0.5, NaN, Infinity, '1', 0x100000000])
    await assert.rejects(owner.sample(pid, 'unused', signal()), {
      code: 'PROCESS_SAMPLE_INVALID',
    });
  await assert.rejects(owner.sample(1, 'unused', undefined), {
    code: 'PROCESS_SAMPLE_INVALID',
  });
  const abort = new AbortController();
  abort.abort('synthetic-private-reason');
  await assert.rejects(owner.sample(1, 'unused', abort.signal), {
    code: 'PROCESS_SAMPLE_CANCELLED',
  });
  await assert.rejects(owner.sample(1, '', signal()), {
    code: 'PROCESS_SAMPLE_UNAVAILABLE',
  });
  assert.equal(calls, 0);
  empty(owner, gate);
});
