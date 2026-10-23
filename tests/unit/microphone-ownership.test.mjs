import test from 'node:test';
import assert from 'node:assert/strict';
import { MicrophoneOwnership } from '../../packages/node-bridge/dist/index.js';
import { encodeMicrophoneRecord } from '../../packages/protocol/dist/index.js';
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const wire = (epoch = 1n) =>
  encodeMicrophoneRecord(
    {
      epoch,
      timestampUs: 0n,
      discontinuity: true,
      pcm: Buffer.alloc(3840, 9),
    },
    1,
  );
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture(timeout = 1000) {
  let state = {
    enabled: true,
    availability: 'ready',
    revision: 1n,
    epoch: 1n,
    timestampUs: 0n,
  };
  let listener;
  const calls = {
    reset: 0,
    terminate: 0,
    unsubscribe: 0,
    submit: 0,
    subscribe: 0,
  };
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
    source: () => state,
    onSource: (value) => {
      ++calls.subscribe;
      listener = value;
      return () => {
        ++calls.unsubscribe;
        listener = undefined;
      };
    },
    submit: async () => {
      ++calls.submit;
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
    get state() {
      return state;
    },
  };
}

test('microphone ownership: exclusive grant, empty release, stale owner immunity and permanent close', async () => {
  const f = fixture();
  const first = f.owner.acquire(() => true);
  assert.equal(f.owner.status, 'active');
  assert.equal(
    f.owner.acquire(() => true),
    undefined,
  );
  const release = f.owner.release(first);
  assert.equal(f.owner.status, 'retiring');
  assert.equal(f.owner.release(first), release);
  assert.equal(
    f.owner.acquire(() => true),
    undefined,
  );
  assert.equal(await release, true);
  assert.equal(f.calls.reset, 0);
  const next = f.owner.acquire(() => true);
  assert.equal(await f.owner.release(first), false);
  assert.equal(f.owner.status, 'active');
  assert.equal(await f.owner.close(), true);
  assert.equal(f.owner.status, 'closed');
  assert.equal((await next.receive(wire())).result, 'unavailable');
  assert.equal(
    f.owner.acquire(() => true),
    undefined,
  );
  assert.throws(() => new MicrophoneOwnership(f.backend, 19));
  assert.throws(() => new MicrophoneOwnership(f.backend, 5001));
  assert.throws(() => f.owner.acquire(null));
});

test('microphone ownership: drain precedes one reset, fresh publication precedes replacement and late admission grants nothing', async () => {
  const f = fixture();
  const submitted = deferred(),
    reset = deferred();
  let borrowed;
  f.backend.submit = (packet) => {
    borrowed = packet.pcm;
    ++f.calls.submit;
    return submitted.promise;
  };
  f.backend.reset = () => {
    ++f.calls.reset;
    return reset.promise;
  };
  const first = f.owner.acquire(() => true);
  const packet = first.receive(wire());
  const released = f.owner.release(first);
  await tick();
  assert.equal(f.calls.reset, 0);
  assert.equal(borrowed[0], 9);
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
  assert.equal(
    f.owner.acquire(() => true),
    undefined,
  );
  f.publish({ epoch: 2n, availability: 'waiting' });
  assert.equal(await released, true);
  assert.equal(f.calls.unsubscribe, 1);
  const next = f.owner.acquire(() => true);
  assert.equal((await next.receive(wire(2n))).result, 'unavailable');
  f.publish({ availability: 'ready' });
  f.backend.submit = async () => 'accepted';
  const bytes = wire(2n);
  bytes.writeUInt32BE(2, 12);
  assert.equal((await next.receive(bytes)).result, 'accepted');
  f.backend.reset = async (epoch) => {
    f.publish({ epoch: epoch + 1n });
    return 'scheduled';
  };
  assert.equal(await f.owner.close(), true);
});

test('microphone ownership: newer server epoch avoids redundant reset; publication may precede reset reply', async () => {
  for (const before of [false, true]) {
    const f = fixture();
    const ingress = f.owner.acquire(() => true);
    assert.equal((await ingress.receive(wire())).result, 'accepted');
    if (before) f.publish({ epoch: 2n });
    else
      f.backend.reset = async () => {
        ++f.calls.reset;
        f.publish({ epoch: 2n });
        await tick();
        return 'stale';
      };
    assert.equal(await f.owner.release(ingress), true);
    assert.equal(f.calls.reset, before ? 0 : 1);
    assert.equal(f.owner.status, 'idle');
    assert.equal(f.calls.terminate, 0);
    await f.owner.close();
  }
});

