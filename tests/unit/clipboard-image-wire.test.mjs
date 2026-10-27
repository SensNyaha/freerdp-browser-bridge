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
  encodeConnectionSettings,
  decodeBuild,
} from '../../packages/protocol/dist/index.js';

const inner = Buffer.from(
  '0001000000000002000000010000000812345678fedcba98',
  'hex',
);
const state = {
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
  html: true,
  remoteHtml: true,
  localHtmlAccepted: false,
  image: true,
  remoteImage: true,
  localImageAccepted: false,
};
const stateGolden = Buffer.from(
  '00040d8f0010000000000000000000010000000000000002',
  'hex',
);
const readGolden = Buffer.from(
  '000400060000000000000000000000010000000000000002',
  'hex',
);
const setGolden = Buffer.from(
  '000400070000000000000000000000010000000000000000' + inner.toString('hex'),
  'hex',
);
const read = {
  operation: 'read-image',
  generation: 1n,
  revision: 2n,
  text: Buffer.alloc(0),
};
const set = {
  operation: 'set-image',
  generation: 1n,
  revision: 0n,
  text: inner,
};
test('Image schema4: independent state golden preserves text/HTML and cannot impersonate older schemas', () => {
  assert.deepEqual(encodeClipboardState(state), stateGolden);
  assert.deepEqual(decodeClipboardState(stateGolden), state);
  for (const schema of [1, 2, 3, 5]) {
    const b = Buffer.from(stateGolden);
    b.writeUInt16BE(schema);
    assert.throws(() => decodeClipboardState(b), ProtocolError);
  }
  for (const flags of [0x098f, 0x2d8f]) {
    const b = Buffer.from(stateGolden);
    b.writeUInt16BE(flags, 2);
    assert.throws(() => decodeClipboardState(b), ProtocolError);
  }
});
test('Image schema4: direction revision selection and mutually exclusive local representation admission', () => {
  for (const patch of [
    { ready: false },
    { fromServer: false },
    { image: undefined },
    { image: false },
    { remoteImage: undefined },
    { localImageAccepted: undefined },
    { image: 'true' },
    { remoteImage: 1 },
    { localImageAccepted: true },
    { revision: 0n },
    { localAccepted: true, localImageAccepted: true, localHtmlAccepted: true },
  ])
    assert.throws(
      () => encodeClipboardState({ ...state, ...patch }),
      ProtocolError,
    );
  const imageOnly = {
    ...state,
    html: undefined,
    remoteHtml: undefined,
    localHtmlAccepted: undefined,
  };
  assert.equal(encodeClipboardState(imageOnly).readUInt16BE(0), 4);
  const local = { ...state, localAccepted: true, localImageAccepted: true };
  assert.deepEqual(decodeClipboardState(encodeClipboardState(local)), local);
});
test('Image schema4: read set result independent goldens and borrowed image payload', () => {
  assert.deepEqual(encodeClipboardCommand(read), readGolden);
  assert.deepEqual(encodeClipboardCommand(set), setGolden);
  const resultGolden = Buffer.concat([readGolden, inner]);
  assert.deepEqual(
    encodeClipboardResult({ ...read, status: 'accepted', text: inner }),
    resultGolden,
  );
  assert.deepEqual(decodeClipboardCommand(setGolden), set);
  const result = decodeClipboardResult(resultGolden);
  assert.equal(result.text.buffer, resultGolden.buffer);
  assert.equal(result.text.byteOffset, resultGolden.byteOffset + 24);
  assert.deepEqual(result.text, inner);
  for (const schema of [1, 2, 3, 5]) {
    const b = Buffer.from(setGolden);
    b.writeUInt16BE(schema);
    assert.throws(() => decodeClipboardCommand(b), ProtocolError);
  }
});
test('Image schema4: negative replies and non-read results cannot carry content or wrong identities', () => {
  for (const status of [
    'refused',
    'stale',
    'unavailable',
    'busy',
    'invalid',
    'timeout',
    'disconnected',
  ]) {
    assert.throws(
      () => encodeClipboardResult({ ...read, status, text: inner }),
      ProtocolError,
    );
    assert.equal(encodeClipboardResult({ ...read, status }).length, 24);
  }
  for (const command of [
    { ...read, text: inner },
    { ...read, revision: 0n },
    { ...set, revision: 1n },
    { ...set, text: inner.subarray(0, 23) },
    { ...set, text: Buffer.from('plain text') },
  ])
    assert.throws(() => encodeClipboardCommand(command), ProtocolError);
  assert.throws(
    () => encodeClipboardResult({ ...set, status: 'accepted' }),
    ProtocolError,
  );
});

test('Image negotiation: schema14 has an independent complete vector and does not imply HTML', () => {
  const value = {
    host: 'localhost',
    username: 'u',
    domain: '',
    port: 3389,
    width: 1024,
    height: 768,
    colorDepth: 32,
    security: 2,
    certificatePolicy: 1,
    minimumTls: 2,
    connectMs: 5000,
    tcpAckMs: 1000,
    clipboard: { toServer: true, fromServer: true, maximum: 1024, image: true },
  };
  const golden = Buffer.from([
    0,
    14,
    0,
    9,
    ...Buffer.from('localhost'),
    0,
    1,
    117,
    0,
    0,
    13,
    61,
    4,
    0,
    3,
    0,
    0,
    32,
    2,
    1,
    2,
    0,
    0,
    0,
    19,
    136,
    0,
    0,
    3,
    232,
    30,
    20,
    80,
    0,
    0,
    61,
    9,
    0,
    0,
    61,
    9,
    0,
    0,
    0,
    5,
    128,
    0,
    0,
    4,
    0,
    0,
    0,
    0,
    0,
    0,
  ]);
  assert.deepEqual(encodeConnectionSettings(value), golden);
  for (const image of [0, 1, 'true', null])
    assert.throws(
      () =>
        encodeConnectionSettings({
          ...value,
          clipboard: { ...value.clipboard, image },
        }),
      ProtocolError,
    );
  assert.equal(
    encodeConnectionSettings({
      ...value,
      clipboard: { ...value.clipboard, image: false },
    }).readUInt16BE(0),
    10,
  );
});

test('Image negotiation: HELLO extension512 requires connect text and revoke, old peers remain absent', () => {
  const strings = [
    '0.4.0',
    'synthetic',
    '3.32.1',
    '3.32.1',
    'fake',
    'x64',
    'framed-pipes',
  ].flatMap((s) => {
    const b = Buffer.from(s),
      n = Buffer.alloc(2);
    n.writeUInt16BE(b.length);
    return [n, b];
  });
  const hello = (extensions, capabilities = 5) => {
    const header = Buffer.alloc(4);
    header.writeUInt16BE(1);
    header.writeUInt16BE(capabilities, 2);
    const extension = Buffer.from([0, 1, 0, 0, 0, 0, 0, 0]);
    extension.writeUInt32BE(extensions, 4);
    return Buffer.concat([
      header,
      ...strings,
      ...(extensions === undefined ? [] : [extension]),
    ]);
  };
  assert.equal(decodeBuild(hello(536)).capabilities.clipboardImage, true);
  assert.equal(decodeBuild(hello(536)).capabilities.clipboardHtml, undefined);
  assert.equal(decodeBuild(hello(792)).capabilities.clipboardHtml, true);
  for (const extensions of [512, 520, 528, 1024])
    assert.throws(() => decodeBuild(hello(extensions)), ProtocolError);
  assert.throws(() => decodeBuild(hello(536, 1)), ProtocolError);
  assert.equal(
    decodeBuild(hello(undefined)).capabilities.clipboardImage,
    undefined,
  );
});
