import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ProtocolError,
  encodeClipboardCommand,
  decodeClipboardCommand,
  encodeClipboardResult,
  decodeClipboardResult,
  encodeClipboardState,
  decodeClipboardState,
  encodeConnectionSettings,
  decodeBuild,
} from '../../packages/protocol/dist/index.js';

const item = Buffer.from(
  '00010001000000080000000100000000000000080000000000000000000000003c623e583c2f623e58',
  'hex',
);
const read = Buffer.from(
  '000300040000000000000000000000010000000000000002',
  'hex',
);
const state = Buffer.from(
  '0003018f0010000000000000000000010000000000000002',
  'hex',
);
test('HTML schema3 commands have independent vectors and preserve schema1/2 refusal', () => {
  const get = {
    operation: 'read-html',
    generation: 1n,
    revision: 2n,
    text: Buffer.alloc(0),
  };
  assert.deepEqual(encodeClipboardCommand(get), read);
  assert.deepEqual(decodeClipboardCommand(read), get);
  const set = Buffer.concat([
    Buffer.from('000300050000000000000000000000010000000000000000', 'hex'),
    item,
  ]);
  assert.deepEqual(
    encodeClipboardCommand({
      operation: 'set-html',
      generation: 1n,
      revision: 0n,
      text: item,
    }),
    set,
  );
  assert.deepEqual(encodeClipboardCommand(decodeClipboardCommand(set)), set);
  const result = Buffer.concat([read, item]);
  assert.deepEqual(
    encodeClipboardResult({ ...get, status: 'accepted', text: item }),
    result,
  );
  assert.deepEqual(
    encodeClipboardResult(decodeClipboardResult(result)),
    result,
  );
  for (const bytes of [read, set, result])
    for (const schema of [0, 1, 2, 4]) {
      const bad = Buffer.from(bytes);
      bad.writeUInt16BE(schema);
      assert.throws(() => decodeClipboardCommand(bad), ProtocolError);
      assert.throws(() => decodeClipboardResult(bad), ProtocolError);
    }
  for (const operation of ['read-html', 'set-html'])
    for (const status of [
      'refused',
      'stale',
      'unavailable',
      'busy',
      'invalid',
      'timeout',
      'disconnected',
    ]) {
      const value = {
        operation,
        status,
        generation: 1n,
        revision: operation === 'read-html' ? 2n : 0n,
        text: Buffer.alloc(0),
      };
      assert.deepEqual(
        decodeClipboardResult(encodeClipboardResult(value)),
        value,
      );
      assert.throws(
        () => encodeClipboardResult({ ...value, text: item }),
        ProtocolError,
      );
    }
  const contextual = Buffer.from(item);
  contextual[3] |= 2;
  assert.throws(
    () =>
      encodeClipboardCommand({
        operation: 'set-html',
        generation: 1n,
        revision: 0n,
        text: contextual,
      }),
    ProtocolError,
  );
  assert.doesNotThrow(() =>
    encodeClipboardResult({ ...get, status: 'accepted', text: contextual }),
  );
});
test('HTML schema3 scalar flags require explicit selection, revision and matching directions', () => {
  const parsed = decodeClipboardState(state);
  assert.equal(parsed.html, true);
  assert.equal(parsed.remoteHtml, true);
  assert.equal(parsed.localHtmlAccepted, false);
  assert.deepEqual(encodeClipboardState(parsed), state);
  for (const delta of [
    { html: undefined },
    { ready: false },
    { fromServer: false },
    { revision: 0n },
    { localHtmlAccepted: true },
  ])
    assert.throws(
      () => encodeClipboardState({ ...parsed, ...delta }),
      ProtocolError,
    );
  for (const flags of [0, 127, 1024, 65535]) {
    const bad = Buffer.from(state);
    bad.writeUInt16BE(flags, 2);
    assert.throws(() => decodeClipboardState(bad), ProtocolError);
  }
});
test('HTML CONFIGURE schema13 retains required zero performance/IP tails and composes with both', () => {
  const settings = {
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
    clipboard: { toServer: true, fromServer: true, maximum: 1024, html: true },
  };
  const golden =
    '000d00096c6f63616c686f737400017500000d3d0400030000200201020000001388000003e8' +
    '1e145000003d0900003d0900' +
    '00000380' +
    '00000400' +
    '0000' +
    '000000';
  assert.equal(encodeConnectionSettings(settings).toString('hex'), golden);
  const composed = encodeConnectionSettings({
    ...settings,
    performance: { mask: 3, values: 2 },
    ip: { mask: 3, preferIPv6: 1, forceIpVersion: 6 },
  });
  assert.equal(composed.subarray(-5).toString('hex'), '0302030106');
  for (const html of [null, 1, 'yes'])
    assert.throws(
      () =>
        encodeConnectionSettings({
          ...settings,
          clipboard: { ...settings.clipboard, html },
        }),
      ProtocolError,
    );
  assert.equal(
    encodeConnectionSettings({
      ...settings,
      clipboard: { ...settings.clipboard, html: false },
    }).readUInt16BE(0),
    10,
  );
});
test('HTML HELLO requires both text and revoke and leaves the flag absent on old peers', () => {
  const strings = [
    '0.3.0',
    'synthetic',
    '3.32.1',
    '3.32.1',
    'linux',
    'x64',
    'framed-pipes',
  ].flatMap((value) => {
    const bytes = Buffer.from(value),
      length = Buffer.alloc(2);
    length.writeUInt16BE(bytes.length);
    return [length, bytes];
  });
  const base = Buffer.concat([Buffer.from([0, 1, 0, 5]), ...strings]);
  const build = (flags) => {
    const extra = Buffer.alloc(8);
    extra.writeUInt16BE(1);
    extra.writeUInt32BE(flags, 4);
    return Buffer.concat([base, extra]);
  };
  assert.equal(decodeBuild(base).capabilities.clipboardHtml, undefined);
  assert.equal(decodeBuild(build(280)).capabilities.clipboardHtml, true);
  assert.equal(decodeBuild(build(792)).capabilities.clipboardHtml, true);
  assert.equal(decodeBuild(build(792)).capabilities.clipboardImage, true);
  assert.equal(decodeBuild(build(1048)).capabilities.fileService, true);
  assert.equal(decodeBuild(build(1048)).capabilities.clipboardHtml, undefined);
  assert.equal(decodeBuild(build(1816)).capabilities.clipboardHtml, true);
  assert.equal(decodeBuild(build(1816)).capabilities.fileService, true);
  for (const flags of [256, 264, 272, 512, 2072, 2840])
    assert.throws(() => decodeBuild(build(flags)), ProtocolError);
});
