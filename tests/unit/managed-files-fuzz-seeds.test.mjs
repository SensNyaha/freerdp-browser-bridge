import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Kind,
  HEADER_BYTES,
  FILE_MAX_RECORD_BYTES,
  decodeHeader,
  decodeFileRecord,
} from '../../packages/protocol/dist/index.js';

test('managed-file fuzz corpus reaches schema15 and maximum command/result envelopes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bridge-managed-fuzz-'));
  const canonical = await realpath(root);
  assert.equal(dirname(canonical), await realpath(tmpdir()));
  assert.ok(basename(canonical).startsWith('bridge-managed-fuzz-'));
  try {
    await promisify(execFile)(
      process.execPath,
      [fileURLToPath(new URL('../../scripts/seed-fuzz.mjs', import.meta.url))],
      { cwd: root, timeout: 15000, maxBuffer: 65536, windowsHide: true },
    );
    const read = async (name) => {
      const bytes = await readFile(join(root, 'build/fuzz/corpus', name));
      const header = decodeHeader(bytes.subarray(0, HEADER_BYTES));
      assert.equal(bytes.length, HEADER_BYTES + header.length);
      assert.equal(header.requestId, 1n);
      return { header, payload: bytes.subarray(HEADER_BYTES), bytes };
    };
    const config = await read('configure-managed-drives-maximum');
    assert.equal(config.header.kind, Kind.Configure);
    assert.equal(config.payload.readUInt16BE(0), 15);
    assert.ok(config.payload.length > 8192 && config.payload.length <= 16384);
    for (const [name, response, operation] of [
      ['initialize', false, 'initialize'],
      ['initialize-xrdp', false, 'initialize'],
      ['mkdir-unicode', false, 'mkdir'],
      ['write-maximum', false, 'write'],
      ['read-maximum', true, 'read'],
      ['list-empty', true, 'list'],
      ['remove-denied', true, 'remove'],
    ]) {
      const { header, payload, bytes } = await read('files-' + name);
      assert.equal(header.kind, response ? Kind.FileResult : Kind.FileCommand);
      const value = decodeFileRecord(payload, response);
      assert.equal(value.operation, operation);
      assert.equal(value.status, name === 'remove-denied' ? 'denied' : 'ok');
      assert.equal(value.flags, name === 'initialize-xrdp' ? 1 : 0);
      if (name.endsWith('maximum')) {
        assert.equal(payload.length, FILE_MAX_RECORD_BYTES);
        assert.equal(bytes.length, 65600);
        assert.equal(value.data.length, 65536);
        assert.ok(value.data.every((v) => v === (response ? 0xa5 : 0x5a)));
      }
      if (operation === 'mkdir')
        assert.equal(value.data.toString('utf8'), 'Ж日本語😀');
    }
  } finally {
    assert.equal(await realpath(root), canonical);
    await rm(canonical, { recursive: true });
  }
});
