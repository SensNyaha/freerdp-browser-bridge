import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rmdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename, dirname, sep } from 'node:path';
import { disposableLinuxFullRoot } from '../fixtures/disposable-full-root.mjs';

const refusal = { code: 'DISPOSABLE_FULL_ROOT_REFUSED' };

async function removeScratch(root) {
  assert.equal(await realpath(root), root);
  assert.equal(dirname(root), await realpath(tmpdir()));
  assert.match(basename(root), /^bridge-full-(?:guard|link)-[A-Za-z0-9]+$/);
  await rm(root, { recursive: true, force: true });
}

test('full-disk admission refuses malformed/relative input before filesystem access', async () => {
  for (const input of [
    undefined,
    null,
    {},
    1,
    '',
    '.',
    '../full',
    'a'.repeat(4097),
  ])
    await assert.rejects(disposableLinuxFullRoot(input), refusal);
});

test('full-disk admission never fills or changes an ordinary temporary directory', async () => {
  const root = await mkdtemp(
    join(await realpath(tmpdir()), 'bridge-full-guard-'),
  );
  try {
    await writeFile(join(root, 'sentinel'), 'owned sentinel');
    await assert.rejects(disposableLinuxFullRoot(root), refusal);
    assert.deepEqual(await readdir(root), ['sentinel']);
    assert.equal(
      await readFile(join(root, 'sentinel'), 'utf8'),
      'owned sentinel',
    );
    const noncanonical = root + sep + '..' + sep + basename(root);
    await assert.rejects(disposableLinuxFullRoot(noncanonical), refusal);
    assert.deepEqual(await readdir(root), ['sentinel']);
  } finally {
    await removeScratch(root);
  }
});

test(
  'full-disk admission refuses an owned symlink without changing its target',
  { skip: process.platform !== 'linux' },
  async () => {
    const root = await mkdtemp(
      join(await realpath(tmpdir()), 'bridge-full-link-'),
    );
    const link = join(root, 'alias');
    try {
      await symlink(root, link);
      await assert.rejects(disposableLinuxFullRoot(link), refusal);
      assert.deepEqual(await readdir(root), ['alias']);
    } finally {
      await removeScratch(root);
    }
  },
);

test(
  'full-disk admission refuses a subtree of the bounded mount without touching siblings',
  {
    skip:
      process.platform !== 'linux' || !process.env.BRIDGE_FILE_TEST_FULL_ROOT,
  },
  async () => {
    const root = process.env.BRIDGE_FILE_TEST_FULL_ROOT;
    await disposableLinuxFullRoot(root);
    const nested = await mkdtemp(join(root, 'bridge-full-subtree-'));
    try {
      await assert.rejects(disposableLinuxFullRoot(nested), refusal);
      assert.deepEqual(await readdir(nested), []);
      assert.deepEqual(await readdir(root), [basename(nested)]);
    } finally {
      assert.equal(dirname(nested), root);
      await rmdir(nested);
    }
  },
);

test(
  'full-disk admission accepts only the explicitly provisioned empty private bounded tmpfs',
  {
    skip:
      process.platform !== 'linux' || !process.env.BRIDGE_FILE_TEST_FULL_ROOT,
  },
  async () => {
    const root = process.env.BRIDGE_FILE_TEST_FULL_ROOT;
    assert.equal(dirname(root) === root, false);
    const before = await readdir(root);
    const result = await disposableLinuxFullRoot(root);
    assert.ok(result.mountedBytes >= 131072 && result.mountedBytes <= 1048576);
    assert.deepEqual(await readdir(root), before);
  },
);
