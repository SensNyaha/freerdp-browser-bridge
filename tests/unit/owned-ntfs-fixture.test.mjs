import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const python = process.platform === 'win32' ? 'python' : 'python3';
const options = {
  encoding: 'utf8',
  timeout: 10000,
  maxBuffer: 8192,
  windowsHide: true,
  env: Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      ['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP'].includes(
        key.toUpperCase(),
      ),
    ),
  ),
};
const available = spawnSync(python, ['-I', '--version'], options).status === 0;
const script = resolve('tests/fixtures/create-owned-ntfs-vhd.py');
async function scratch() {
  return mkdtemp(join(await realpath(tmpdir()), 'bridge-vhd-refusal-'));
}
async function remove(root) {
  assert.equal(await realpath(root), root);
  assert.equal(dirname(root), await realpath(tmpdir()));
  assert.match(basename(root), /^bridge-vhd-refusal-[A-Za-z0-9]+$/);
  await rm(root, { recursive: true, force: true });
}

test(
  'offline NTFS generator refuses Windows before creating or formatting any file',
  { skip: process.platform !== 'win32' || !available },
  async () => {
    const root = await scratch();
    try {
      const result = spawnSync(python, ['-I', '-B', script], {
        ...options,
        cwd: root,
      });
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.deepEqual(await readdir(root), []);
    } finally {
      await remove(root);
    }
  },
);

test(
  'offline NTFS generator refuses a symlinked build directory and preserves its target',
  { skip: process.platform !== 'linux' || !available },
  async () => {
    const root = await scratch(),
      target = await scratch();
    try {
      await writeFile(join(target, 'sentinel'), 'owned fixture sentinel');
      await symlink(target, join(root, 'build'));
      const result = spawnSync(python, ['-I', '-B', script], {
        ...options,
        cwd: root,
      });
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.deepEqual(await readdir(target), ['sentinel']);
      assert.equal(
        await readFile(join(target, 'sentinel'), 'utf8'),
        'owned fixture sentinel',
      );
      assert.deepEqual(await readdir(root), ['build']);
    } finally {
      await remove(root);
      await remove(target);
    }
  },
);
