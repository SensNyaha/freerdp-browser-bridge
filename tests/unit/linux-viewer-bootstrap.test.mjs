import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readLinuxViewerBootstrap } from '../../scripts/linux-viewer-bootstrap.mjs';

const bearer = 'a'.repeat(43);
test('Linux linked bootstrap helper refuses implicit or extra scenarios before server startup', () => {
  for (const args of [[], ['--other'], ['--linked-native', '--extra']]) {
    const result = spawnSync(
      process.execPath,
      ['scripts/test-linux-viewer-bootstrap.mjs', ...args],
      { encoding: 'utf8', timeout: 5000, windowsHide: true },
    );
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Use Node 24 --linked-native/);
  }
});
test('private Linux viewer bootstrap preserves legacy mode and explicitly selects HTML/carrier with wiped input', async () => {
  for (const value of [
    { bearer },
    { bearer, soak: true },
    { bearer, htmlClipboard: true },
    { bearer, htmlClipboard: true, ipcTransport: 'framed-pipes' },
  ]) {
    const input = Buffer.from(JSON.stringify(value)),
      chunks = [input.subarray(0, 7), input.subarray(7)];
    assert.deepEqual(await readLinuxViewerBootstrap(chunks), {
      bearer,
      soak: value.soak === true,
      htmlClipboard: value.htmlClipboard === true,
      ipcTransport: value.ipcTransport ?? 'auto',
    });
    assert.ok(input.every((byte) => byte === 0));
  }
});
test('private Linux viewer bootstrap rejects oversized/unknown/ambiguous selections without disclosing the bearer', async () => {
  const values = [
    null,
    [],
    {},
    { bearer: 'bad' },
    { bearer, extra: true },
    { bearer, soak: 'yes' },
    { bearer, htmlClipboard: 1 },
    { bearer, imageClipboard: 1 },
    { bearer, soak: true, imageClipboard: true },
    { bearer, htmlClipboard: true, imageClipboard: true },
    { bearer, soak: true, htmlClipboard: true },
    { bearer, ipcTransport: 'framed-pipes' },
    { bearer, htmlClipboard: true, ipcTransport: 'arbitrary' },
  ];
  for (const value of values) {
    const input = Buffer.from(JSON.stringify(value));
    await assert.rejects(readLinuxViewerBootstrap([input]), {
      message: 'Invalid Linux viewer bootstrap',
    });
    assert.ok(input.every((byte) => byte === 0));
  }
  for (const input of [
    Buffer.alloc(1025, 65),
    Buffer.from('{"bearer":"' + bearer),
  ]) {
    await assert.rejects(readLinuxViewerBootstrap([input]), {
      message: 'Invalid Linux viewer bootstrap',
    });
    assert.ok(input.every((byte) => byte === 0));
  }
  await assert.rejects(readLinuxViewerBootstrap(['unexpected text']), {
    message: 'Invalid Linux viewer bootstrap',
  });
});

test('private Linux image bootstrap selects only explicit image/carrier mode and wipes fragmented input', async () => {
  for (const ipcTransport of ['auto', 'framed-pipes']) {
    const input = Buffer.from(
      JSON.stringify({ bearer, imageClipboard: true, ipcTransport }),
    );
    assert.deepEqual(
      await readLinuxViewerBootstrap([
        input.subarray(0, 13),
        input.subarray(13),
      ]),
      {
        bearer,
        soak: false,
        htmlClipboard: false,
        imageClipboard: true,
        ipcTransport,
      },
    );
    assert.ok(input.every((value) => !value));
  }
});
