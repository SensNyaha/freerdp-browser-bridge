import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  encodeClipboardHtmlItem as encode,
  decodeClipboardHtmlItem as decode,
  validateClipboardHtmlItem as validate,
  validateClipboardHtmlWrite as validateWrite,
  measureClipboardHtmlString,
  encodeClipboardHtmlString,
} from '../../apps/reference-harness/clipboard-html.js';
import {
  encodeClipboardHtmlItem as nodeEncode,
  decodeClipboardHtmlItem as nodeDecode,
  validateClipboardHtmlItem as nodeValidate,
  validateClipboardHtmlWrite as nodeValidateWrite,
  encodeClipboardChunk,
} from '../../packages/protocol/dist/index.js';
import { clipboardClientFixture as fixture } from '../fixtures/clipboard-client.mjs';
const maximum = 16777216;
const golden = Buffer.from(
  '00010001000000080000000100000000000000080000000000000000000000003c623e583c2f623e58',
  'hex',
);
const item = (body = Buffer.from('<b>X</b>'), text) => ({
  body,
  fragmentOffset: 0,
  fragmentBytes: body.length,
  selectionOffset: 0,
  selectionBytes: 0,
  context: false,
  selection: false,
  ...(text === undefined ? {} : { text }),
});
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const accepts = (fn) => {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
};

test('browser HTML string admission: scalar bytes precede encoding without a text UTF16 quota', () => {
  for (const text of ['', 'A', '\ufeff\u0416\ud83d\ude00', '\r\n', '&<>"']) {
    const bytes = Buffer.byteLength(text);
    assert.equal(measureClipboardHtmlString(text, bytes), bytes);
    assert.deepEqual(
      Buffer.from(encodeClipboardHtmlString(text, bytes)),
      Buffer.from(text),
    );
    if (bytes) assert.throws(() => encodeClipboardHtmlString(text, bytes - 1));
  }
  for (const value of ['\0', 'A\0B', '\ud800', '\udc00', '\ud800A', null, 1])
    assert.throws(() => encodeClipboardHtmlString(value, 100));
  for (const budget of [-1, 1.5, NaN, 16777217])
    assert.throws(() => measureClipboardHtmlString('', budget));
});

test('browser HTML item: independent golden, offset views, owned encoding and empty/absent fallback', () => {
  const value = item(Buffer.from('<b>X</b>'), Buffer.from('X'));
  assert.deepEqual(Buffer.from(encode(value)), golden);
  for (const original of [
    value,
    item(),
    item(Buffer.alloc(0)),
    item(Buffer.alloc(0), Buffer.alloc(0)),
  ]) {
    const bytes = encode(original);
    assert.deepEqual(Buffer.from(bytes), nodeEncode(original));
    const padded = new Uint8Array(bytes.length + 15);
    padded.set(bytes, 7);
    const parsed = decode(padded.subarray(7, 7 + bytes.length));
    assert.equal(parsed.body.buffer, padded.buffer);
    assert.equal(parsed.body.byteOffset, 39);
    assert.equal(Object.hasOwn(parsed, 'text'), original.text !== undefined);
    assert.deepEqual(Buffer.from(encode(parsed)), Buffer.from(bytes));
    bytes.fill(0);
    assert.deepEqual(Buffer.from(parsed.body), original.body);
    parsed.body.fill(0);
    parsed.text?.fill(0);
  }
  assert.deepEqual(Buffer.from(value.body), Buffer.from('<b>X</b>'));
});

test('browser HTML item: contextual Unicode fragment/selection boundaries and header corruption agree with Node', () => {
  const body = Buffer.from(
    '<table><tr><td><b>\u0416\ud83d\ude00</b></td></tr></table>',
  );
  const at = body.indexOf('<b>');
  const value = {
    ...item(body),
    context: true,
    selection: true,
    fragmentOffset: at,
    fragmentBytes: 13,
    selectionOffset: at + 3,
    selectionBytes: 6,
  };
  assert.deepEqual(Buffer.from(encode(value)), nodeEncode(value));
  assert.equal(decode(encode(value)).selectionOffset, at + 3);
  for (const delta of [
    { fragmentOffset: at + 4 },
    { fragmentBytes: 6 },
    { selectionOffset: at + 4 },
    { selectionBytes: 3 },
  ])
    assert.throws(() => encode({ ...value, ...delta }));
  for (let size = 0; size < golden.length; ++size)
    assert.throws(() => decode(golden.subarray(0, size)));
  for (let at = 0; at < golden.length; ++at) {
    for (const byte of [0, 1, 0x80, 0xff]) {
      const changed = Buffer.from(golden);
      changed[at] = byte;
      const browser = accepts(() => decode(changed));
      assert.equal(
        browser,
        accepts(() => nodeDecode(changed)),
        `byte ${at}=${byte}`,
      );
      if (browser)
        assert.deepEqual(Buffer.from(encode(decode(changed))), changed);
    }
  }
});

