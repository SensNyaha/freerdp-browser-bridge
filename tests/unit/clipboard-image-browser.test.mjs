import test from 'node:test';
import assert from 'node:assert/strict';
import * as browser from '../../apps/reference-harness/clipboard-image.js';
import * as protocol from '../../packages/protocol/dist/index.js';
import { createHash } from 'node:crypto';
import { clipboardClientFixture as fixture } from '../fixtures/clipboard-client.mjs';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const golden = Buffer.from(
  '0001000000000002000000010000000812345678fedcba98',
  'hex',
);
const item = () => ({
  width: 2,
  height: 1,
  rgba: new Uint8Array(golden.subarray(16)),
});
test('browser image codec matches independent golden and private TypeScript codec', () => {
  const encoded = browser.encodeClipboardImageItem(item());
  assert.deepEqual(Buffer.from(encoded), golden);
  const borrowed = browser.decodeClipboardImageItem(encoded);
  assert.equal(borrowed.rgba.buffer, encoded.buffer);
  assert.equal(borrowed.rgba.byteOffset, encoded.byteOffset + 16);
  assert.deepEqual(protocol.decodeClipboardImageItem(Buffer.from(encoded)), {
    width: 2,
    height: 1,
    rgba: golden.subarray(16),
  });
  const privateBytes = protocol.encodeClipboardImageItem({
    ...item(),
    rgba: Buffer.from(item().rgba),
  });
  assert.deepEqual(
    Buffer.from(
      browser.encodeClipboardImageItem(
        browser.decodeClipboardImageItem(privateBytes),
      ),
    ),
    golden,
  );
  const padded = Buffer.alloc(golden.length + 21);
  golden.copy(padded, 7);
  const offset = browser.decodeClipboardImageItem(
    padded.subarray(7, 7 + golden.length),
  );
  assert.equal(offset.rgba.buffer, padded.buffer);
  assert.equal(offset.rgba.byteOffset, padded.byteOffset + 23);
  assert.deepEqual(
    Buffer.from(browser.encodeClipboardImageItem(offset)),
    golden,
  );
  encoded.fill(0);
  assert.deepEqual(Buffer.from(item().rgba), golden.subarray(16));
});
test('browser image codec rejects truncation flags geometry and exact quota before encoding', () => {
  for (let n = 0; n < golden.length; n++)
    assert.throws(() =>
      browser.decodeClipboardImageItem(golden.subarray(0, n)),
    );
  for (const at of [0, 1, 2, 3, 4, 8, 12]) {
    const bad = Buffer.from(golden);
    bad[at] = 255;
    assert.throws(() => browser.decodeClipboardImageItem(bad));
  }
  for (const patch of [
    { width: 0 },
    { height: -1 },
    { width: NaN },
    { width: 0x7fffffff, height: 0x7fffffff },
    { rgba: [] },
  ])
    assert.throws(() =>
      browser.encodeClipboardImageItem({ ...item(), ...patch }),
    );
  assert.doesNotThrow(() => browser.validateClipboardImageWrite(item(), 132));
  assert.throws(() => browser.validateClipboardImageWrite(item(), 131));
  assert.equal(browser.encodeClipboardImageItem(item(), 8).length, 24);
  assert.throws(() => browser.encodeClipboardImageItem(item(), 7));
  for (const maximum of [0, -1, 1.5, NaN, Infinity, 16777217])
    assert.throws(() => browser.encodeClipboardImageItem(item(), maximum));
  for (let at = 0; at < golden.length; at++) {
    for (const byte of [0, 1, 0x80, 0xff]) {
      const bytes = Buffer.from(golden);
      bytes[at] = byte;
      const admits = (decode) => {
        try {
          decode(bytes);
          return true;
        } catch {
          return false;
        }
      };
      assert.equal(
        admits(browser.decodeClipboardImageItem),
        admits(protocol.decodeClipboardImageItem),
        `byte ${at}=${byte}`,
      );
    }
  }
});
const png = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489',
  'hex',
);
test('PNG header guard refuses independently serialized invalid geometry and methods with valid CRC', () => {
  for (const hex of [
    '89504e470d0a1a0a0000000d494844527fffffff7fffffff080600000014c90b66',
    '89504e470d0a1a0a0000000d4948445200000000000000010806000000f0d7afb7',
    '89504e470d0a1a0a0000000d4948445200000001000000010406000000dae52988',
    '89504e470d0a1a0a0000000d494844520000000100000001080100000082c2fc30',
    '89504e470d0a1a0a0000000d49484452000000010000000108060100001ed7aebe',
    '89504e470d0a1a0a0000000d4948445200000001000000010806000100060ef5c8',
    '89504e470d0a1a0a0000000d4948445200000001000000010806000002f11ba5a5',
  ])
    assert.throws(() =>
      browser.inspectClipboardPngHeader(Buffer.from(hex, 'hex')),
    );
});
test('PNG header guard checks fixed signature IHDR CRC and dimension budget before decoder use', () => {
  assert.deepEqual(browser.inspectClipboardPngHeader(png, 4), {
    width: 1,
    height: 1,
    rgbaBytes: 4,
  });
  assert.throws(() => browser.inspectClipboardPngHeader(png, 3));
  for (let at = 0; at < 33; at++) {
    const bad = Buffer.from(png);
    bad[at] ^= 255;
    assert.throws(() => browser.inspectClipboardPngHeader(bad));
  }
  for (let n = 0; n < 33; n++)
    assert.throws(() => browser.inspectClipboardPngHeader(png.subarray(0, n)));
  assert.throws(() =>
    browser.inspectClipboardPngHeader(Buffer.concat([png, Buffer.from([0])])),
  );
});

