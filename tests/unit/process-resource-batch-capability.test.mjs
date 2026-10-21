import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeBuild,
  ProtocolError,
} from '../../packages/protocol/dist/index.js';

function build(os = 'windows', extension) {
  const header = Buffer.from([0, 1, 0, 1]);
  const strings = [
    '0.1.0',
    'fixture',
    '',
    '3.32.1',
    os,
    'x64',
    'framed-pipes',
  ].flatMap((value) => {
    const bytes = Buffer.from(value),
      size = Buffer.alloc(2);
    size.writeUInt16BE(bytes.length);
    return [size, bytes];
  });
  const suffix = Buffer.alloc(extension === undefined ? 0 : 8);
  if (suffix.length) {
    suffix.writeUInt16BE(1);
    suffix.writeUInt32BE(extension, 4);
  }
  return Buffer.concat([header, ...strings, suffix]);
}

test('Windows host batch capability is independent of RDP and absent for legacy peers', () => {
  for (const extension of [undefined, 0]) {
    const report = decodeBuild(build('windows', extension));
    assert.equal(
      Object.hasOwn(report.capabilities, 'processResourceBatch'),
      false,
    );
  }
  const report = decodeBuild(build('windows', 128));
  assert.equal(report.capabilities.processResourceBatch, true);
  assert.equal(report.capabilities.connectCore, false);
  assert.equal(report.freeRdpVersion, null);
});

test('host batch extension refuses other platforms, unknown bits and malformed suffixes', () => {
  for (const os of ['linux', 'macos', '', 'Windows'])
    assert.throws(() => decodeBuild(build(os, 128)), ProtocolError);
  for (const bits of [256, 384, 0x80000000, 129, 192])
    assert.throws(() => decodeBuild(build('windows', bits)), ProtocolError);
  const bytes = build('windows', 128);
  for (const malformed of [
    bytes.subarray(0, -1),
    Buffer.concat([bytes, Buffer.of(0)]),
  ])
    assert.throws(() => decodeBuild(malformed), ProtocolError);
  for (const offset of [bytes.length - 7, bytes.length - 5]) {
    const malformed = Buffer.from(bytes);
    malformed[offset] = 2;
    assert.throws(() => decodeBuild(malformed), ProtocolError);
  }
});
