import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeConnectionSettings,
  decodeBuild,
  validateClipboardText,
  ProtocolError,
} from '../../packages/protocol/dist/index.js';
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
};
test('clipboard settings: independent schema-10 vector, full direction word and legacy bytes', () => {
  assert.equal(
    encodeConnectionSettings({
      ...settings,
      clipboard: { toServer: true, fromServer: true, maximum: 1024 },
    }).toString('hex'),
    '000a00096c6f63616c686f737400017500000d3d0400030000200201020000001388000003e81e145000003d0900003d09000000018000000400',
  );
  for (const [toServer, fromServer, flags] of [
    [true, false, 128],
    [false, true, 256],
    [true, true, 384],
  ]) {
    const bytes = encodeConnectionSettings({
      ...settings,
      clipboard: { toServer, fromServer, maximum: 16777216 },
      pcmInput: true,
      opusOutput: true,
      audioBuffer200: true,
    });
    assert.equal(bytes.readUInt16BE(0), 10);
    assert.equal(bytes.readUInt32BE(bytes.length - 8), flags | 16 | 8 | 64);
    assert.equal(bytes.readUInt32BE(bytes.length - 4), 16777216);
  }
  assert.equal(encodeConnectionSettings(settings).readUInt16BE(0), 1);
  assert.equal(
    encodeConnectionSettings({ ...settings, pcmInput: true }).readUInt16BE(0),
    7,
  );
  for (const clipboard of [
    null,
    false,
    {},
    { toServer: false, fromServer: false, maximum: 1 },
    { toServer: 1, fromServer: true, maximum: 1 },
    ...[-1, 0, 1.5, 16777217, NaN].map((maximum) => ({
      toServer: true,
      fromServer: false,
      maximum,
    })),
  ])
    assert.throws(
      () => encodeConnectionSettings({ ...settings, clipboard }),
      ProtocolError,
    );
  assert.doesNotThrow(() =>
    encodeConnectionSettings({
      ...settings,
      clipboard: { toServer: true, fromServer: false, maximum: 1 },
    }),
  );
});
test('clipboard HELLO: optional versioned capability requires connection core and preserves legacy refusal', () => {
  const strings = [
    '0.1.0',
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
  const base = Buffer.concat([Buffer.from([0, 1, 0, 5]), ...strings]);
  assert.equal(decodeBuild(base).capabilities.clipboardText, false);
  assert.equal(decodeBuild(base).capabilities.clipboardRevoke, false);
  assert.equal(
    decodeBuild(Buffer.concat([base, Buffer.from([0, 1, 0, 0, 0, 0, 0, 24])]))
      .capabilities.clipboardRevoke,
    true,
  );
  assert.equal(
    decodeBuild(Buffer.concat([base, Buffer.from([0, 1, 0, 0, 0, 0, 0, 8])]))
      .capabilities.clipboardRevoke,
    false,
  );
  assert.equal(
    decodeBuild(Buffer.concat([base, Buffer.from([0, 1, 0, 0, 0, 0, 0, 8])]))
      .capabilities.clipboardText,
    true,
  );
  const absent = Buffer.from(base);
  absent.writeUInt16BE(1, 2);
  assert.throws(
    () =>
      decodeBuild(
        Buffer.concat([absent, Buffer.from([0, 1, 0, 0, 0, 0, 0, 8])]),
      ),
    ProtocolError,
  );
  assert.throws(
    () =>
      decodeBuild(
        Buffer.concat([base, Buffer.from([0, 1, 0, 0, 0, 0, 0, 16])]),
      ),
    ProtocolError,
  );
});
test('clipboard text quota: input bytes, Unicode terminator and CRLF expansion are checked without copying', () => {
  assert.doesNotThrow(() => validateClipboardText(Buffer.alloc(0), 2));
  assert.throws(() => validateClipboardText(Buffer.alloc(0), 1), ProtocolError);
  assert.doesNotThrow(() => validateClipboardText(Buffer.from('A'), 4));
  assert.throws(
    () => validateClipboardText(Buffer.from('A'), 3),
    ProtocolError,
  );
  assert.doesNotThrow(() => validateClipboardText(Buffer.from('\n'), 6));
  assert.throws(
    () => validateClipboardText(Buffer.from('\n'), 5),
    ProtocolError,
  );
  const input = Buffer.from('Ж😀');
  const before = Buffer.from(input);
  assert.doesNotThrow(() => validateClipboardText(input, 8));
  assert.throws(() => validateClipboardText(input, 7), ProtocolError);
  assert.deepEqual(input, before);
});