test('browser/server image composition shares text/HTML flight, paced windows and owned snapshots', async () => {
  const f = fixture(1048576, true, 'bidirectional', true);
  const value = { width: 100, height: 100, rgba: Buffer.alloc(40000, 173) };
  const expected = hash(value.rgba);
  assert.equal(f.client.snapshot.canSetImage, true);
  assert.equal(f.client.snapshot.canReadImage, true);
  const writing = f.client.setImage(value);
  assert.equal((await f.client.read()).status, 'busy');
  assert.equal((await f.client.readHtml()).status, 'busy');
  assert.equal((await f.client.readImage()).status, 'busy');
  value.rgba.fill(72); // Client owns the encoded snapshot synchronously.
  assert.equal((await f.drive(writing)).status, 'accepted');
  assert.equal(hash(f.imageWritten.rgba), expected);
  assert.ok(f.windows.length > 1);
  for (let n = 1; n < f.windows.length; n++)
    assert.ok(f.windows[n] - f.windows[n - 1] >= 64);
  assert.ok(f.frames.every((b) => new Uint8Array(b).every((v) => !v)));
  assert.equal(f.calls.writeImage, 1);
  assert.equal(f.calls.write, 0);
  assert.equal(f.calls.writeHtml, 0);
  f.readImage = value;
  const reading = f.client.readImage();
  await f.flush();
  assert.ok(f.client.active);
  assert.ok(f.readImageBuffer.rgba.every((v) => !v));
  f.offer({ revision: 2n }); // Accepted native snapshot is already frozen.
  const read = await f.drive(reading);
  assert.equal(read.status, 'accepted');
  assert.equal(hash(read.item.rgba), hash(value.rgba));
  assert.deepEqual(Object.keys(read.item).sort(), ['height', 'rgba', 'width']);
  assert.equal(f.calls.read, 0);
  assert.equal(f.calls.readHtml, 0);
  f.client.dispose();
  f.server.dispose();
  assert.equal(read.item.rgba[0], 72); // Ownership now belongs to the consumer.
  read.item.rgba.fill(0);
  f.imageWritten.rgba.fill(0);
  value.rgba.fill(0);
  assert.equal(f.closed, 0);
});

