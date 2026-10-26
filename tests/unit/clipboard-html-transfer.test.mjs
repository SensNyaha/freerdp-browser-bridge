import test from 'node:test';
import assert from 'node:assert/strict';
import { ClipboardTransfer } from '../../packages/node-bridge/dist/index.js';
import {
  encodeClipboardHtmlItem,
  decodeClipboardChunk,
  encodeClipboardChunk,
  decodeClipboardHtmlItem,
} from '../../packages/protocol/dist/index.js';
const tick = () => new Promise((done) => setImmediate(done));
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
    html: true,
    remoteHtml: true,
    localHtmlAccepted: false,
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
    readHtml: async () => {
      ++calls.read;
      return { status: 'accepted', item: item() };
    },
    writeHtml: async () => {
      ++calls.write;
      return 'accepted';
    },
  };
  const transfer = new ClipboardTransfer(
    backend,
    {
      control: (type, data) => events.push({ type, data }),
      chunk: async (bytes) => records.push(Buffer.from(bytes)),
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
test('HTML transfer: upload copies borrowed views before wiping the encoded item and waits for native completion', async () => {
  const f = fixture(),
    native = deferred();
  let borrowed, copied;
  f.backend.writeHtml = (value) => {
    ++f.calls.write;
    borrowed = value;
    copied = Buffer.from(value.body);
    return native.promise;
  };
  const encoded = encodeClipboardHtmlItem(item());
  f.transfer.set(1, 1n, encoded.length, 'html');
  assert.equal(f.events[0].type, 'clipboard.html.set.ready');
  f.transfer.receive(
    encodeClipboardChunk({ requestSeq: 1, offset: 0, bytes: encoded }),
  );
  assert.equal(f.calls.write, 1);
  assert.equal(copied.toString(), '<b>X</b>');
  assert.ok(borrowed.body.every((byte) => byte === 0));
  assert.ok(borrowed.text.every((byte) => byte === 0));
  f.transfer.read(2, 1n, 1n);
  assert.equal(f.events.at(-1).type, 'clipboard.data');
  assert.equal(f.events.at(-1).data.status, 'busy');
  native.resolve('accepted');
  await tick();
  assert.equal(f.events.at(-1).type, 'clipboard.html.set.result');
  assert.equal(f.events.at(-1).data.status, 'accepted');
  assert.equal(f.transfer.busy, false);
});
test('HTML transfer: read sends one checked item with shared ACK and wipes backend content before exposing completion', async () => {
  const f = fixture(),
    value = item();
  f.backend.readHtml = async () => ({ status: 'accepted', item: value });
  f.transfer.read(3, 1n, 1n, 'html');
  await tick();
  const meta = f.events[0];
  assert.equal(meta.type, 'clipboard.html.data');
  assert.equal(meta.data.bytes, 41);
  assert.ok(value.body.every((byte) => byte === 0));
  assert.ok(value.text.every((byte) => byte === 0));
  const chunk = decodeClipboardChunk(f.records[0]);
  assert.equal(
    decodeClipboardHtmlItem(chunk.bytes).body.toString(),
    '<b>X</b>',
  );
  f.transfer.acknowledge(3, 41);
  await tick();
  assert.equal(f.events.at(-1).type, 'clipboard.html.data.complete');
  assert.equal(f.transfer.busy, false);
});
test('HTML transfer: explicit format selection and item-plus-header budget precede allocation and backend dispatch', () => {
  const f = fixture(1024);
  f.transfer.set(1, 1n, 1057, 'html');
  assert.equal(f.events[0].data.status, 'refused');
  assert.equal(f.transfer.busy, false);
  delete f.state.html;
  delete f.state.remoteHtml;
  delete f.state.localHtmlAccepted;
  f.transfer.read(2, 1n, 1n, 'html');
  assert.equal(f.events.at(-1).data.status, 'unavailable');
  assert.equal(f.calls.read, 0);
});
test('HTML transfer: native pair has a finite 13-second ceiling and discards a late complete item', async () => {
  const f = fixture(),
    pending = deferred(),
    value = item();
  f.backend.readHtml = () => pending.promise;
  f.transfer.read(1, 1n, 1n, 'html');
  f.now = 9000;
  f.transfer.service();
  assert.equal(f.calls.close, 0);
  f.now = 13001;
  f.transfer.service();
  assert.equal(f.calls.close, 1);
  pending.resolve({ status: 'accepted', item: value });
  await tick();
  assert.ok(value.body.every((byte) => byte === 0));
  assert.ok(value.text.every((byte) => byte === 0));
  assert.equal(f.records.length, 0);
});
