import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioResetDiagnostics } from '../../scripts/audio-reset-diagnostics.mjs';

test('lab reset accounting preserves exact authority, promise completion, result and error identity without retaining them', async () => {
  const diagnostics = new AudioResetDiagnostics();
  const epoch = 0xffffffffffffffffn;
  const error = new Error('synthetic-private-error');
  const unexpected = { private: 'synthetic-private-result' };
  const results = [
    'scheduled',
    'stale',
    'busy',
    'unavailable',
    unexpected,
    error,
  ];
  let calls = 0;
  const reset = diagnostics.wrap(async (actual) => {
    assert.equal(actual, epoch);
    const result = results[calls++];
    if (result === error) throw error;
    return result;
  });
  for (const expected of results.slice(0, -1))
    assert.equal(await reset(epoch), expected);
  await assert.rejects(reset(epoch), (actual) => actual === error);
  assert.equal(calls, 6);
  assert.deepEqual(diagnostics.snapshot(), {
    requests: 6,
    scheduled: 1,
    stale: 1,
    busy: 1,
    unavailable: 1,
    unexpected: 1,
    failures: 1,
  });
  const copy = diagnostics.snapshot();
  copy.requests = 0;
  assert.equal(diagnostics.snapshot().requests, 6);
  assert.ok(!JSON.stringify(diagnostics.snapshot()).includes('private'));
});

test('lab reset accounting observes an unresolved call without retrying or granting a completion', async () => {
  const diagnostics = new AudioResetDiagnostics();
  let release;
  let calls = 0;
  const reset = diagnostics.wrap(() => {
    ++calls;
    return new Promise((done) => {
      release = done;
    });
  });
  const pending = reset(1n);
  assert.equal(calls, 1);
  assert.equal(diagnostics.snapshot().requests, 1);
  assert.equal(diagnostics.snapshot().scheduled, 0);
  release('scheduled');
  assert.equal(await pending, 'scheduled');
  assert.equal(calls, 1);
  assert.equal(diagnostics.snapshot().scheduled, 1);
});
