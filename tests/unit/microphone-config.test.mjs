import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeConnectionSettings,
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
test('private microphone settings: schema-7 golden bytes preserve independent output and old selection', () => {
  const bytes = encodeConnectionSettings({ ...settings, pcmInput: true });
  assert.equal(
    bytes.toString('hex'),
    '000700096c6f63616c686f737400017500000d3d0400030000200201020000001388000003e8' +
      '1e145000003d0900003d090000000010',
  );
  for (const output of ['off', 'pcm', 'opus']) {
    const record = encodeConnectionSettings({
      ...settings,
      pcmInput: true,
      dynamicResolution: true,
      touch: true,
      pcmOutput: output === 'pcm',
      opusOutput: output === 'opus',
    });
    assert.equal(record.readUInt16BE(0), 7);
    assert.equal(
      record.readUInt32BE(record.length - 4),
      19 | (output === 'pcm' ? 4 : output === 'opus' ? 8 : 0),
    );
  }
  assert.equal(encodeConnectionSettings(settings).readUInt16BE(0), 1);
  assert.deepEqual(
    encodeConnectionSettings({ ...settings, pcmInput: false }),
    encodeConnectionSettings(settings),
  );
  assert.equal(
    encodeConnectionSettings({
      ...settings,
      opusOutput: true,
      pcmInput: false,
    }).readUInt16BE(0),
    6,
  );
});
test('private microphone settings: nonboolean input and mixed output reject before encoding', () => {
  for (const pcmInput of [0, 1, 'true', null, {}])
    assert.throws(
      () => encodeConnectionSettings({ ...settings, pcmInput }),
      ProtocolError,
    );
  assert.throws(
    () =>
      encodeConnectionSettings({
        ...settings,
        pcmInput: true,
        pcmOutput: true,
        opusOutput: true,
      }),
    ProtocolError,
  );
});