test('browser image admission requires explicit immutable descriptor and complete scalar state', async () => {
  for (const html of [false, true]) {
    const legacy = fixture(1024, html);
    assert.equal((await legacy.client.setImage(item())).status, 'unavailable');
    assert.equal((await legacy.client.readImage()).status, 'unavailable');
    assert.equal(legacy.seq, 0);
    legacy.client.dispose();
    legacy.server.dispose();
  }
  for (const descriptor of [
    undefined,
    null,
    {},
    { version: 2, itemMetadataBytes: 16, pixelFormat: 'rgba8-srgb-straight' },
    { version: 1, itemMetadataBytes: 15, pixelFormat: 'rgba8-srgb-straight' },
    { version: 1, itemMetadataBytes: 16, pixelFormat: 'bgra8' },
  ]) {
    const f = fixture(1024, false, 'bidirectional', true);
    f.imageDescriptor = descriptor;
    f.offer();
    assert.equal(f.closed, 1);
    f.server.dispose();
  }
  for (const patch of [
    { image: false },
    { remoteImage: undefined },
    { localImageAccepted: undefined },
    { fromServer: false },
    { revision: 0n },
    { ready: false },
    { localImageAccepted: true },
    { localImageAccepted: true, localAccepted: true, localHtmlAccepted: true },
  ]) {
    const f = fixture(1024, true, 'bidirectional', true);
    f.offer(patch);
    assert.equal(
      f.closed,
      1,
      JSON.stringify(patch, (_, v) => (typeof v === 'bigint' ? String(v) : v)),
    );
    f.server.dispose();
  }
  const f = fixture(1024, true, 'bidirectional', true);
  f.imageDescriptor = undefined;
  f.offer({
    image: undefined,
    remoteImage: undefined,
    localImageAccepted: undefined,
  });
  assert.equal(f.closed, 1);
  f.server.dispose();
});

test('browser image quota, directions, pending ACK and exclusive native offer are enforced before dispatch', async () => {
  for (const [mode, method] of [
    ['server-to-browser', 'setImage'],
    ['browser-to-server', 'readImage'],
  ]) {
    const f = fixture(1024, false, mode, true);
    assert.equal((await f.client[method](item())).status, 'refused');
    assert.equal(f.seq, 0);
    f.client.dispose();
    f.server.dispose();
  }
  const f = fixture(131, false, 'bidirectional', true);
  assert.equal((await f.client.setImage(item())).status, 'invalid');
  assert.equal(
    (await f.client.admit('set', item(), 'unknown')).status,
    'invalid',
  );
  assert.equal(f.seq, 0);
  f.client.dispose();
  f.server.dispose();
  const exact = fixture(132, false, 'bidirectional', true);
  assert.equal(
    (await exact.drive(exact.client.setImage(item()))).status,
    'accepted',
  );
  exact.client.dispose();
  exact.server.dispose();
  exact.imageWritten.rgba.fill(0);
  for (const patch of [
    { localPending: true },
    { remotePending: true },
    { localAccepted: true },
  ]) {
    const g = fixture(1024, false, 'bidirectional', true);
    g.offer(patch);
    assert.equal(g.client.snapshot.canReadImage, false);
    assert.equal(g.client.snapshot.canSetImage, false);
    assert.equal((await g.client.readImage()).status, 'refused');
    assert.equal((await g.client.setImage(item())).status, 'refused');
    assert.equal(g.seq, 0);
    g.client.dispose();
    g.server.dispose();
  }
});

