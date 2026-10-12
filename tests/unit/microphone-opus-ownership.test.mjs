import test from 'node:test';
import assert from 'node:assert/strict';
import { MicrophoneOwnership } from '../../packages/node-bridge/dist/index.js';
import { encodeMicrophoneOpusRecord } from '../../packages/protocol/dist/index.js';
const tick = () => new Promise((done) => setImmediate(done));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const wire = (epoch = 1n, sequence = 1, discontinuity = true) =>
  encodeMicrophoneOpusRecord(
    {
      epoch,
      timestampUs: 0n,
      discontinuity,
      lookaheadFrames: 312,
      encoded: Buffer.from([0xfc, 0xff, 0xfe]),
    },
    sequence,
  );
function fixture(timeout = 1000) {
  let state = {
      enabled: true,
      availability: 'ready',
      epoch: 1n,
      revision: 1n,
      timestampUs: 0n,
    },
    listener;
  const calls = { submit: 0, reset: 0, terminate: 0, unsubscribe: 0 };
  const publish = (patch = {}) => {
    state = {
      ...state,
      revision: state.revision + 1n,
      timestampUs: state.timestampUs + 1n,
      ...patch,
    };
    listener?.(state);
  };
  const backend = {
    codec: 'opus',
    source: () => state,
    onSource: (value) => {
      listener = value;
      return () => {
        ++calls.unsubscribe;
        listener = undefined;
      };
    },
    submit: async (packet) => {
      ++calls.submit;
      assert.equal('pcm' in packet, false);
      assert.equal(packet.lookaheadFrames, 312);
      return 'accepted';
    },
    reset: async (epoch) => {
      ++calls.reset;
      assert.equal(epoch, state.epoch);
      publish({ epoch: epoch + 1n });
      return 'scheduled';
    },
    terminate: () => {
      ++calls.terminate;
    },
  };
  return {
    owner: new MicrophoneOwnership(backend, timeout),
    backend,
    calls,
    publish,
  };
}

test('Opus ownership: exclusive immutable selected grant, drain/reset before new epoch and stale owner immunity', async () => {
  const f = fixture();
  f.backend.codec = 'pcm';
  const first = f.owner.acquire(() => true);
  assert.equal((await first.receive(wire())).result, 'accepted');
  assert.equal(
    f.owner.acquire(() => true),
    undefined,
  );
  const release = f.owner.release(first);
  assert.equal(f.owner.release(first), release);
  assert.equal(
    f.owner.acquire(() => true),
    undefined,
  );
  assert.equal(await release, true);
  assert.equal(f.calls.reset, 1);
  assert.equal(f.calls.unsubscribe, 1);
  const next = f.owner.acquire(() => true);
  assert.equal(await f.owner.release(first), false);
  assert.equal((await first.receive(wire(2n))).result, 'unavailable');
  assert.equal((await next.receive(wire(2n, 1, false))).result, 'invalid');
  assert.equal((await next.receive(wire(2n, 2))).result, 'accepted');
  assert.equal(await f.owner.close(), true);
  assert.equal(f.calls.reset, 2);
  assert.equal(f.calls.terminate, 0);
  assert.equal(
    f.owner.acquire(() => true),
    undefined,
  );
});

test('Opus ownership: pending compressed borrow drains and wipes before reset; scheduled reply alone cannot transfer grant', async () => {
  const f = fixture(),
    submitted = deferred(),
    reset = deferred();
  let borrowed;
  f.backend.submit = (packet) => {
    ++f.calls.submit;
    borrowed = packet.encoded;
    return submitted.promise;
  };
  f.backend.reset = () => {
    ++f.calls.reset;
    return reset.promise;
  };
  const first = f.owner.acquire(() => true),
    packet = first.receive(wire());
  const release = f.owner.release(first);
  await tick();
  assert.equal(f.calls.reset, 0);
  assert.equal(borrowed[0], 0xfc);
  submitted.resolve('accepted');
  assert.equal((await packet).result, 'unavailable');
  await tick();
  assert.equal(
    borrowed.every((v) => v === 0),
    true,
  );
  assert.equal(f.calls.reset, 1);
  reset.resolve('scheduled');
  await tick();
  assert.equal(f.owner.status, 'retiring');
  assert.equal(
    f.owner.acquire(() => true),
    undefined,
  );
  f.publish({ epoch: 2n, availability: 'waiting' });
  assert.equal(await release, true);
  const next = f.owner.acquire(() => true);
  assert.equal((await next.receive(wire(2n))).result, 'unavailable');
  assert.equal(await f.owner.close(), true);
  assert.equal(f.calls.reset, 1);
  assert.equal(f.calls.terminate, 0);
});

test('Opus ownership: newer source proves native retirement; empty grant needs no reset', async () => {
  const f = fixture();
  const empty = f.owner.acquire(() => true);
  assert.equal(await f.owner.release(empty), true);
  assert.equal(f.calls.reset, 0);
  const first = f.owner.acquire(() => true);
  assert.equal((await first.receive(wire())).result, 'accepted');
  f.publish({ epoch: 2n });
  assert.equal(await f.owner.release(first), true);
  assert.equal(f.calls.reset, 0);
  assert.equal(f.calls.terminate, 0);
  assert.equal(await f.owner.close(), true);
});

test('Opus ownership: delegated submit is read only after grant reservation; reentrant acquire cannot create another owner', async () => {
  const f = fixture();
  let reads = 0;
  Object.defineProperty(f.backend, 'submit', {
    get() {
      ++reads;
      assert.equal(
        f.owner.acquire(() => true),
        undefined,
      );
      return async () => 'accepted';
    },
  });
  const first = f.owner.acquire(() => true);
  assert.equal(reads, 0);
  assert.equal((await first.receive(wire())).result, 'accepted');
  assert.equal(reads, 1);
  assert.equal(await f.owner.close(), true);
  assert.equal(f.calls.reset, 1);
  assert.equal(f.calls.terminate, 0);
});

test('Opus ownership: refusing reset, missing fresh epoch and closed source fail transfer once within finite deadline', async () => {
  for (const mode of ['refuse', 'hung', 'no-publication', 'closed']) {
    const f = fixture(40);
    const first = f.owner.acquire(() => true);
    assert.equal((await first.receive(wire())).result, 'accepted');
    f.backend.reset = async () => {
      ++f.calls.reset;
      if (mode === 'hung') return new Promise(() => {});
      if (mode === 'closed') f.publish({ availability: 'closed' });
      return mode === 'refuse' ? 'busy' : 'scheduled';
    };
    assert.equal(await f.owner.release(first), false);
    assert.equal(f.owner.status, 'failed');
    assert.equal(f.calls.terminate, 1);
    assert.equal(f.calls.reset, 1);
    assert.equal(f.calls.unsubscribe, 1);
    f.publish({ epoch: 2n });
    assert.equal(
      f.owner.acquire(() => true),
      undefined,
    );
    assert.equal(await f.owner.close(), false);
    assert.equal(f.calls.terminate, 1);
  }
  const f = fixture();
  assert.throws(
    () => new MicrophoneOwnership({ ...f.backend, codec: 'unknown' }),
  );
  await f.owner.close();
});