test('browser HTML item: strict byte inspection agrees with Node on UTF8, newline and aggregate quota boundaries', () => {
  const vectors = [
    Buffer.alloc(0),
    Buffer.from('\ufeffA\r\n\ud83d\ude00'),
    Buffer.from([0]),
    Buffer.from([0xc0, 0xaf]),
    Buffer.from([0xed, 0xa0, 0x80]),
    Buffer.from([0xf4, 0x90, 0x80, 0x80]),
  ];
  for (const first of [0x80, 0xc2, 0xdf, 0xe0, 0xed, 0xef, 0xf0, 0xf4, 0xf5])
    for (let second = 0; second < 256; ++second)
      vectors.push(
        Buffer.from(
          first < 0xe0
            ? [first, second]
            : first < 0xf0
              ? [first, second, 0x80]
              : [first, second, 0x80, 0x80],
        ),
      );
  for (const bytes of vectors) {
    const value = item(bytes);
    assert.equal(
      accepts(() => validate(value, 100)),
      accepts(() => nodeValidate(value, 100)),
    );
    const fallback = item(Buffer.alloc(0), bytes);
    assert.equal(
      accepts(() => validate(fallback, 10)),
      accepts(() => nodeValidate(fallback, 10)),
    );
  }
  for (const plain of [
    '',
    'A',
    '\r\n',
    '\n',
    '\r\r\n',
    '\ufeff\u0416\ud83d\ude00',
  ]) {
    const value = item(Buffer.from('<b>X</b>'), Buffer.from(plain));
    for (let limit = 170; limit <= 202; ++limit)
      assert.equal(
        accepts(() => validateWrite(value, limit)),
        accepts(() => nodeValidateWrite(value, limit)),
        `${JSON.stringify(plain)} at ${limit}`,
      );
  }
  for (const invalid of [
    null,
    1,
    'html',
    {},
    item(new Uint16Array(2)),
    { ...item(), selectionBytes: 1 },
    { ...item(), fragmentOffset: NaN },
  ])
    assert.throws(() => encode(invalid));
});

test('browser/server HTML composition: negotiated shared flight, multi-window copy and owned contextual snapshot', async () => {
  const f = fixture(1048576, true);
  const value = item(
    Buffer.from('<b>\u754c\ud83d\ude00</b>'.repeat(6000)),
    Buffer.from('plain\n'.repeat(6000)),
  );
  const expected = hash(nodeEncode(value));
  const writing = f.client.setHtml(value);
  const caller = hash(value.body);
  assert.equal((await f.client.read()).status, 'busy');
  assert.equal((await f.client.readHtml()).status, 'busy');
  assert.equal((await f.drive(writing)).status, 'accepted');
  assert.equal(hash(nodeEncode(f.htmlWritten)), expected);
  assert.equal(hash(value.body), caller);
  assert.equal(f.calls.writeHtml, 1);
  assert.equal(f.calls.write, 0);
  assert.ok(f.windows.length > 1);
  for (let n = 1; n < f.windows.length; ++n)
    assert.ok(f.windows[n] - f.windows[n - 1] >= 64);
  assert.ok(
    f.frames.every((frame) => new Uint8Array(frame).every((byte) => !byte)),
  );
  f.readItem = {
    ...value,
    body: Buffer.from(
      '<table><tr><td>selected</td></tr><tr><td>unselected</td></tr></table>',
    ),
    context: true,
    selection: true,
    fragmentOffset: 11,
    fragmentBytes: 17,
    selectionOffset: 15,
    selectionBytes: 8,
  };
  const reading = f.client.readHtml();
  await f.flush();
  assert.ok(f.readItemBuffer.body.every((byte) => !byte));
  assert.ok(f.readItemBuffer.text.every((byte) => !byte));
  assert.ok(f.client.active);
  f.offer({ revision: 2n });
  const read = await f.drive(reading);
  assert.equal(read.status, 'accepted');
  assert.deepEqual(Buffer.from(encode(read.item)), nodeEncode(f.readItem));
  assert.equal(read.item.selectionOffset, 15);
  f.client.dispose();
  f.server.dispose();
  assert.equal(read.item.body.includes('u'.charCodeAt(0)), true);
  read.item.body.fill(0);
  read.item.text.fill(0);
  f.htmlWritten.body.fill(0);
  f.htmlWritten.text.fill(0);
  assert.equal(f.closed, 0);
});

test('browser/server HTML composition: full 16 MiB item cap and encoded RDP upload quota remain distinct', async () => {
  const body = Buffer.alloc(maximum - 170, 65);
  const f = fixture(maximum, true);
  assert.equal(
    (await f.drive(f.client.setHtml(item(body)))).status,
    'accepted',
  );
  assert.equal(hash(f.htmlWritten.body), hash(body));
  assert.ok(
    f.frames.every(
      (frame) =>
        frame.byteLength <= 4096 &&
        new Uint8Array(frame).every((byte) => !byte),
    ),
  );
  const incoming = Buffer.alloc(maximum - 32, 66);
  f.readItem = item(incoming);
  assert.equal(encode(f.readItem).length, maximum);
  const read = await f.drive(f.client.readHtml());
  assert.equal(read.status, 'accepted');
  assert.equal(hash(read.item.body), hash(incoming));
  assert.ok(f.readItemBuffer.body.every((byte) => !byte));
  assert.equal((await f.client.setHtml(f.readItem)).status, 'invalid');
  assert.throws(() => encode(item(Buffer.alloc(maximum - 31, 65))));
  f.client.dispose();
  f.server.dispose();
  read.item.body.fill(0);
  f.htmlWritten.body.fill(0);
  body.fill(0);
  incoming.fill(0);
});

