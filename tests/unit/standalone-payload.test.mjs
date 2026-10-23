import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { resolve, join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import {
  standalonePayloadInventory,
  readStandalonePayloadFile,
} from '../../scripts/standalone/payload.mjs';

test('standalone payload inventories real bytes and refuses links, truncation bounds and nonregular files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bridge-standalone-inventory-'));
  try {
    const nested = join(root, 'nested');
    await mkdir(nested);
    await writeFile(join(nested, 'public.txt'), 'synthetic public bytes');
    assert.deepEqual(await standalonePayloadInventory(root), [
      {
        path: 'nested/public.txt',
        bytes: 22,
        sha256: createHash('sha256')
          .update('synthetic public bytes')
          .digest('hex'),
      },
    ]);
    assert.equal(
      (
        await readStandalonePayloadFile(join(nested, 'public.txt'), 22)
      ).toString(),
      'synthetic public bytes',
    );
    await assert.rejects(
      readStandalonePayloadFile(join(nested, 'public.txt'), 21),
      /STANDALONE_PAYLOAD_INVALID/,
    );
    await assert.rejects(readStandalonePayloadFile(nested, 65536));
    const link = join(root, 'link');
    await symlink(
      nested,
      link,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await assert.rejects(
      standalonePayloadInventory(root),
      /STANDALONE_PAYLOAD_INVALID/,
    );
    await rm(link, { force: true });
    const bins = join(root, 'service/node_modules/.bin');
    await mkdir(bins, { recursive: true });
    await symlink(
      nested,
      join(bins, 'alias'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    assert.equal(
      (await standalonePayloadInventory(root, { omitNpmBins: true })).length,
      1,
    );
    await assert.rejects(
      standalonePayloadInventory(root),
      /STANDALONE_PAYLOAD_INVALID/,
    );
    await rm(join(bins, 'alias'), { force: true });
    let deep = root;
    for (let index = 0; index < 33; ++index) {
      deep = join(deep, 'd');
      await mkdir(deep);
    }
    await assert.rejects(
      standalonePayloadInventory(root),
      /STANDALONE_PAYLOAD_INVALID/,
    );
  } finally {
    assert.equal(dirname(root), resolve(tmpdir()));
    assert.match(basename(root), /^bridge-standalone-inventory-[A-Za-z0-9]+$/);
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
});
