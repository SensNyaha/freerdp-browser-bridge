import test from 'node:test';
import assert from 'node:assert/strict';
import { ClipboardOwnership } from '../../packages/node-bridge/dist/clipboard-ownership.js';
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture(retirementMs = 1000) {
  const state = {
    generation: 1n,
    revision: 1n,
    maximum: 1024,
    ready: true,
    toServer: true,
    fromServer: true,
    remoteText: true,
    localAccepted: false,
    localPending: false,
    remotePending: false,
  };
  const calls = { read: 0, write: 0, revoke: 0, terminate: 0 };
  const backend = {
    source: () => state,
    read: async () => {
      ++calls.read;
      return { status: 'accepted', text: Buffer.from('A\nЖ😀') };
    },
    write: async () => {
      ++calls.write;
      state.localAccepted = true;
      return 'accepted';
    },
    revoke: async () => {
      ++calls.revoke;
      state.localAccepted = false;
      return 'accepted';
    },
    terminate: () => {
      ++calls.terminate;
    },
  };
  return {
    state,
    calls,
    backend,
    owner: new ClipboardOwnership(backend, retirementMs),
  };
}

test('clipboard ownership: exclusive grant, empty release, stale lease immunity and permanent close', async () => {
  const f = fixture();
  const first = f.owner.acquire(() => true);
  assert.ok(first);
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
  assert.equal(f.calls.revoke, 0);
  assert.equal((await first.read(1n)).status, 'unavailable');
  const next = f.owner.acquire(() => true);
  assert.equal(await f.owner.release(first), false);
  assert.equal(f.owner.status, 'active');
  assert.equal(await f.owner.close(), true);
  assert.equal(f.owner.status, 'closed');
  assert.equal(await next.write(Buffer.from('A')), 'unavailable');
  assert.equal(
    f.owner.acquire(() => true),
    undefined,
  );
  assert.throws(() => new ClipboardOwnership(f.backend, 19));
  assert.throws(() => new ClipboardOwnership(f.backend, 15001));
  assert.throws(() => f.owner.acquire(null));
});
test('clipboard ownership: current policy and Unicode size refuse before backend dispatch', async () => {
  const f = fixture();
  f.state.maximum = 8;
  let authorized = false;
  const grant = f.owner.acquire(() => authorized);
  assert.equal(await grant.write(Buffer.from('A')), 'unavailable');
  authorized = true;
  for (const text of [
    Buffer.from([0xff]),
    Buffer.from([0]),
    Buffer.from('AAAA'),
    Buffer.from('\n\n'),
  ])
    assert.equal(await grant.write(text), 'invalid');
  assert.equal((await grant.read(0n)).status, 'invalid');
  assert.equal((await grant.read(2n)).status, 'stale');
  assert.equal(f.calls.write, 0);
  assert.equal(f.calls.read, 0);
  assert.equal(await grant.write(Buffer.from('Ж')), 'accepted');
  assert.equal(await f.owner.release(grant), true);
  for (const direction of ['toServer', 'fromServer']) {
    const oneWay = fixture();
    oneWay.state[direction] = false;
    if (direction === 'fromServer') oneWay.state.remoteText = false;
    const g = oneWay.owner.acquire(() => true);
    assert.equal(
      direction === 'toServer'
        ? await g.write(Buffer.from('A'))
        : (await g.read(1n)).status,
      'refused',
    );
    assert.equal(await oneWay.owner.close(), true);
  }
});
test('clipboard ownership: drain precedes revoke ACK, no late write grants a replacement', async () => {
  const f = fixture();
  const written = deferred(),
    revoked = deferred();
  let copied;
  f.backend.write = (text) => {
    ++f.calls.write;
    copied = Buffer.from(text);
    return written.promise;
  };
  f.backend.revoke = () => {
    ++f.calls.revoke;
    return revoked.promise;
  };
  const first = f.owner.acquire(() => true);
  const text = Buffer.from('synthetic');
  const write = first.write(text);
  assert.equal(await first.write(text), 'busy');
  assert.equal((await first.read(1n)).status, 'busy');
  const release = f.owner.release(first);
  assert.equal(f.owner.status, 'retiring');
  text.fill(0);
  assert.equal(copied.toString(), 'synthetic');
  await tick();
  assert.equal(f.calls.revoke, 0);
  f.state.localAccepted = true;
  written.resolve('accepted');
  assert.equal(await write, 'disconnected');
  await tick();
  assert.equal(f.calls.revoke, 1);
  assert.equal(
    f.owner.acquire(() => true),
    undefined,
  );
  f.state.localAccepted = false;
  revoked.resolve('accepted');
  assert.equal(await release, true);
  assert.equal(f.calls.revoke, 1);
  assert.ok(f.owner.acquire(() => true));
  assert.equal(await f.owner.close(), true);
  copied.fill(0);
});
test('clipboard ownership: stale/current read buffers are respectively wiped/transferred, never retained', async () => {
  for (const mode of ['offer', 'release', 'current']) {
    const f = fixture(),
      data = deferred();
    const text = Buffer.from('synthetic');
    f.backend.read = () => data.promise;
    const grant = f.owner.acquire(() => true);
    const read = grant.read(1n);
    let release;
    if (mode === 'offer') ++f.state.revision;
    if (mode === 'release') release = f.owner.release(grant);
    data.resolve({ status: 'accepted', text });
    const result = await read;
    assert.equal(
      result.status,
      mode === 'offer'
        ? 'stale'
        : mode === 'release'
          ? 'disconnected'
          : 'accepted',
    );
    if (mode === 'current') {
      assert.equal(result.text, text);
      assert.equal(result.text.toString(), 'synthetic');
      result.text.fill(0);
    } else {
      assert.equal(result.text.length, 0);
      assert.ok(text.every((b) => b === 0));
    }
    assert.equal(await (release ?? f.owner.close()), true);
    assert.equal(f.calls.revoke, 0);
  }
});
test('clipboard ownership: refusal, unchanged state and lost source make retirement fail permanently once', async () => {
  for (const mode of [
    'refused',
    'unchanged',
    'source',
    'generation',
    'quota',
    'backward',
  ]) {
    const f = fixture();
    const grant = f.owner.acquire(() => true);
    assert.equal(await grant.write(Buffer.from('A')), 'accepted');
    if (mode === 'refused') f.backend.revoke = async () => 'refused';
    if (mode === 'unchanged') f.backend.revoke = async () => 'accepted';
    if (mode === 'source') f.state.ready = false;
    if (mode === 'generation') ++f.state.generation;
    if (mode === 'quota') ++f.state.maximum;
    if (mode === 'backward') {
      f.state.revision = 0n;
      f.state.remoteText = false;
    }
    assert.equal(await f.owner.release(grant), false);
    assert.equal(f.owner.status, 'failed');
    assert.equal(
      f.owner.acquire(() => true),
      undefined,
    );
    assert.equal(await f.owner.close(), false);
    assert.equal(f.calls.terminate, 1);
  }
});
test('clipboard ownership: finite retirement, hanging termination and a late read cannot resurrect authority', async () => {
  const f = fixture(20),
    data = deferred();
  f.backend.read = () => data.promise;
  f.backend.terminate = () => {
    ++f.calls.terminate;
    return new Promise(() => {});
  };
  const grant = f.owner.acquire(() => true);
  const read = grant.read(1n);
  assert.equal(await f.owner.release(grant), false);
  assert.equal(f.owner.status, 'failed');
  const text = Buffer.from('late');
  data.resolve({ status: 'accepted', text });
  assert.equal((await read).status, 'disconnected');
  assert.ok(text.every((b) => b === 0));
  assert.equal(
    f.owner.acquire(() => true),
    undefined,
  );
  assert.equal(f.calls.terminate, 1);
});
test('clipboard ownership: backend faults and malformed read results never escape diagnostics or text', async () => {
  for (const mode of [
    'throw',
    'getter',
    'utf8',
    'quota',
    'negative',
    'closed',
  ]) {
    const f = fixture();
    const text =
      mode === 'utf8'
        ? Buffer.from([255])
        : Buffer.alloc(mode === 'quota' ? 1024 : 1, 65);
    f.backend.read = async () => {
      if (mode === 'closed') {
        f.state.ready = false;
        f.state.remoteText = false;
      }
      if (mode === 'throw')
        throw new Error('synthetic private host diagnostic');
      if (mode === 'getter')
        return {
          get status() {
            throw new Error('synthetic private getter');
          },
        };
      return { status: mode === 'negative' ? 'refused' : 'accepted', text };
    };
    const grant = f.owner.acquire(() => true);
    assert.deepEqual(await grant.read(1n), {
      status: 'disconnected',
      text: Buffer.alloc(0),
    });
    if (!['throw', 'getter'].includes(mode))
      assert.ok(text.every((b) => b === 0));
    assert.equal(f.owner.status, 'failed');
    assert.equal(f.calls.terminate, 1);
    if (mode === 'closed') {
      f.state.ready = true;
      f.state.remoteText = true;
      assert.equal((await grant.read(1n)).status, 'unavailable');
      assert.equal(f.calls.terminate, 1);
    }
  }
});
test('clipboard ownership: source and authorization reentrancy cannot issue work after revocation', async () => {
  const f = fixture();
  const source = f.backend.source;
  f.backend.source = () => {
    void f.owner.close();
    return source();
  };
  assert.equal(
    f.owner.acquire(() => true),
    undefined,
  );
  const g = fixture();
  let grant;
  grant = g.owner.acquire(() => {
    void g.owner.release(grant);
    return true;
  });
  assert.equal(await grant.write(Buffer.from('A')), 'unavailable');
  await tick();
  assert.equal(g.calls.write, 0);
  assert.equal(g.owner.status, 'idle');
});
