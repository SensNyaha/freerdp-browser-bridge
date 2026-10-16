import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ClipboardClient } from '../../apps/reference-harness/clipboard-client.js';
import {
  measureClipboardText,
  encodeClipboardText,
  decodeClipboardText,
} from '../../apps/reference-harness/clipboard-text.js';
import { ClipboardTransfer } from '../../packages/node-bridge/dist/index.js';
import { encodeClipboardChunk } from '../../packages/protocol/dist/index.js';
const windowBytes = 4076 * 8;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function fixture(maximum = 1048576) {
  const f = {
    time: 0,
    seq: 0,
    tasks: [],
    frames: [],
    windows: [],
    closed: 0,
    queued: 0,
    written: undefined,
    readText: Buffer.from('remote\nЖ😀'),
    readBuffer: undefined,
    granted: false,
  };
  f.state = {
    ready: true,
    generation: 1n,
    revision: 1n,
    maximum,
    toServer: true,
    fromServer: true,
    remoteText: true,
    localAccepted: false,
    localPending: false,
    remotePending: false,
  };
  f.offer = (patch) => {
    Object.assign(f.state, patch);
    f.client.offer({
      protocol: 'RWC1',
      version: 1,
      chunkBytes: 4076,
      window: 8,
      granted: f.granted,
      retiring: false,
      state: {
        ...f.state,
        generation: String(f.state.generation),
        revision: String(f.state.revision),
      },
    });
  };
  f.client = new ClipboardClient(
    {
      authorized: () => true,
      bufferedAmount: () => f.queued,
      changed: () => {},
      failed: () => ++f.closed,
      sendControl: (type, data) => {
        const seq = f.seq++;
        f.tasks.push(() =>
          type === 'clipboard.set'
            ? f.server.set(seq, BigInt(data.generation), data.bytes)
            : type === 'clipboard.request'
              ? f.server.read(
                  seq,
                  BigInt(data.generation),
                  BigInt(data.revision),
                )
              : f.server.acknowledge(data.requestSeq, data.offset),
        );
        return seq;
      },
      sendBinary: (frame) => {
        assert.ok(f.client.active.frames.length <= 8);
        f.frames.push(frame);
        const bytes = Buffer.from(new Uint8Array(frame));
        if (bytes.readUInt32BE(12) % windowBytes === 0) f.windows.push(f.time);
        f.tasks.push(() => {
          f.server.receive(bytes);
          bytes.fill(0);
        });
        return true;
      },
    },
    () => f.time,
  );
  f.server = new ClipboardTransfer(
    {
      snapshot: () => ({ state: f.state, granted: f.granted, retiring: false }),
      start: () => {
        f.granted = true;
        f.offer();
        return true;
      },
      read: async () => {
        f.readBuffer = Buffer.from(f.readText);
        return { status: 'accepted', text: f.readBuffer };
      },
      write: (bytes) => {
        f.written = Buffer.from(bytes);
        return Promise.resolve('accepted');
      },
    },
    {
      control: (type, data) => f.tasks.push(() => f.client.message(type, data)),
      chunk: (bytes) =>
        new Promise((resolve) =>
          f.tasks.push(() => {
            f.client.binary(Uint8Array.from(bytes).buffer);
            resolve();
          }),
        ),
      close: () => ++f.closed,
      changed: () => {},
    },
    () => f.time,
  );
  f.flush = async () => {
    for (let n = 0; n < 1000; ++n) {
      while (f.tasks.length) f.tasks.shift()();
      await Promise.resolve();
      if (!f.tasks.length) {
        await Promise.resolve();
        if (!f.tasks.length) return;
      }
    }
    throw new Error('Fixture work limit');
  };
  f.drive = async (promise) => {
    let result;
    promise.then((value) => {
      result = value;
    });
    for (let n = 0; n < 1100 && result === undefined; ++n) {
      f.client.service();
      f.server.service();
      await f.flush();
      if (result === undefined) f.time += 64;
    }
    assert.notEqual(result, undefined);
    return result;
  };
  f.offer();
  return f;
}

test('browser clipboard text: scalar validation, independent UTF8/UTF16 quotas, CRLF and preserved BOM', () => {
  for (const [text, maximum] of [
    ['', 2],
    ['A', 4],
    ['\n', 6],
    ['\r\n', 6],
    ['\r\r\n', 10],
    ['Ж😀', 8],
    ['\ufeffA', 6],
  ]) {
    const bytes = encodeClipboardText(text, maximum);
    assert.equal(bytes.length, measureClipboardText(text, maximum));
    assert.equal(decodeClipboardText(bytes, maximum), text);
    assert.throws(() => encodeClipboardText(text, maximum - 1));
    bytes.fill(0);
  }
  for (const text of [
    '\0',
    'A\0B',
    '\ud800',
    '\udc00',
    '\ud800A',
    '\ud800\ud800',
  ])
    assert.throws(() => encodeClipboardText(text, 100));
  for (const bytes of [
    [0xc0, 0x80],
    [0xed, 0xa0, 0x80],
    [0xf4, 0x90, 0x80, 0x80],
    [0xe2, 0x82],
    [0],
  ])
    assert.throws(() => decodeClipboardText(Uint8Array.from(bytes), 100));
  assert.throws(() => measureClipboardText('a'.repeat(10000), 4));
});

