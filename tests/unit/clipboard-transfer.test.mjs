import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ClipboardTransfer } from '../../packages/node-bridge/dist/index.js';
import {
  encodeClipboardChunk,
  decodeClipboardChunk,
} from '../../packages/protocol/dist/index.js';
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const hash = (b) => createHash('sha256').update(b).digest('hex');
function fixture(maximum = 65536) {
  let now = 1,
    granted = false;
  const source = {
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
  };
  const calls = { read: 0, write: 0, close: 0 },
    events = [],
    records = [],
    borrowed = [];
  let readText = Buffer.from('Ж😀'),
    written;
  const backend = {
    snapshot: () => ({ state: { ...source }, granted, retiring: false }),
    start: () => {
      granted = true;
      return true;
    },
    read: async () => {
      ++calls.read;
      return { status: 'accepted', text: readText };
    },
    write: async (bytes) => {
      ++calls.write;
      written = Buffer.from(bytes);
      source.localAccepted = true;
      return 'accepted';
    },
  };
  const transport = {
    control: (type, data) => events.push({ type, data }),
    chunk: async (bytes) => {
      records.push(Buffer.from(bytes));
      borrowed.push(bytes);
    },
    close: () => {
      ++calls.close;
    },
    changed: () => {},
  };
  const transfer = new ClipboardTransfer(backend, transport, () => now);
  return {
    transfer,
    backend,
    transport,
    calls,
    source,
    events,
    records,
    borrowed,
    get now() {
      return now;
    },
    set now(value) {
      now = value;
    },
    get readText() {
      return readText;
    },
    set readText(bytes) {
      readText = bytes;
    },
    get written() {
      return written;
    },
    set granted(value) {
      granted = value;
    },
  };
}
test('clipboard transfer: upload admits exact blocks, copies one item and emits result only after native ACK', async () => {
  const f = fixture(100000),
    native = deferred();
  let copied, borrowed;
  f.backend.write = (bytes) => {
    ++f.calls.write;
    copied = Buffer.from(bytes);
    borrowed = bytes;
    return native.promise;
  };
  const value = Buffer.alloc(40000, 65);
  f.transfer.set(3, 1n, value.length);
  assert.equal(f.events[0].type, 'clipboard.set.ready');
  assert.equal(f.events[0].data.creditEnd, 32608);
  f.transfer.read(4, 1n, 1n);
  assert.equal(f.events.at(-1).data.status, 'busy');
  for (let offset = 0; offset < value.length; offset += 4076) {
    const end = Math.min(value.length, offset + 4076);
    f.transfer.receive(
      encodeClipboardChunk({
        requestSeq: 3,
        offset,
        bytes: value.subarray(offset, end),
      }),
    );
  }
  assert.equal(f.calls.write, 1);
  assert.equal(hash(copied), hash(value));
  assert.ok(borrowed.every((b) => b === 0));
  assert.equal(
    f.events.some((e) => e.type === 'clipboard.set.result'),
    false,
  );
  assert.equal(f.transfer.busy, true);
  native.resolve('accepted');
  await tick();
  assert.equal(f.events.at(-1).type, 'clipboard.set.result');
  assert.equal(f.events.at(-1).data.status, 'accepted');
  assert.equal(f.transfer.busy, false);
  copied.fill(0);
  value.fill(0);
});
test('clipboard transfer: malformed offsets, correlation, chunk sizes and metadata never reach native', () => {
  for (const mode of ['sequence', 'offset', 'short', 'extra', 'header']) {
    const f = fixture();
    f.transfer.set(7, 1n, 5000);
    const bytes = encodeClipboardChunk({
      requestSeq: mode === 'sequence' ? 8 : 7,
      offset: mode === 'offset' ? 1 : 0,
      bytes: Buffer.alloc(mode === 'short' ? 10 : 4076, 65),
    });
    if (mode === 'header') bytes[0] = 0;
    f.transfer.receive(
      mode === 'extra' ? Buffer.concat([bytes, Buffer.of(1)]) : bytes,
    );
    assert.equal(f.calls.close, 1);
    assert.equal(f.calls.write, 0);
    assert.equal(f.transfer.busy, false);
  }
  const f = fixture(1024);
  f.transfer.set(1, 1n, 1025);
  assert.equal(f.events.at(-1).data.status, 'refused');
  assert.equal(f.calls.write, 0);
  f.transfer.set(2, 2n, 10);
  assert.equal(f.events.at(-1).data.status, 'stale');
  f.transfer.set(3, 1n, 16777217);
  assert.equal(f.calls.close, 1);
});
test('clipboard transfer: invalid complete UTF8 refuses atomically and empty Unicode is a complete native item', async () => {
  const f = fixture();
  f.transfer.set(0, 1n, 2);
  f.transfer.receive(
    encodeClipboardChunk({
      requestSeq: 0,
      offset: 0,
      bytes: Buffer.from([0xc0, 0xaf]),
    }),
  );
  assert.equal(f.events.at(-1).data.status, 'invalid');
  assert.equal(f.calls.write, 0);
  assert.equal(f.calls.close, 0);
  f.transfer.set(1, 1n, 0);
  await tick();
  assert.equal(f.calls.write, 1);
  assert.equal(f.written.length, 0);
  assert.equal(f.events.at(-1).data.status, 'accepted');
});
test('clipboard transfer: download holds eight-record credit, paces the next window and freezes the accepted read', async () => {
  const f = fixture(100000);
  f.readText = Buffer.alloc(40000, 65);
  const expected = hash(f.readText);
  f.transfer.read(9, 1n, 1n);
  await tick();
  assert.equal(f.records.length, 8);
  assert.equal(f.events[0].type, 'clipboard.data');
  assert.equal(f.events[0].data.creditEnd, 32608);
  assert.ok(f.borrowed.every((bytes) => bytes.every((b) => b === 0)));
  assert.equal(
    f.events.some((e) => e.type === 'clipboard.data.complete'),
    false,
  );
  f.source.revision = 2n; // A completed native read remains its explicitly requested snapshot.
  f.transfer.acknowledge(9, 32608);
  f.transfer.service();
  await tick();
  assert.equal(f.records.length, 8);
  f.now = 65;
  f.transfer.service();
  await tick();
  assert.equal(f.records.length, 10);
  f.transfer.acknowledge(9, 40000);
  assert.equal(f.events.at(-1).type, 'clipboard.data.complete');
  assert.equal(f.events.at(-1).data.status, 'accepted');
  assert.ok(f.readText.every((b) => b === 0));
  const assembled = Buffer.concat(
    f.records.map((record) => decodeClipboardChunk(record).bytes),
  );
  assert.equal(hash(assembled), expected);
  assert.equal(f.calls.close, 0);
  assembled.fill(0);
  const changed = fixture(),
    data = deferred(),
    stale = Buffer.from('old snapshot');
  changed.backend.read = () => data.promise;
  changed.transfer.read(1, 1n, 1n);
  changed.source.revision = 2n;
  data.resolve({ status: 'accepted', text: stale });
  await tick();
  assert.equal(changed.events.at(-1).type, 'clipboard.data');
  assert.equal(changed.events.at(-1).data.status, 'stale');
  assert.equal(changed.records.length, 0);
  assert.ok(stale.every((b) => b === 0));
});
test('clipboard transfer: early/wrong/duplicate ACKs cannot grant credit and empty reads still require one ACK', async () => {
  for (const mode of ['early', 'sequence', 'offset', 'duplicate']) {
    const f = fixture(100000),
      held = deferred();
    f.readText = Buffer.alloc(40000, 65);
    if (mode === 'early') f.transport.chunk = () => held.promise;
    f.transfer.read(10, 1n, 1n);
    await tick();
    f.transfer.acknowledge(
      mode === 'sequence' ? 11 : 10,
      mode === 'offset' ? 1 : 32608,
    );
    if (mode === 'duplicate') f.transfer.acknowledge(10, 32608);
    assert.equal(f.calls.close, 1);
    assert.ok(f.readText.every((b) => b === 0));
    held.resolve();
    await tick();
  }
  const f = fixture();
  f.readText = Buffer.alloc(0);
  f.transfer.read(0, 1n, 1n);
  await tick();
  assert.equal(f.transfer.busy, true);
  assert.equal(f.records.length, 0);
  f.transfer.acknowledge(0, 0);
  assert.equal(f.transfer.busy, false);
  assert.equal(f.events.at(-1).data.status, 'accepted');
});
test('clipboard transfer: independent progress/whole/native deadlines and clock regression do not renew on traffic', async () => {
  const upload = fixture(16777216);
  upload.transfer.set(1, 1n, 16777216);
  let offset = 0;
  for (let window = 0; window < 32; ++window) {
    upload.now += 1900;
    for (let n = 0; n < 8 && !upload.calls.close; ++n) {
      upload.transfer.receive(
        encodeClipboardChunk({
          requestSeq: 1,
          offset,
          bytes: Buffer.alloc(4076, 65),
        }),
      );
      offset += 4076;
    }
  }
  assert.equal(upload.calls.close, 1);
  assert.equal(upload.calls.write, 0);
  const idle = fixture();
  idle.transfer.set(1, 1n, 5000);
  idle.now = 2001;
  idle.transfer.service();
  assert.equal(idle.calls.close, 1);
  const backward = fixture();
  backward.transfer.set(1, 1n, 5000);
  backward.now = 0;
  backward.transfer.service();
  assert.equal(backward.calls.close, 1);
  const native = fixture(),
    data = deferred();
  native.backend.read = () => data.promise;
  native.transfer.read(1, 1n, 1n);
  native.now = 8001;
  native.transfer.service();
  const text = Buffer.from('late');
  data.resolve({ status: 'accepted', text });
  await tick();
  assert.equal(native.calls.close, 1);
  assert.ok(text.every((b) => b === 0));
  assert.equal(native.records.length, 0);
});
test('clipboard transfer: dispose/late send callback retain only its borrowed chunk and never finish after expiry', async () => {
  for (const mode of ['dispose', 'expired', 'accepted']) {
    const f = fixture(),
      sent = deferred();
    let borrowed;
    f.transport.chunk = (bytes) => {
      borrowed = bytes;
      return sent.promise;
    };
    f.transfer.read(1, 1n, 1n);
    await tick();
    f.transfer.acknowledge(1, f.readText.length);
    assert.equal(
      f.events.some((e) => e.type === 'clipboard.data.complete'),
      false,
    );
    if (mode === 'dispose') f.transfer.dispose();
    if (mode === 'expired') f.now = 2001;
    assert.equal(borrowed[0], 0x52);
    sent.resolve();
    await tick();
    assert.ok(borrowed.every((b) => b === 0));
    assert.ok(f.readText.every((b) => b === 0));
    assert.equal(
      f.events.some((e) => e.type === 'clipboard.data.complete'),
      mode === 'accepted',
    );
    assert.equal(f.calls.close, mode === 'expired' ? 1 : 0);
  }
});
test('clipboard transfer: full 16 MiB both ways uses bounded windows and byte-exact cross-scalar chunks', async () => {
  const f = fixture(16777216),
    destination = Buffer.alloc(16777216);
  f.readText = Buffer.alloc(16777216, 65);
  f.readText.fill(Buffer.from('界'), 0, 16777215);
  const expected = hash(f.readText);
  f.transfer.read(0xffffffff, 1n, 1n);
  let count = 0,
    offset = 0;
  while (f.transfer.busy) {
    await tick();
    assert.ok(f.records.length >= 1 && f.records.length <= 8);
    for (const record of f.records.splice(0)) {
      const chunk = decodeClipboardChunk(record);
      assert.equal(chunk.offset, offset);
      chunk.bytes.copy(destination, offset);
      offset += chunk.bytes.length;
      ++count;
      record.fill(0);
    }
    f.borrowed.length = 0;
    f.transfer.acknowledge(0xffffffff, offset);
    f.now += 64;
    f.transfer.service();
  }
  assert.equal(count, 4117);
  assert.equal(offset, destination.length);
  assert.equal(hash(destination), expected);
  assert.ok(f.readText.every((b) => b === 0));
  const upload = fixture(16777216);
  upload.transfer.set(1, 1n, destination.length);
  for (let start = 0, records = 0; start < destination.length; ++records) {
    const end = Math.min(destination.length, start + 4076);
    upload.transfer.receive(
      encodeClipboardChunk({
        requestSeq: 1,
        offset: start,
        bytes: destination.subarray(start, end),
      }),
    );
    start = end;
    if (records % 8 === 7) upload.now += 64;
  }
  await tick();
  assert.equal(upload.calls.write, 1);
  assert.equal(upload.events.at(-1).data.status, 'accepted');
  assert.equal(hash(upload.written), expected);
  upload.written.fill(0);
  destination.fill(0);
});