test('microphone ownership: typed refusal, unknown result and backend failure never transfer authority or retry', async () => {
  for (const result of ['busy', 'unavailable', 'stale', 'unknown', 'throw']) {
    const f = fixture();
    const ingress = f.owner.acquire(() => true);
    await ingress.receive(wire());
    f.backend.reset = async () => {
      ++f.calls.reset;
      if (result === 'throw') throw new Error('private fault');
      return result;
    };
    f.backend.terminate = () => {
      ++f.calls.terminate;
      throw new Error('private fault');
    };
    assert.equal(await f.owner.release(ingress), false);
    assert.equal(f.owner.status, 'failed');
    assert.equal(f.calls.reset, 1);
    assert.equal(f.calls.terminate, 1);
    assert.equal(f.calls.unsubscribe, 1);
    assert.equal(
      f.owner.acquire(() => true),
      undefined,
    );
    assert.equal(await f.owner.close(), false);
    assert.equal(f.calls.terminate, 1);
  }
});

test('microphone ownership: malformed and regressed publication stays terminal even after a fresh event; disposer faults fail closed', async () => {
  for (const mode of [
    'mutation',
    'regression',
    'closed',
    'after-fresh',
    'disposer',
  ]) {
    const f = fixture();
    const ingress = f.owner.acquire(() => true);
    await ingress.receive(wire());
    if (mode === 'disposer') {
      const original = f.backend.onSource;
      f.backend.onSource = (listener) => {
        const remove = original(listener);
        return () => {
          remove();
          throw new Error('private fault');
        };
      };
    } else
      f.backend.reset = async () => {
        if (mode === 'mutation')
          f.publish({ revision: 1n, timestampUs: 0n, availability: 'waiting' });
        if (mode === 'regression') f.publish({ epoch: 0n });
        if (mode === 'closed') f.publish({ availability: 'closed' });
        if (mode === 'after-fresh') {
          f.publish({ epoch: 2n });
          f.publish({ epoch: 1n });
        }
        f.publish({ epoch: 3n, availability: 'ready' });
        return 'scheduled';
      };
    assert.equal(await f.owner.release(ingress), false);
    assert.equal(f.owner.status, 'failed');
    assert.equal(f.calls.terminate, 1);
    assert.equal(f.calls.unsubscribe, 1);
  }
});

test('microphone ownership: one finite deadline covers hanging drain and late completion cannot start reset', async () => {
  const f = fixture(25),
    submitted = deferred();
  let borrowed;
  f.backend.submit = (packet) => {
    borrowed = packet.pcm;
    return submitted.promise;
  };
  f.backend.terminate = () => {
    ++f.calls.terminate;
    return new Promise(() => {});
  };
  const ingress = f.owner.acquire(() => true),
    packet = ingress.receive(wire());
  assert.equal(await f.owner.release(ingress), false);
  assert.equal(f.owner.status, 'failed');
  assert.equal(f.calls.terminate, 1);
  assert.equal(borrowed[0], 9); // Backend still borrows the slot; timeout cannot wipe beneath it.
  submitted.resolve('accepted');
  assert.equal((await packet).result, 'unavailable');
  await tick();
  assert.equal(
    borrowed.every((v) => v === 0),
    true,
  );
  assert.equal(f.calls.reset, 0);
  assert.equal(f.calls.subscribe, 0);
});

test('microphone ownership: hanging reset or missing fresh epoch retires listener and late replies cannot revive capture', async () => {
  for (const hold of [true, false]) {
    const f = fixture(25),
      reset = deferred();
    f.backend.reset = () => {
      ++f.calls.reset;
      return hold ? reset.promise : Promise.resolve('scheduled');
    };
    const ingress = f.owner.acquire(() => true);
    await ingress.receive(wire());
    assert.equal(await f.owner.release(ingress), false);
    assert.equal(f.calls.terminate, 1);
    assert.equal(f.calls.unsubscribe, 1);
    f.publish({ epoch: 2n });
    reset.resolve('scheduled');
    await tick();
    assert.equal(f.owner.status, 'failed');
    assert.equal(
      f.owner.acquire(() => true),
      undefined,
    );
    assert.equal(await f.owner.close(), false);
  }
});