test('browser HTML admission: explicit descriptor, immutable format, directions and fragment-only writes', async () => {
  const legacy = fixture();
  assert.equal((await legacy.client.readHtml()).status, 'unavailable');
  assert.equal((await legacy.client.setHtml(item())).status, 'unavailable');
  assert.equal(legacy.seq, 0);
  legacy.client.dispose();
  legacy.server.dispose();
  for (const descriptor of [
    undefined,
    null,
    { version: 2, itemMetadataBytes: 32 },
    { version: 1, itemMetadataBytes: 31 },
  ]) {
    const f = fixture(1024, true);
    f.descriptor = descriptor;
    f.offer();
    assert.equal(f.closed, 1);
    f.server.dispose();
  }
  const f = fixture(1024, true);
  assert.equal(
    (await f.client.setHtml({ ...item(), context: true })).status,
    'invalid',
  );
  const excessive = await f.client.setHtml(item(Buffer.from('A'.repeat(855))));
  assert.equal(excessive.status, 'invalid');
  assert.equal(f.seq, 0);
  const fromServer = fixture(1024, true, 'server-to-browser');
  assert.equal((await fromServer.client.setHtml(item())).status, 'refused');
  assert.equal(fromServer.seq, 0);
  fromServer.client.dispose();
  fromServer.server.dispose();
  const toServer = fixture(1024, true, 'browser-to-server');
  assert.equal((await toServer.client.readHtml()).status, 'refused');
  assert.equal(toServer.seq, 0);
  toServer.client.dispose();
  toServer.server.dispose();
  f.offer({
    html: undefined,
    remoteHtml: undefined,
    localHtmlAccepted: undefined,
  });
  assert.equal(f.closed, 1);
  f.server.dispose();
});

test('browser HTML download: wrong format, malformed inner bytes, source loss and early completion wipe retained content', async () => {
  for (const fault of [
    'prefix',
    'length',
    'credit',
    'utf8',
    'range',
    'schema',
    'early',
    'grant',
    'policy',
  ]) {
    const f = fixture(1024, true);
    f.granted = true;
    f.offer();
    let delivered = false;
    const promise = f.client.readHtml().then((result) => {
      delivered = true;
      return result;
    });
    f.tasks.length = 0;
    const meta = {
      requestSeq: 0,
      status: 'accepted',
      generation: '1',
      revision: '1',
      bytes: 41,
      creditEnd: 41,
    };
    if (fault === 'length') meta.bytes = 31;
    if (fault === 'credit') meta.creditEnd = 40;
    f.client.message(
      fault === 'prefix' ? 'clipboard.data' : 'clipboard.html.data',
      meta,
    );
    const buffer = f.client.active?.buffer;
    if (!['prefix', 'length', 'credit'].includes(fault)) {
      assert.equal(delivered, false);
      if (fault === 'early')
        f.client.message('clipboard.html.data.complete', {
          requestSeq: 0,
          status: 'accepted',
          bytes: 0,
        });
      else if (fault === 'grant') {
        f.granted = false;
        f.offer();
      } else if (fault === 'policy') {
        f.descriptor = undefined;
        f.offer({
          html: undefined,
          remoteHtml: undefined,
          localHtmlAccepted: undefined,
        });
      } else {
        const bytes = Buffer.from(golden);
        if (fault === 'utf8') bytes[32] = 0xc0;
        if (fault === 'range') bytes.writeUInt32BE(1, 12);
        if (fault === 'schema') bytes[1] = 2;
        const record = Uint8Array.from(
          encodeClipboardChunk({ requestSeq: 0, offset: 0, bytes }),
        ).buffer;
        f.client.binary(record);
        assert.ok(new Uint8Array(record).every((byte) => !byte));
        assert.equal(delivered, false);
        f.client.message('clipboard.html.data.complete', {
          requestSeq: 0,
          status: 'accepted',
          bytes: 0,
        });
      }
    }
    assert.equal((await promise).status, 'disconnected');
    assert.equal(f.closed, 1);
    if (buffer) assert.ok(buffer.every((byte) => !byte));
    f.server.dispose();
  }
});

test('browser HTML read has a finite 13-second native budget; traffic cannot renew it', async () => {
  const f = fixture(1024, true);
  f.granted = true;
  f.offer();
  const result = f.client.readHtml();
  f.tasks.length = 0;
  f.time = 9000;
  f.offer({ revision: 2n });
  f.client.service();
  assert.equal(f.closed, 0);
  assert.equal(f.client.nextDeadline, 13000);
  f.time = 13000;
  f.client.service();
  assert.equal((await result).status, 'disconnected');
  assert.equal(f.closed, 1);
  assert.equal(f.seq, 1);
  f.server.dispose();
});
