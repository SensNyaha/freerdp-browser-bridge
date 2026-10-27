import test from 'node:test';
import assert from 'node:assert/strict';
import { ClipboardOwnership } from '../../packages/node-bridge/dist/index.js';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const item = () => ({
  body: Buffer.from('<b>X</b>'),
  fragmentOffset: 0,
  fragmentBytes: 8,
  selectionOffset: 0,
  selectionBytes: 0,
  context: false,
  selection: false,
  text: Buffer.from('X'),
});
function fixture() {
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
    html: true,
    remoteHtml: true,
    localHtmlAccepted: false,
  };
  const calls = { read: 0, write: 0, revoke: 0, terminate: 0 };
  const backend = {
    source: () => state,
    read: async () => ({ status: 'accepted', text: Buffer.from('X') }),
    write: async () => {
      state.localAccepted = true;
      state.localHtmlAccepted = false;
      return 'accepted';
    },
    readHtml: async () => {
      ++calls.read;
      return { status: 'accepted', item: item() };
    },
    writeHtml: async () => {
      ++calls.write;
      state.localAccepted = true;
      state.localHtmlAccepted = true;
      return 'accepted';
    },
    revoke: async () => {
      ++calls.revoke;
      state.localAccepted = false;
      state.localHtmlAccepted = false;
      return 'accepted';
    },
    terminate: () => {
      ++calls.terminate;
    },
  };
  return { state, calls, backend, owner: new ClipboardOwnership(backend, 50) };
}
test('Public clipboard ownership refuses selected image state without complete image hooks', async () => {
  const f = fixture();
  Object.assign(f.state, {
    image: true,
    remoteImage: true,
    localImageAccepted: false,
  });
  assert.equal(
    f.owner.acquire(() => true),
    undefined,
  );
  assert.equal(f.calls.terminate, 1);
  assert.equal(f.calls.read, 0);
  assert.equal(f.calls.write, 0);
  await f.owner.close();
});

test('HTML ownership: exclusive shared flight drains write and both-format revoke before replacement', async () => {
  const f = fixture(),
    write = deferred(),
    revoke = deferred();
  f.backend.writeHtml = async () => {
    ++f.calls.write;
    const status = await write.promise;
    f.state.localAccepted = true;
    f.state.localHtmlAccepted = true;
    return status;
  };
  f.backend.revoke = async () => {
    ++f.calls.revoke;
    const status = await revoke.promise;
    f.state.localAccepted = false;
    f.state.localHtmlAccepted = false;
    return status;
  };
  const grant = f.owner.acquire(() => true);
  assert.ok(grant);
  const value = item(),
    copy = Buffer.from(value.body);
  const writing = grant.writeHtml(value);
  assert.equal((await grant.read(1n)).status, 'busy');
  assert.equal((await grant.readHtml(1n)).status, 'busy');
  assert.equal(await grant.write(Buffer.from('Y')), 'busy');
  const release = f.owner.release(grant);
  assert.equal(
    f.owner.acquire(() => true),
    undefined,
  );
  write.resolve('accepted');
  assert.equal(await writing, 'disconnected');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.calls.revoke, 1);
  assert.equal(
    f.owner.acquire(() => true),
    undefined,
  );
  revoke.resolve('accepted');
  assert.equal(await release, true);
  assert.deepEqual(value.body, copy);
  assert.ok(f.owner.acquire(() => true));
  await f.owner.close();
});
test('HTML ownership: accepted views keep content ownership but remove untrusted extra metadata', async () => {
  const f = fixture(),
    value = { ...item(), unexpected: 'private metadata canary' };
  f.backend.readHtml = async () => ({ status: 'accepted', item: value });
  const grant = f.owner.acquire(() => true),
    result = await grant.readHtml(1n);
  assert.equal(result.status, 'accepted');
  assert.equal(result.item.body, value.body);
  assert.equal(result.item.text, value.text);
  assert.equal(Object.hasOwn(result.item, 'unexpected'), false);
  assert.equal(await f.owner.release(grant), true);
  assert.equal(f.calls.revoke, 0);
  assert.equal(result.item.body.toString(), '<b>X</b>');
  result.item.body.fill(0);
  result.item.text.fill(0);
});
test('HTML ownership: stale, stopped and malformed rich results wipe both owned content views', async () => {
  for (const mode of [
    'stale',
    'release',
    'invalid',
    'negative-content',
    'policy',
  ]) {
    const f = fixture(),
      read = deferred(),
      value = item();
    f.backend.readHtml = () => read.promise;
    const grant = f.owner.acquire(() => true),
      reading = grant.readHtml(1n);
    let release;
    if (mode === 'stale') ++f.state.revision;
    if (mode === 'release') release = f.owner.release(grant);
    if (mode === 'invalid') value.fragmentOffset = 1;
    if (mode === 'policy') {
      delete f.state.html;
      delete f.state.remoteHtml;
      delete f.state.localHtmlAccepted;
    }
    read.resolve({
      status: mode === 'negative-content' ? 'refused' : 'accepted',
      item: value,
    });
    const result = await reading;
    assert.equal(result.status, mode === 'stale' ? 'stale' : 'disconnected');
    assert.equal(result.item, undefined);
    assert.ok(value.body.every((byte) => byte === 0));
    assert.ok(value.text.every((byte) => byte === 0));
    if (release) assert.equal(await release, true);
    await f.owner.close();
  }
});
test('HTML ownership: quota, context and direction refusal happen before any write dispatch', async () => {
  const f = fixture(),
    grant = f.owner.acquire(() => true);
  const value = item();
  f.state.maximum = 181;
  // Immutable policy changes are a fault rather than a smaller grant.
  assert.equal(await grant.writeHtml(value), 'unavailable');
  assert.equal(f.calls.write, 0);
  await f.owner.close();
  const small = fixture();
  small.state.maximum = 181;
  const current = small.owner.acquire(() => true);
  assert.equal(await current.writeHtml(value), 'invalid');
  assert.equal(small.calls.write, 0);
  assert.equal(await current.writeHtml({ ...value, context: true }), 'invalid');
  small.state.toServer = false;
  assert.equal(await current.writeHtml(value), 'unavailable');
  await small.owner.close();
});
test('HTML ownership: missing HTML hooks refuse acquisition and late data cannot revive timed-out retirement', async () => {
  const f = fixture();
  delete f.backend.readHtml;
  assert.equal(
    f.owner.acquire(() => true),
    undefined,
  );
  assert.equal(f.owner.status, 'failed');
  assert.equal(f.calls.terminate, 1);
  const other = fixture(),
    read = deferred(),
    value = item();
  other.backend.readHtml = () => read.promise;
  const owner = new ClipboardOwnership(other.backend, 20),
    grant = owner.acquire(() => true);
  const reading = grant.readHtml(1n);
  assert.equal(await owner.release(grant), false);
  assert.equal(
    owner.acquire(() => true),
    undefined,
  );
  read.resolve({ status: 'accepted', item: value });
  assert.deepEqual(await reading, { status: 'disconnected' });
  assert.ok(value.body.every((byte) => byte === 0));
  assert.ok(value.text.every((byte) => byte === 0));
  assert.equal(other.calls.terminate, 1);
});
