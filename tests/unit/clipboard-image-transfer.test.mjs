import test from 'node:test';
import assert from 'node:assert/strict';
import { ClipboardTransfer } from '../../packages/node-bridge/dist/index.js';
import {
  encodeClipboardImageItem,
  decodeClipboardImageItem,
  encodeClipboardChunk,
  decodeClipboardChunk,
} from '../../packages/protocol/dist/index.js';
import { imageItem } from '../fixtures/image-session-worker.mjs';
const tick = () => new Promise((done) => setImmediate(done));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { resolve, promise };
};
function fixture(maximum = 1024) {
  let now = 1,
    granted = false;
  const events = [],
    records = [],
    calls = { read: 0, write: 0, close: 0 };
  const state = {
    generation: 1n,
    revision: 1n,
    maximum,
    ready: true,
    toServer: true,
    fromServer: true,
    remoteText: true,
    localAccepted: false,
    localPending: false,
    remotePending: false,
    image: true,
    remoteImage: true,
    localImageAccepted: false,
  };
  const backend = {
    snapshot: () => ({ granted, retiring: false, state }),
    start: () => {
      granted = true;
      return true;
    },
    read: async () => ({ status: 'accepted', text: Buffer.from('X') }),
    write: async () => {
      ++calls.write;
      return 'accepted';
    },
    readImage: async () => {
      ++calls.read;
      return { status: 'accepted', item: imageItem() };
    },
    writeImage: async () => {
      ++calls.write;
      return 'accepted';
    },
  };
  const transfer = new ClipboardTransfer(
    backend,
    {
      control: (type, data) => events.push({ type, data }),
      chunk: async (b) => records.push(Buffer.from(b)),
      close: () => {
        ++calls.close;
      },
      changed: () => {},
    },
    () => now,
  );
  return {
    state,
    backend,
    transfer,
    events,
    records,
    calls,
    set now(value) {
      now = value;
    },
  };
}
test('Image transfer: exact upload borrows checked pixels until synchronous copy and shares text flight', async () => {
  const f = fixture(),
    native = deferred();
  let borrowed, copied;
  f.backend.writeImage = (item) => {
    ++f.calls.write;
    borrowed = item.rgba;
    copied = Buffer.from(item.rgba);
    return native.promise;
  };
  const encoded = encodeClipboardImageItem(imageItem());
  f.transfer.set(1, 1n, encoded.length, 'image');
  assert.equal(f.events[0].type, 'clipboard.image.set.ready');
  f.transfer.receive(
    encodeClipboardChunk({ requestSeq: 1, offset: 0, bytes: encoded }),
  );
  assert.deepEqual(copied, imageItem().rgba);
  assert.ok(borrowed.every((b) => b === 0));
  assert.deepEqual(decodeClipboardImageItem(encoded), imageItem());
  f.transfer.read(2, 1n, 1n);
  assert.equal(f.events.at(-1).data.status, 'busy');
  native.resolve('accepted');
  await tick();
  assert.equal(f.events.at(-1).type, 'clipboard.image.set.result');
  assert.equal(f.transfer.busy, false);
});
test('Image transfer: checked download owns encoded bytes and wipes backend pixels before final ACK', async () => {
  const f = fixture(),
    item = imageItem();
  f.backend.readImage = async () => ({ status: 'accepted', item });
  f.transfer.read(7, 1n, 1n, 'image');
  await tick();
  assert.equal(f.events[0].type, 'clipboard.image.data');
  assert.equal(f.events[0].data.bytes, 24);
  assert.ok(item.rgba.every((b) => b === 0));
  assert.deepEqual(
    decodeClipboardImageItem(decodeClipboardChunk(f.records[0]).bytes),
    imageItem(),
  );
  assert.equal(
    f.events.some((e) => e.type === 'clipboard.image.data.complete'),
    false,
  );
  f.transfer.acknowledge(7, 24);
  await tick();
  assert.equal(f.events.at(-1).type, 'clipboard.image.data.complete');
  assert.equal(f.transfer.busy, false);
});
test('Image transfer: image selection header geometry and native DIB quota reject atomically before dispatch', async () => {
  const f = fixture(131);
  f.transfer.set(1, 1n, 147 + 1, 'image');
  assert.equal(f.events[0].data.status, 'refused');
  f.transfer.set(2, 1n, 15, 'image');
  assert.equal(f.events.at(-1).data.status, 'invalid');
  const item = encodeClipboardImageItem(imageItem());
  f.transfer.set(3, 1n, item.length, 'image');
  f.transfer.receive(
    encodeClipboardChunk({ requestSeq: 3, offset: 0, bytes: item }),
  );
  assert.equal(f.events.at(-1).data.status, 'invalid');
  assert.equal(f.calls.write, 0);
  delete f.state.image;
  delete f.state.remoteImage;
  delete f.state.localImageAccepted;
  f.transfer.read(4, 1n, 1n, 'image');
  assert.equal(f.events.at(-1).data.status, 'unavailable');
  assert.equal(f.calls.read, 0);
  const good = fixture(132);
  good.transfer.set(5, 1n, item.length, 'image');
  good.transfer.receive(
    encodeClipboardChunk({ requestSeq: 5, offset: 0, bytes: item }),
  );
  await tick();
  assert.equal(good.calls.write, 1);
  assert.equal(good.events.at(-1).data.status, 'accepted');
});
test('Image transfer: invalid inner raster preserves a fresh operation and never becomes Unicode', async () => {
  const f = fixture(),
    invalid = encodeClipboardImageItem(imageItem());
  invalid.writeUInt32BE(0, 4);
  f.transfer.set(1, 1n, invalid.length, 'image');
  f.transfer.receive(
    encodeClipboardChunk({ requestSeq: 1, offset: 0, bytes: invalid }),
  );
  assert.equal(f.events.at(-1).data.status, 'invalid');
  assert.equal(f.calls.write, 0);
  const good = encodeClipboardImageItem(imageItem());
  f.transfer.set(2, 1n, good.length, 'image');
  f.transfer.receive(
    encodeClipboardChunk({ requestSeq: 2, offset: 0, bytes: good }),
  );
  await tick();
  assert.equal(f.calls.write, 1);
  assert.equal(f.calls.close, 0);
});
test('Image transfer: expired closed stale and negative results wipe pixels without sending chunks', async () => {
  for (const mode of ['expired', 'closed', 'stale', 'negative', 'quota']) {
    const f = fixture(),
      pending = deferred(),
      item = imageItem();
    f.backend.readImage = () => pending.promise;
    f.transfer.read(1, 1n, 1n, 'image');
    if (mode === 'expired') {
      f.now = 8001;
      f.transfer.service();
    }
    if (mode === 'closed') f.transfer.dispose();
    if (mode === 'stale') ++f.state.revision;
    if (mode === 'quota') {
      item.width = 257;
      item.rgba = Buffer.alloc(1028, 65);
    }
    pending.resolve({
      status: mode === 'negative' ? 'refused' : 'accepted',
      item,
    });
    await tick();
    assert.equal(f.records.length, 0);
    assert.ok(item.rgba.every((b) => b === 0));
    if (mode === 'stale') assert.equal(f.events.at(-1).data.status, 'stale');
  }
});
test('Image transfer: policy loss wrong ACK and missing hooks cannot retain transfer authority', async () => {
  const f = fixture();
  f.transfer.read(1, 1n, 1n, 'image');
  await tick();
  f.transfer.acknowledge(2, 24);
  assert.equal(f.calls.close, 1);
  const g = fixture();
  g.transfer.set(1, 1n, 24, 'image');
  delete g.state.image;
  g.transfer.service();
  assert.equal(g.calls.close, 1);
  const h = fixture();
  delete h.backend.readImage;
  h.transfer.read(1, 1n, 1n, 'image');
  assert.equal(h.events.at(-1).data.status, 'unavailable');
  assert.equal(h.calls.read, 0);
});