test('browser image download exposes no pixels before terminal ACK and wipes malformed or lost transfers', async () => {
  for (const fault of [
    'prefix',
    'length',
    'quota',
    'credit',
    'schema',
    'geometry',
    'flags',
    'early',
    'grant',
    'policy',
    'generation',
    'deadline',
  ]) {
    const f = fixture(1024, true, 'bidirectional', true);
    f.granted = true;
    f.offer();
    let delivered = false;
    const promise = f.client.readImage().then((result) => {
      delivered = true;
      return result;
    });
    f.tasks.length = 0;
    const meta = {
      requestSeq: 0,
      status: 'accepted',
      generation: '1',
      revision: '1',
      bytes: golden.length,
      creditEnd: golden.length,
    };
    if (fault === 'length') meta.bytes = 15;
    if (fault === 'quota') meta.bytes = 1041;
    if (fault === 'credit') meta.creditEnd--;
    f.client.message(
      fault === 'prefix' ? 'clipboard.html.data' : 'clipboard.image.data',
      meta,
    );
    const buffer = f.client.active?.buffer;
    if (!['prefix', 'length', 'quota', 'credit'].includes(fault)) {
      assert.equal(delivered, false);
      if (fault === 'early')
        f.client.message('clipboard.image.data.complete', {
          requestSeq: 0,
          status: 'accepted',
          bytes: 0,
        });
      else if (fault === 'grant') {
        f.granted = false;
        f.offer();
      } else if (fault === 'policy') {
        f.imageDescriptor = undefined;
        f.offer({
          image: undefined,
          remoteImage: undefined,
          localImageAccepted: undefined,
        });
      } else if (fault === 'generation') f.offer({ generation: 2n });
      else if (fault === 'deadline') {
        f.time = 2000;
        f.client.service();
      } else {
        const bytes = Buffer.from(golden);
        if (fault === 'schema') bytes[1] = 2;
        if (fault === 'flags') bytes[3] = 1;
        if (fault === 'geometry') bytes.writeUInt32BE(3, 4);
        const record = Uint8Array.from(
          protocol.encodeClipboardChunk({ requestSeq: 0, offset: 0, bytes }),
        ).buffer;
        f.client.binary(record);
        assert.ok(new Uint8Array(record).every((v) => !v));
        assert.equal(delivered, false);
        f.client.message('clipboard.image.data.complete', {
          requestSeq: 0,
          status: 'accepted',
          bytes: 0,
        });
      }
    }
    assert.equal((await promise).status, 'disconnected', fault);
    assert.equal(f.closed, 1, fault);
    if (buffer)
      assert.ok(
        buffer.every((v) => !v),
        fault,
      );
    f.server.dispose();
  }
});

test('browser image native deadline is eight seconds and selected image loss terminates another format', async () => {
  const f = fixture(1024, true, 'bidirectional', true);
  f.granted = true;
  f.offer();
  const promise = f.client.readImage();
  f.tasks.length = 0;
  f.time = 7999;
  f.offer({ revision: 2n });
  assert.equal(f.client.nextDeadline, 8000);
  f.time = 8000;
  f.client.service();
  assert.equal((await promise).status, 'disconnected');
  assert.equal(f.closed, 1);
  f.server.dispose();
  const other = fixture(1024, true, 'bidirectional', true);
  const writing = other.client.set('owned text');
  other.tasks.length = 0;
  const buffer = other.client.active.buffer;
  other.imageDescriptor = undefined;
  other.offer({
    image: undefined,
    remoteImage: undefined,
    localImageAccepted: undefined,
  });
  assert.equal((await writing).status, 'disconnected');
  assert.ok(buffer.every((v) => !v));
  other.server.dispose();
});

test('browser/server image full byte ceiling keeps RGBA and canonical native write overhead distinct', async () => {
  const maximum = 16777216;
  const f = fixture(maximum, false, 'bidirectional', true);
  const rgba = Buffer.alloc(maximum - 124, 0x81);
  const expected = hash(rgba);
  assert.equal(
    (
      await f.drive(
        f.client.setImage({ width: 1, height: rgba.length / 4, rgba }),
      )
    ).status,
    'accepted',
  );
  assert.equal(hash(f.imageWritten.rgba), expected);
  assert.ok(
    f.frames.every(
      (frame) =>
        frame.byteLength <= 4096 && new Uint8Array(frame).every((v) => !v),
    ),
  );
  const incoming = Buffer.alloc(maximum - 16, 0x27);
  f.readImage = { width: 1, height: incoming.length / 4, rgba: incoming };
  const read = await f.drive(f.client.readImage());
  assert.equal(read.status, 'accepted');
  assert.equal(hash(read.item.rgba), hash(incoming));
  assert.ok(f.readImageBuffer.rgba.every((v) => !v));
  assert.equal((await f.client.setImage(read.item)).status, 'invalid');
  assert.equal(f.calls.writeImage, 1);
  f.client.dispose();
  f.server.dispose();
  read.item.rgba.fill(0);
  f.imageWritten.rgba.fill(0);
  rgba.fill(0);
  incoming.fill(0);
});
