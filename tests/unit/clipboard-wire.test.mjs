import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ProtocolError,
  encodeClipboardState,
  decodeClipboardState,
  encodeClipboardCommand,
  decodeClipboardCommand,
  encodeClipboardResult,
  decodeClipboardResult,
} from '../../packages/protocol/dist/index.js';

const state = Buffer.from(
  '0001000f0010000000000000000000010000000000000002',
  'hex',
);
const read = Buffer.from(
  '000100010000000000000000000000010000000000000002',
  'hex',
);
const unicode = Buffer.from('d096f09f98800a', 'hex');
const empty = Buffer.alloc(0);
const get = { operation: 'read', generation: 1n, revision: 2n, text: empty };
const set = { operation: 'set', generation: 1n, revision: 0n, text: unicode };

test('clipboard revoke: schema-2 golden vector cannot be confused with empty schema-1 set', () => {
  const value = {
    operation: 'revoke',
    generation: 1n,
    revision: 0n,
    text: empty,
  };
  const golden = Buffer.from(
    '000200030000000000000000000000010000000000000000',
    'hex',
  );
  assert.deepEqual(encodeClipboardCommand(value), golden);
  assert.deepEqual(decodeClipboardCommand(golden), value);
  assert.deepEqual(
    encodeClipboardResult({ ...value, status: 'accepted' }),
    golden,
  );
  assert.deepEqual(decodeClipboardResult(golden), {
    ...value,
    status: 'accepted',
  });
  for (let n = 0; n < golden.length; ++n)
    assert.throws(
      () => decodeClipboardCommand(golden.subarray(0, n)),
      ProtocolError,
    );
  for (const schema of [0, 1, 3]) {
    const bytes = Buffer.from(golden);
    bytes.writeUInt16BE(schema);
    assert.throws(() => decodeClipboardCommand(bytes), ProtocolError);
    assert.throws(() => decodeClipboardResult(bytes), ProtocolError);
  }
  for (const operation of [1, 2, 4]) {
    const bytes = Buffer.from(golden);
    bytes.writeUInt16BE(operation, 2);
    assert.throws(() => decodeClipboardCommand(bytes), ProtocolError);
    assert.throws(() => decodeClipboardResult(bytes), ProtocolError);
  }
  assert.throws(
    () => encodeClipboardCommand({ ...value, revision: 1n }),
    ProtocolError,
  );
  assert.throws(
    () => encodeClipboardCommand({ ...value, text: unicode }),
    ProtocolError,
  );
  assert.throws(
    () => decodeClipboardCommand(Buffer.concat([golden, unicode])),
    ProtocolError,
  );
  assert.throws(
    () => decodeClipboardResult(Buffer.concat([golden, unicode])),
    ProtocolError,
  );
});
test('clipboard private state: independent schema/flag/max/generation/revision vector', () => {
  const expected = {
    generation: 1n,
    revision: 2n,
    maximum: 1048576,
    ready: true,
    toServer: true,
    fromServer: true,
    remoteText: true,
    localAccepted: false,
    localPending: false,
    remotePending: false,
  };
  assert.deepEqual(decodeClipboardState(state), expected);
  assert.deepEqual(encodeClipboardState(expected), state);
  for (let n = 0; n < 24; ++n)
    assert.throws(
      () => decodeClipboardState(state.subarray(0, n)),
      ProtocolError,
    );
  assert.throws(
    () => decodeClipboardState(Buffer.concat([state, empty, Buffer.of(0)])),
    ProtocolError,
  );
  for (const at of [1, 2, 3, 5, 15, 23]) {
    const b = Buffer.from(state);
    b[at] = at === 2 ? 1 : 0;
    assert.throws(() => decodeClipboardState(b), ProtocolError);
  }
  for (const flags of [0, 8, 63, 11, 18, 128]) {
    const b = Buffer.from(state);
    b[3] = flags;
    assert.throws(() => decodeClipboardState(b), ProtocolError);
  }
  for (const override of [
    { generation: 0n },
    { generation: 2n ** 64n },
    { revision: -1n },
    { maximum: 0 },
    { maximum: 16777217 },
    { maximum: 1.1 },
    { ready: 1 },
  ])
    assert.throws(
      () => encodeClipboardState({ ...expected, ...override }),
      ProtocolError,
    );
});
test('clipboard private command/result: independent UTF8 vectors, borrowed decode and owned encode', () => {
  assert.deepEqual(encodeClipboardCommand(get), read);
  assert.deepEqual(decodeClipboardCommand(read), get);
  const expected = Buffer.from(
    '000100020000000000000000000000010000000000000000d096f09f98800a',
    'hex',
  );
  assert.deepEqual(encodeClipboardCommand(set), expected);
  const owned = encodeClipboardCommand({ ...set, text: Buffer.from(unicode) });
  const decoded = decodeClipboardCommand(owned);
  assert.deepEqual(decoded, set);
  assert.equal(decoded.text.buffer, owned.buffer);
  assert.equal(decoded.text.byteOffset, owned.byteOffset + 24);
  const source = Buffer.from(unicode);
  const copy = encodeClipboardCommand({ ...set, text: source });
  source.fill(65);
  assert.deepEqual(copy, expected);
  const reply = Buffer.concat([read, unicode]);
  assert.deepEqual(
    encodeClipboardResult({ ...get, status: 'accepted', text: unicode }),
    reply,
  );
  assert.deepEqual(decodeClipboardResult(reply), {
    ...get,
    status: 'accepted',
    text: unicode,
  });
  for (const [index, status] of [
    'accepted',
    'refused',
    'stale',
    'unavailable',
    'busy',
    'invalid',
    'timeout',
    'disconnected',
  ].entries()) {
    const b = Buffer.from(read);
    b.writeUInt16BE(index, 4);
    assert.equal(decodeClipboardResult(b).status, status);
    assert.deepEqual(encodeClipboardResult({ ...get, status }), b);
    if (index) {
      assert.throws(() => decodeClipboardCommand(b), ProtocolError);
      assert.throws(
        () => decodeClipboardResult(Buffer.concat([b, unicode])),
        ProtocolError,
      );
    }
  }
});
test('clipboard private payloads: malformed metadata UTF8 and wrong directions fail without input disclosure', () => {
  for (let n = 0; n < 24; ++n) {
    assert.throws(
      () => decodeClipboardCommand(read.subarray(0, n)),
      ProtocolError,
    );
    assert.throws(
      () => decodeClipboardResult(read.subarray(0, n)),
      ProtocolError,
    );
  }
  for (const at of [0, 1, 2, 3, 4, 5, 6, 7, 15, 23]) {
    const b = Buffer.from(read);
    b[at] = [1, 3, 15, 23].includes(at) ? 0 : 255;
    assert.throws(() => decodeClipboardCommand(b), ProtocolError);
  }
  for (const bytes of [
    [0],
    [65, 0],
    [0x80],
    [0xc0, 0xaf],
    [0xed, 0xa0, 0x80],
    [0xf4, 0x90, 0x80, 0x80],
    [0xf0, 0x9f],
  ]) {
    const text = Buffer.from(bytes);
    assert.throws(
      () => encodeClipboardCommand({ ...set, text }),
      ProtocolError,
    );
    assert.throws(
      () => encodeClipboardResult({ ...get, status: 'accepted', text }),
      ProtocolError,
    );
    const b = Buffer.concat([
      encodeClipboardCommand({ ...set, text: empty }),
      text,
    ]);
    assert.throws(() => decodeClipboardCommand(b), ProtocolError);
  }
  for (const override of [
    { operation: 'other' },
    { generation: 0n },
    { revision: 1n },
    { text: new Uint8Array(0) },
  ])
    assert.throws(
      () => encodeClipboardCommand({ ...set, ...override }),
      ProtocolError,
    );
  assert.throws(
    () => encodeClipboardCommand({ ...get, text: unicode }),
    ProtocolError,
  );
  assert.throws(
    () => encodeClipboardResult({ ...set, status: 'accepted' }),
    ProtocolError,
  );
  assert.throws(
    () => encodeClipboardResult({ ...get, status: 'other' }),
    ProtocolError,
  );
  assert.throws(
    () => encodeClipboardResult({ ...get, status: 'refused', text: unicode }),
    ProtocolError,
  );
  assert.throws(
    () =>
      encodeClipboardCommand({
        ...set,
        text: Buffer.from('clipboard-canary\0'),
      }),
    (e) => e instanceof ProtocolError && !e.message.includes('canary'),
  );
});
test('clipboard private payloads: full uint64 and normalized UTF16 item boundaries stay bounded', () => {
  const max = 0xffffffffffffffffn;
  assert.equal(
    decodeClipboardCommand(
      encodeClipboardCommand({ ...get, generation: max, revision: max }),
    ).revision,
    max,
  );
  const text = Buffer.alloc(8388607, 65);
  const encoded = encodeClipboardCommand({ ...set, text });
  assert.equal(encoded.length, 24 + text.length);
  assert.equal(decodeClipboardCommand(encoded).text.length, text.length);
  assert.throws(
    () => encodeClipboardCommand({ ...set, text: Buffer.alloc(8388608, 65) }),
    ProtocolError,
  );
  assert.throws(
    () => encodeClipboardCommand({ ...set, text: Buffer.alloc(16777217, 65) }),
    ProtocolError,
  );
  assert.throws(
    () => decodeClipboardCommand(Buffer.alloc(16777241)),
    ProtocolError,
  );
  for (const text of [
    empty,
    Buffer.from('a\rb\r\nc\nd'),
    Buffer.from('efbbbfefffff', 'hex').subarray(0, 3),
  ])
    assert.deepEqual(
      decodeClipboardCommand(encodeClipboardCommand({ ...set, text })).text,
      text,
    );
});
