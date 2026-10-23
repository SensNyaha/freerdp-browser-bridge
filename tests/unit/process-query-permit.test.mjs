import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { ProcessQueryGate } from '../../packages/node-bridge/dist/process-query-gate.js';

test('query permit shares ordinary admission and cannot escape completed scope', async () => {
  const gate = new ProcessQueryGate(1, 1, 1000);
  const started = Promise.withResolvers();
  const finish = Promise.withResolvers();
  let permit,
    calls = 0;
  const owner = gate.runWithPermit(
    new AbortController().signal,
    async (value) => {
      permit = value;
      started.resolve();
      await finish.promise;
      return 1;
    },
  );
  await started.promise;
  const queued = gate.run(undefined, async () => 2);
  await assert.rejects(
    gate.run(undefined, async () => assert.fail()),
    { message: 'PROCESS_QUERY_UNAVAILABLE' },
  );
  assert.equal(gate.snapshot().active, 1);
  assert.equal(gate.snapshot().waiting, 1);
  finish.resolve();
  assert.deepEqual(await Promise.all([owner, queued]), [1, 2]);
  await assert.rejects(
    permit.invoke(new AbortController().signal, async () => {
      ++calls;
    }),
    { message: 'PROCESS_QUERY_UNAVAILABLE' },
  );
  assert.equal(calls, 0);
  assert.equal(permit.beforeDispatch(), 'cancelled');
  assert.equal(gate.snapshot().active, 0);
});

test('query permit checks its original deadline again before dispatch', async (t) => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const gate = new ProcessQueryGate(1, 1, 20);
  await gate.runWithPermit(new AbortController().signal, async (permit) => {
    assert.equal(permit.beforeDispatch(), 'ready');
    now = 21;
    assert.equal(permit.beforeDispatch(), 'expired');
    assert.equal(permit.beforeDispatch(), 'expired');
  });
  assert.equal(gate.snapshot().expired, 1);
  assert.equal(gate.snapshot().maxAdmissionMs, 21);
  assert.equal(gate.snapshot().active, 0);
});

test('query permit allows a shared invocation while its own cancelled member is excluded', async () => {
  const gate = new ProcessQueryGate(1, 1, 1000);
  const member = new AbortController();
  const group = new AbortController();
  let calls = 0;
  assert.equal(
    await gate.runWithPermit(member.signal, async (permit) => {
      member.abort('synthetic-private-reason');
      assert.equal(permit.beforeDispatch(), 'cancelled');
      return permit.invoke(group.signal, async () => {
        ++calls;
        return 7;
      });
    }),
    7,
  );
  assert.equal(calls, 1);
  assert.equal(gate.snapshot().active, 0);
});

test('query permit joins delegated completion after early callback failure and refuses duplicate launch', async () => {
  const gate = new ProcessQueryGate(1, 1, 1000);
  const invoked = Promise.withResolvers();
  const finish = Promise.withResolvers();
  const error = new Error('synthetic-private-owner-failure');
  let closed = false,
    permit,
    calls = 0;
  const owner = gate.runWithPermit(
    new AbortController().signal,
    async (value) => {
      permit = value;
      void permit.invoke(new AbortController().signal, async () => {
        ++calls;
        invoked.resolve();
        await finish.promise;
      });
      await invoked.promise;
      throw error;
    },
  );
  const rejected = assert
    .rejects(owner, (actual) => actual === error)
    .then(() => {
      closed = true;
    });
  await invoked.promise;
  await nextTurn();
  assert.equal(closed, false);
  assert.equal(gate.snapshot().active, 1);
  const queued = gate.run(undefined, async () => 3);
  assert.equal(gate.snapshot().waiting, 1);
  await assert.rejects(
    permit.invoke(new AbortController().signal, async () => {
      ++calls;
    }),
    { message: 'PROCESS_QUERY_UNAVAILABLE' },
  );
  finish.resolve();
  await rejected;
  assert.equal(await queued, 3);
  assert.equal(calls, 1);
  assert.equal(gate.snapshot().active, 0);
  assert.equal(gate.snapshot().waiting, 0);
});

test('ordinary query callbacks retain their zero-argument contract', async () => {
  const gate = new ProcessQueryGate();
  assert.equal(
    await gate.run(undefined, async function () {
      return arguments.length;
    }),
    0,
  );
});
