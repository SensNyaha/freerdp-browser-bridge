import test from 'node:test';
import assert from 'node:assert/strict';
import { MicrophoneIngress } from '../../packages/node-bridge/dist/index.js';
import {
  encodeMicrophoneRecord,
  ProtocolError,
} from '../../packages/protocol/dist/index.js';
const source = () => ({
  enabled: true,
  availability: 'ready',
  revision: 1n,
  epoch: 1n,
  timestampUs: 100n,
});
const wire = (
  sequence = 1,
  timestampUs = 0n,
  discontinuity = true,
  epoch = 1n,
) =>
  encodeMicrophoneRecord(
    { epoch, timestampUs, discontinuity, pcm: Buffer.alloc(3840, 7) },
    sequence,
  );
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test('microphone ingress: one owned PCM slot, frozen metadata, busy without borrowing and drain wipes after completion', async () => {
  const pending = deferred();
  let borrowed,
    calls = 0;
  const ingress = new MicrophoneIngress({
    authorized: () => true,
    source,
    submit: (packet) => {
      borrowed = packet;
      ++calls;
      return pending.promise;
    },
  });
  const original = wire(),
    first = ingress.receive(original);
  original.fill(0, 36);
  assert.equal(borrowed.pcm[0], 7);
  assert.equal(Object.isFrozen(borrowed), true);
  assert.throws(() => {
    borrowed.epoch = 99n;
  }, TypeError);
  assert.deepEqual(await ingress.receive(wire(2, 20000n, false)), {
    sequence: 2,
    result: 'busy',
  });
  assert.equal(calls, 1);
  let drained = false;
  const close = ingress.close().then(() => {
    drained = true;
  });
  await Promise.resolve();
  assert.equal(drained, false);
  assert.equal(borrowed.pcm[0], 7);
  assert.equal((await ingress.receive(wire(3))).result, 'unavailable');
  pending.resolve('accepted');
  assert.deepEqual(await first, { sequence: 1, result: 'unavailable' });
  await close;
  assert.equal(drained, true);
  assert.equal(
    borrowed.pcm.every((value) => value === 0),
    true,
  );
  assert.equal(ingress.drainEpoch, 1n);
  assert.equal(ingress.stats.inFlight, false);
  ingress.stats.accepted = 99;
  assert.equal(ingress.stats.accepted, 0);
});
test('microphone ingress: sequence consumption, first discontinuity, gaps and monotonic capture timestamps', async () => {
  let calls = 0;
  const ingress = new MicrophoneIngress({
    authorized: () => true,
    source,
    submit: async () => {
      ++calls;
      return 'accepted';
    },
  });
  assert.equal((await ingress.receive(wire(1, 0n, false))).result, 'invalid');
  assert.equal((await ingress.receive(wire(2))).result, 'accepted');
  assert.equal((await ingress.receive(wire(2))).result, 'stale');
  assert.equal(
    (await ingress.receive(wire(3, 40000n, false))).result,
    'invalid',
  );
  assert.equal(
    (await ingress.receive(wire(4, 40000n, true))).result,
    'accepted',
  );
  assert.equal(
    (await ingress.receive(wire(5, 40000n, true))).result,
    'invalid',
  );
  assert.equal(
    (await ingress.receive(wire(6, 39999n, true))).result,
    'invalid',
  );
  assert.equal(
    (await ingress.receive(wire(7, 60000n, false))).result,
    'accepted',
  );
  assert.equal(calls, 3);
  await ingress.close();
});
test('microphone ingress: epoch/lease recheck suppresses late acceptance and requires fresh discontinuity', async () => {
  let state = source(),
    authorized = true,
    next = deferred(),
    calls = 0;
  const ingress = new MicrophoneIngress({
    authorized: () => authorized,
    source: () => state,
    submit: () => {
      ++calls;
      return next.promise;
    },
  });
  const first = ingress.receive(wire());
  state = { ...state, revision: 2n, epoch: 2n, timestampUs: 101n };
  next.resolve('accepted');
  assert.equal((await first).result, 'stale');
  assert.equal(
    (await ingress.receive(wire(2, 0n, false, 2n))).result,
    'invalid',
  );
  next = deferred();
  const second = ingress.receive(wire(3, 0n, true, 2n));
  authorized = false;
  next.resolve('accepted');
  assert.equal((await second).result, 'unavailable');
  assert.equal(ingress.stats.closed, true);
  authorized = true;
  assert.equal(
    (await ingress.receive(wire(4, 20000n, false, 2n))).result,
    'unavailable',
  );
  assert.equal(calls, 2);
  await ingress.close();
});
test('microphone ingress: waiting/missing authority and stale input never reach native submission', async () => {
  let state,
    calls = 0;
  const ingress = new MicrophoneIngress({
    authorized: () => true,
    source: () => state,
    submit: async () => {
      ++calls;
      return 'accepted';
    },
  });
  assert.equal((await ingress.receive(wire())).result, 'unavailable');
  state = { ...source(), availability: 'waiting', epoch: 0n };
  assert.equal((await ingress.receive(wire(2))).result, 'unavailable');
  state = { ...source(), revision: 2n };
  assert.equal((await ingress.receive(wire(3, 0n, true, 2n))).result, 'stale');
  assert.equal(calls, 0);
  assert.equal(ingress.drainEpoch, undefined);
  await ingress.close();
});
test('microphone ingress: busy attempt consumes sequence; typed refusal preserves capture continuity without replay', async () => {
  for (const result of ['stale', 'unavailable', 'busy', 'invalid']) {
    let calls = 0;
    const ingress = new MicrophoneIngress({
      authorized: () => true,
      source,
      submit: async () => {
        ++calls;
        return result;
      },
    });
    assert.equal((await ingress.receive(wire())).result, result);
    assert.equal((await ingress.receive(wire())).result, 'stale');
    assert.equal(
      (await ingress.receive(wire(2, 20000n, false))).result,
      'invalid',
    );
    assert.equal(calls, 1);
    await ingress.close();
  }
});
test('microphone ingress: malformed/replayed source metadata and unknown/throwing backend fail closed without disclosure', async () => {
  for (const mode of [
    'unknown',
    'throw',
    'bad-source',
    'mutated-revision',
    'clock',
  ]) {
    let calls = 0,
      state = source();
    const ingress = new MicrophoneIngress({
      authorized: () => true,
      source: () => state,
      submit: async () => {
        ++calls;
        if (mode === 'throw') throw new Error('synthetic-sensitive-sentinel');
        if (mode === 'unknown') return 'unknown';
        if (mode === 'mutated-revision')
          state = { ...state, timestampUs: 102n };
        if (mode === 'clock')
          state = { ...state, revision: 2n, timestampUs: 99n };
        return 'accepted';
      },
    });
    if (mode === 'bad-source') state = { ...state, epoch: 0n };
    assert.equal((await ingress.receive(wire())).result, 'unavailable');
    assert.equal(ingress.stats.closed, true);
    assert.equal(ingress.stats.faults, 1);
    assert.equal((await ingress.receive(wire(2))).result, 'unavailable');
    assert.equal(calls, mode === 'bad-source' ? 0 : 1);
    await ingress.close();
  }
  const ingress = new MicrophoneIngress({
    authorized: () => true,
    source,
    submit: async () => 'accepted',
  });
  await assert.rejects(ingress.receive(Buffer.alloc(2)), ProtocolError);
  assert.equal(ingress.stats.invalid, 1);
  assert.equal(ingress.stats.inFlight, false);
  await ingress.close();
});
test('microphone ingress: reentrant close joins pending ownership and prevents pre-submit copying', async () => {
  let ingress,
    draining,
    calls = 0;
  ingress = new MicrophoneIngress({
    authorized: () => true,
    source: () => {
      draining = ingress.close();
      return source();
    },
    submit: async () => {
      ++calls;
      return 'accepted';
    },
  });
  assert.equal((await ingress.receive(wire())).result, 'unavailable');
  await draining;
  assert.equal(calls, 0);
  assert.equal(ingress.drainEpoch, undefined);
  assert.equal(ingress.stats.inFlight, false);
});
