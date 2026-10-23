import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { scanSecretStream } from '../../scripts/secret-stream.mjs';

test('secret scan detects exact UTF8 and UTF16LE values across all stream splits without mutating caller patterns', async () => {
  for (const encoding of ['utf8', 'utf16le']) {
    const value = Buffer.from('synthetic-credential-λ', encoding);
    const bytes = Buffer.concat([
      Buffer.from('prefix'),
      value,
      Buffer.from('suffix'),
    ]);
    for (let i = 1; i < bytes.length; ++i)
      await assert.rejects(
        scanSecretStream(
          Readable.from([bytes.subarray(0, i), bytes.subarray(i)]),
          [value],
        ),
        { message: 'SECRET_SCAN_MATCH' },
      );
    assert.equal(value.toString(encoding), 'synthetic-credential-λ');
  }
});

test('secret scan retains only bounded overlap and counts nonmatching binary bytes', async () => {
  const pattern = Buffer.from('synthetic-credential');
  const blocks = Array.from({ length: 16 }, (_, i) => Buffer.alloc(65536, i));
  assert.deepEqual(await scanSecretStream(Readable.from(blocks), [pattern]), {
    bytes: 1048576,
  });
  assert.deepEqual(await scanSecretStream(Readable.from([]), [pattern]), {
    bytes: 0,
  });
});

test('secret scan rejects malformed patterns, oversized chunks and input budgets with fixed diagnostics', async () => {
  for (const patterns of [
    [],
    [Buffer.from('x')],
    [Buffer.alloc(8193)],
    Array.from({ length: 17 }, () => Buffer.from('fixture')),
  ])
    await assert.rejects(scanSecretStream(Readable.from([]), patterns), {
      message: 'SECRET_SCAN_INPUT',
    });
  for (const [blocks, maximum] of [
    [[Buffer.alloc(65537)], 100000],
    [[Buffer.alloc(8), Buffer.alloc(8)], 15],
  ])
    await assert.rejects(
      scanSecretStream(
        Readable.from(blocks),
        [Buffer.from('fixture')],
        maximum,
      ),
      { message: 'SECRET_SCAN_LIMIT' },
    );
  await assert.rejects(
    scanSecretStream(Readable.from(['synthetic-credential']), [
      Buffer.from('fixture'),
    ]),
    { message: 'SECRET_SCAN_LIMIT' },
  );
});

test('secret scan releases source iteration on a match and never forwards matched data', async () => {
  let retired = false;
  async function* source() {
    try {
      yield Buffer.from('synthetic-credential');
    } finally {
      retired = true;
    }
  }
  await assert.rejects(
    scanSecretStream(source(), [Buffer.from('synthetic-credential')]),
    { message: 'SECRET_SCAN_MATCH' },
  );
  assert.equal(retired, true);
});
