import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Kind,
  encodePacket,
  decodeHeader,
  encodeFileRecord,
  decodeFileRecord,
  decodeFilePage,
  validFileName,
  FILE_MAX_RECORD_BYTES,
  decodeBuild,
} from '../../packages/protocol/dist/index.js';
const command = (operation, fields = {}) => ({
  operation,
  status: 'ok',
  flags: 0,
  id: 0n,
  argument: 0n,
  value: 0n,
  data: Buffer.alloc(0),
  ...fields,
});
test('private file initialization has one explicit XRDP policy bit and all result flags stay zero', () => {
  const value = command('initialize', {
    flags: 1,
    id: 128n,
    argument: 64n,
    value: 4n,
  });
  const encoded = encodeFileRecord(value, false);
  assert.equal(
    encoded.toString('hex'),
    '00010001000000010000000000000080000000000000004000000000000000040000000000000000',
  );
  assert.deepEqual(decodeFileRecord(encoded, false), value);
  assert.throws(() => encodeFileRecord(value, true), {
    code: 'IPC_PROTOCOL_ERROR',
  });
  for (const flags of [2, 3, 65535])
    assert.throws(() => encodeFileRecord({ ...value, flags }, false), {
      code: 'IPC_PROTOCOL_ERROR',
    });
  assert.throws(
    () => encodeFileRecord(command('retire', { flags: 1 }), false),
    { code: 'IPC_PROTOCOL_ERROR' },
  );
});
test('file HELLO preserves legacy peers and distinguishes private files from RDP capability', () => {
  const build = (os, flag) => {
    const strings = [
      '0.5.0',
      'synthetic',
      '',
      '3.32.1',
      os,
      'x64',
      'framed-pipes',
    ].flatMap((value) => {
      const bytes = Buffer.from(value),
        length = Buffer.alloc(2);
      length.writeUInt16BE(bytes.length);
      return [length, bytes];
    });
    const base = Buffer.concat([Buffer.from([0, 1, 0, 1]), ...strings]);
    if (flag === undefined) return base;
    const extra = Buffer.alloc(8);
    extra.writeUInt16BE(1);
    extra.writeUInt32BE(flag, 4);
    return Buffer.concat([base, extra]);
  };
  for (const os of ['windows', 'linux']) {
    assert.equal(decodeBuild(build(os)).capabilities.fileService, undefined);
    const capabilities = decodeBuild(build(os, 1024)).capabilities;
    assert.equal(capabilities.fileService, true);
    assert.equal(capabilities.rdp, false);
    assert.equal(capabilities.connectCore, false);
    assert.throws(() => decodeBuild(build(os, 2048)));
  }
  assert.throws(() => decodeBuild(build('darwin', 1024)));
});
test('file IPC: fixed independent binary vector, borrowed data and canonical request fields', () => {
  const golden = Buffer.from(
    '000100030000000000000000000000010000000000000003000000000000000000000003000000000001ff',
    'hex',
  );
  const value = command('write', {
    id: 1n,
    argument: 3n,
    data: Buffer.from([0, 1, 255]),
  });
  assert.deepEqual(encodeFileRecord(value, false), golden);
  assert.deepEqual(decodeFileRecord(golden, false), value);
  const decoded = decodeFileRecord(golden, false);
  golden[40] = 7;
  assert.equal(decoded.data[0], 7);
  for (const invalid of [
    command('write'),
    command('read', { id: 1n, value: 65537n }),
    command('initialize', { id: 1n, argument: 2n }),
    command('initialize', { value: 65537n }),
    command('commit', { id: 1n, flags: 2 }),
    command('abort', { id: 1n, argument: 1n }),
    command('retire', { id: 1n }),
    command('list', { value: 0n }),
    command('list', { value: 65n }),
    command('write', {
      id: 1n,
      argument: (1n << 63n) - 1n,
      data: Buffer.from([1]),
    }),
    command('write', { id: 1n, data: Buffer.alloc(65537) }),
    command('mkdir', { data: Buffer.alloc(256) }),
    command('read', { id: -1n, value: 1n }),
    command('read', { id: 1, value: 1n }),
  ])
    assert.throws(() => encodeFileRecord(invalid, false), {
      code: 'IPC_PROTOCOL_ERROR',
    });
  for (const at of [0, 3, 4, 6, 32, 36]) {
    const bad = encodeFileRecord(value, false);
    bad[at] = 255;
    assert.throws(() => decodeFileRecord(bad, false), {
      code: 'IPC_PROTOCOL_ERROR',
    });
  }
  for (const size of [0, 39, 40, 41, 42])
    assert.throws(() => decodeFileRecord(golden.subarray(0, size), false), {
      code: 'IPC_PROTOCOL_ERROR',
    });
});
test('file IPC: outer envelope rejects oversized or uncorrelated content before body allocation', () => {
  for (const kind of [Kind.FileCommand, Kind.FileResult]) {
    const valid = encodePacket({
      kind,
      requestId: 1n,
      payload: Buffer.alloc(FILE_MAX_RECORD_BYTES),
    }).subarray(0, 24);
    assert.equal(decodeHeader(valid).length, FILE_MAX_RECORD_BYTES);
    for (const length of [0, 39, FILE_MAX_RECORD_BYTES + 1, 0xffffffff]) {
      const bad = Buffer.from(valid);
      bad.writeUInt32BE(length, 20);
      assert.throws(() => decodeHeader(bad));
    }
    const zero = Buffer.from(valid);
    zero.writeBigUInt64BE(0n, 12);
    assert.throws(() => decodeHeader(zero));
  }
});
test('file IPC: listing validates entry bounds, Unicode and portable names without accepting paths', () => {
  const name = 'Привет 日本語 😀.txt';
  assert.equal(validFileName(name), true);
  for (const value of [
    '../a',
    'a/b',
    'a\\b',
    'CON',
    'com0.txt',
    'LPT¹',
    'CONOUT$.txt',
    'new.',
    'new ',
    '\ud800',
    'a\0b',
    'a'.repeat(256),
  ])
    assert.equal(validFileName(value), false);
  const title = Buffer.from(name),
    body = Buffer.alloc(32 + title.length);
  body.writeBigUInt64BE(2n);
  body.writeBigUInt64BE(1n, 8);
  body.writeBigUInt64BE(3n, 16);
  body.writeUInt16BE(title.length, 26);
  title.copy(body, 32);
  const page = command('list', { argument: 1n, data: body });
  const result = decodeFileRecord(encodeFileRecord(page, true), true);
  assert.deepEqual(decodeFilePage(result), [
    { id: 2n, parent: 1n, bytes: 3n, directory: false, name },
  ]);
  for (const index of [0, 24, 26, 28, 32]) {
    const bad = Buffer.from(body);
    bad[index] = 255;
    if (index === 0) bad.fill(0, 0, 8);
    assert.throws(() => encodeFileRecord({ ...page, data: bad }, true));
  }
  assert.throws(() => encodeFileRecord({ ...page, argument: 65n }, true));
  assert.throws(() =>
    encodeFileRecord(
      { ...page, data: Buffer.concat([body, Buffer.from([1])]) },
      true,
    ),
  );
});
