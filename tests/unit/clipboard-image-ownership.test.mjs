import test from 'node:test';
import assert from 'node:assert/strict';
import { ClipboardOwnership } from '../../packages/node-bridge/dist/index.js';
import {
  ImageSessionWorker,
  imageItem,
} from '../fixtures/image-session-worker.mjs';
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { resolve, promise };
};
const turn = () => new Promise((resolve) => setImmediate(resolve));
function fixture() {
  const worker = new ImageSessionWorker();
  let terminated = 0;
  const backend = {
    source: () => worker.source,
    read: () => worker.readClipboardText(),
    write: (b) => worker.writeClipboardText(b),
    readImage: () => worker.readClipboardImage(),
    writeImage: (i) => worker.writeClipboardImage(i),
    readHtml: () => worker.readClipboardHtml(),
    writeHtml: (i) => worker.writeClipboardHtml(i),
    revoke: () => worker.revokeClipboardText(),
    terminate: () => {
      ++terminated;
    },
  };
  return {
    worker,
    backend,
    owner: new ClipboardOwnership(backend, 50),
    terminated: () => terminated,
  };
}
test('Image ownership: checked owned pixels retain only known fields and read-only retirement never revokes', async () => {
  const f = fixture(),
    item = { ...imageItem(), privateCanary: 'never metadata' };
  f.backend.readImage = async () => ({ status: 'accepted', item });
  const grant = f.owner.acquire(() => true),
    result = await grant.readImage(1n);
  assert.equal(result.item.rgba, item.rgba);
  assert.equal(Object.hasOwn(result.item, 'privateCanary'), false);
  assert.deepEqual(Object.keys(result.item).sort(), [
    'height',
    'rgba',
    'width',
  ]);
  assert.equal(await f.owner.release(grant), true);
  assert.equal(f.worker.revokes, 0);
  assert.deepEqual(result.item.rgba, imageItem().rgba);
  result.item.rgba.fill(0);
});
test('Image ownership: one text HTML image flight drains write and shared revoke before replacement', async () => {
  const f = fixture();
  Object.assign(f.worker.source, {
    html: true,
    remoteHtml: true,
    localHtmlAccepted: false,
  });
  const write = deferred(),
    revoke = deferred();
  f.worker.writeGate = write.promise;
  f.worker.revokeGate = revoke.promise;
  const grant = f.owner.acquire(() => true),
    item = imageItem(),
    original = Buffer.from(item.rgba),
    pending = grant.writeImage(item);
  assert.equal((await grant.read(1n)).status, 'busy');
  assert.equal((await grant.readHtml(1n)).status, 'busy');
  assert.equal((await grant.readImage(1n)).status, 'busy');
  const release = f.owner.release(grant);
  assert.equal(
    f.owner.acquire(() => true),
    undefined,
  );
  write.resolve();
  assert.equal(await pending, 'disconnected');
  await turn();
  assert.equal(f.worker.revokes, 1);
  assert.equal(
    f.owner.acquire(() => true),
    undefined,
  );
  revoke.resolve();
  assert.equal(await release, true);
  assert.deepEqual(item.rgba, original);
  assert.ok(f.worker.written.rgba.every((b) => b === 0));
  assert.ok(f.owner.acquire(() => true));
  await f.owner.close();
});
test('Image ownership: stale detached invalid negative and downgraded reads wipe returned pixels', async () => {
  for (const mode of [
    'stale',
    'detach',
    'invalid',
    'negative',
    'policy',
    'quota',
  ]) {
    const f = fixture(),
      read = deferred(),
      item = imageItem();
    f.backend.readImage = () => read.promise;
    const grant = f.owner.acquire(() => true),
      pending = grant.readImage(1n);
    let release;
    if (mode === 'stale') ++f.worker.source.revision;
    if (mode === 'detach') release = f.owner.release(grant);
    if (mode === 'invalid') item.width = 1;
    if (mode === 'quota') {
      item.width = 257;
      item.rgba = Buffer.alloc(1028, 65);
    }
    if (mode === 'policy') {
      delete f.worker.source.image;
      delete f.worker.source.remoteImage;
      delete f.worker.source.localImageAccepted;
    }
    read.resolve({
      status: mode === 'negative' ? 'refused' : 'accepted',
      item,
    });
    const result = await pending;
    assert.equal(result.status, mode === 'stale' ? 'stale' : 'disconnected');
    assert.equal(result.item, undefined);
    assert.ok(item.rgba.every((b) => b === 0));
    if (release) assert.equal(await release, true);
    await f.owner.close();
  }
});
test('Image ownership: exact native quota and direction refuse before write dispatch and preserve caller pixels', async () => {
  for (const [maximum, toServer, expected] of [
    [131, true, 'invalid'],
    [132, true, 'accepted'],
    [1024, false, 'refused'],
  ]) {
    const f = fixture();
    Object.assign(f.worker.source, { maximum, toServer });
    const grant = f.owner.acquire(() => true),
      item = imageItem();
    assert.equal(await grant.writeImage(item), expected);
    assert.equal(f.worker.writes, expected === 'accepted' ? 1 : 0);
    assert.deepEqual(item, imageItem());
    await f.owner.close();
  }
});
test('Image ownership: complete hooks policy and observed local format are mandatory', async () => {
  for (const missing of ['readImage', 'writeImage']) {
    const f = fixture();
    delete f.backend[missing];
    assert.equal(
      f.owner.acquire(() => true),
      undefined,
    );
    assert.equal(f.terminated(), 1);
  }
  const f = fixture();
  f.backend.writeImage = async () => {
    f.worker.source.localAccepted = true;
    return 'accepted';
  };
  const grant = f.owner.acquire(() => true);
  assert.equal(await grant.writeImage(imageItem()), 'disconnected');
  assert.equal(f.terminated(), 1);
  await f.owner.close();
  const g = fixture();
  Object.assign(g.worker.source, {
    html: true,
    remoteHtml: true,
    localHtmlAccepted: false,
  });
  g.backend.write = async () => {
    g.worker.source.localAccepted = true;
    g.worker.source.localImageAccepted = true;
    return 'accepted';
  };
  const current = g.owner.acquire(() => true);
  assert.equal(await current.write(Buffer.from('X')), 'disconnected');
  assert.equal(g.terminated(), 1);
  await g.owner.close();
});
test('Image ownership: late result after bounded retirement is wiped and cannot restore authority', async () => {
  const f = fixture(),
    read = deferred(),
    item = imageItem();
  f.backend.readImage = () => read.promise;
  const owner = new ClipboardOwnership(f.backend, 20),
    grant = owner.acquire(() => true),
    pending = grant.readImage(1n);
  assert.equal(await owner.release(grant), false);
  assert.equal(
    owner.acquire(() => true),
    undefined,
  );
  read.resolve({ status: 'accepted', item });
  assert.deepEqual(await pending, { status: 'disconnected' });
  assert.ok(item.rgba.every((b) => b === 0));
  assert.equal(f.terminated(), 1);
});