test('browser/server clipboard composition: multi-window Unicode, exact ACK, frozen read and empty items', async () => {
  const f = fixture();
  const text = '\ufeff界😀\n'.repeat(6000);
  assert.equal((await f.drive(f.client.set(text))).status, 'accepted');
  assert.equal(f.written.toString(), text);
  assert.ok(f.windows.length > 1);
  for (let n = 1; n < f.windows.length; ++n)
    assert.ok(f.windows[n] - f.windows[n - 1] >= 64);
  for (const frame of f.frames)
    assert.ok(new Uint8Array(frame).every((b) => !b));
  f.readText = Buffer.from(text);
  const read = f.client.read();
  await f.flush();
  assert.equal(f.client.active.stage, 'download');
  f.offer({ revision: 2n }); // The accepted native item is already frozen.
  assert.equal((await f.drive(read)).text, text);
  assert.ok(f.readBuffer.every((b) => !b));
  assert.equal(f.closed, 0);
  assert.equal((await f.drive(f.client.set(''))).status, 'accepted');
  f.readText = Buffer.alloc(0);
  const empty = await f.drive(f.client.read());
  assert.deepEqual(empty, { status: 'accepted', text: '' });
  f.client.dispose();
  f.server.dispose();
  f.written.fill(0);
  f.readText.fill(0);
});

test('browser/server clipboard composition: full 16 MiB bounded chunks in both directions', async () => {
  const f = fixture(16777216);
  const text = '界'.repeat(5592405) + 'A';
  const expected = hash(Buffer.from(text));
  assert.equal((await f.drive(f.client.set(text))).status, 'accepted');
  assert.equal(f.frames.length, 4117);
  assert.equal(hash(f.written), expected);
  assert.ok(
    f.frames.every(
      (frame) =>
        frame.byteLength <= 4096 && new Uint8Array(frame).every((b) => !b),
    ),
  );
  f.readText = f.written;
  const read = await f.drive(f.client.read());
  assert.equal(read.status, 'accepted');
  assert.equal(hash(Buffer.from(read.text)), expected);
  assert.ok(f.readBuffer.every((b) => !b));
  assert.equal(f.closed, 0);
  f.client.dispose();
  f.server.dispose();
  f.written.fill(0);
});

test('browser clipboard: complete text is withheld until terminal ACK; malformed source, credit or data closes and wipes', async () => {
  for (const fault of [
    'seq',
    'credit',
    'offset',
    'utf8',
    'complete',
    'generation',
    'grant',
    'replay',
  ]) {
    const f = fixture();
    f.granted = true;
    f.offer();
    let resolved = false;
    const result = f.client.read().then((value) => {
      resolved = true;
      return value;
    });
    f.tasks.length = 0;
    const data = {
      requestSeq: 0,
      status: 'accepted',
      generation: '1',
      revision: '1',
      bytes: 2,
      creditEnd: 2,
    };
    if (fault === 'seq') data.requestSeq = 1;
    if (fault === 'credit') data.creditEnd = 3;
    f.client.message('clipboard.data', data);
    const buffer = f.client.active?.buffer;
    if (!['seq', 'credit'].includes(fault)) {
      assert.equal(resolved, false);
      if (fault === 'complete')
        f.client.message('clipboard.data.complete', {
          requestSeq: 0,
          status: 'accepted',
          bytes: 0,
        });
      else if (fault === 'generation') f.offer({ generation: 2n });
      else if (fault === 'grant') {
        f.granted = false;
        f.offer();
      } else {
        const frame = encodeClipboardChunk({
          requestSeq: 0,
          offset: fault === 'offset' ? 1 : 0,
          bytes: Buffer.from(fault === 'utf8' ? [0xc0, 0x80] : [65, 66]),
        });
        const record = Uint8Array.from(frame).buffer;
        f.client.binary(record);
        assert.ok(new Uint8Array(record).every((b) => !b));
        assert.equal(resolved, false);
        if (fault === 'replay') f.client.binary(Uint8Array.from(frame).buffer);
        else if (fault === 'utf8')
          f.client.message('clipboard.data.complete', {
            requestSeq: 0,
            status: 'accepted',
            bytes: 0,
          });
      }
    }
    assert.equal((await result).status, 'disconnected');
    assert.equal(f.closed, 1);
    if (buffer) assert.ok(buffer.every((b) => !b));
    f.server.dispose();
  }
});

test('browser clipboard: original deadlines, stalled backlog, source loss, no retry or queued second item', async () => {
  for (const fault of ['clock', 'window', 'whole', 'source', 'backlog']) {
    const f = fixture();
    f.granted = true;
    f.offer();
    const result = f.client.set('A'.repeat(40000));
    assert.equal((await f.client.read()).status, 'busy');
    f.tasks.length = 0;
    if (fault === 'backlog') f.queued = 8192;
    f.client.message('clipboard.set.ready', {
      requestSeq: 0,
      bytes: 40000,
      creditEnd: windowBytes,
    });
    if (fault === 'clock') f.time = -1;
    else if (fault === 'whole') {
      f.client.active.progress = 70000;
      f.time = 60000;
    } else if (fault === 'source') f.offer({ ready: false });
    else f.time = 2000;
    f.client.service();
    assert.equal((await result).status, 'disconnected');
    assert.equal(f.closed, 1);
    assert.equal(f.client.active, undefined);
    if (fault === 'backlog') assert.equal(f.frames.length, 0);
    for (const frame of f.frames)
      assert.ok(new Uint8Array(frame).every((b) => !b));
    f.server.dispose();
  }
});
