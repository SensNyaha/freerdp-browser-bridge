import test from 'node:test';
import assert from 'node:assert/strict';
import { eventually } from '../fixtures/session-worker.mjs';

test('fixture wait: a requested deadline cannot silently use the three-second default', async (t) => {
  // Wall-clock changes must not renew a finite wait.
  t.mock.method(Date, 'now', () => -1000);
  const start = performance.now();
  await assert.rejects(
    eventually(() => performance.now() - start > 150, 20),
    { message: 'Test condition deadline exceeded' },
  );
});

test('fixture wait: invalid or unbounded deadlines refuse before invoking the predicate', async () => {
  for (const timeout of [0, -1, 1.5, NaN, Infinity, 60001, '20', null])
    await assert.rejects(
      eventually(() => assert.fail('predicate called'), timeout),
      { message: 'Invalid fixture wait deadline' },
    );
});

test('fixture wait: delayed success beyond the default honors an explicit finite window', async () => {
  const start = performance.now();
  await eventually(() => performance.now() - start >= 3100, 6000);
});

test('fixture wait: predicate faults keep their identity and immediate success needs no timer', async () => {
  const fault = new Error('synthetic predicate fault');
  await assert.rejects(
    eventually(() => {
      throw fault;
    }),
    (error) => error === fault,
  );
  await eventually(() => true, 1);
});
