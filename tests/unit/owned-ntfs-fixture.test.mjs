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
  copyFile,
  unlink,
  rmdir,
  open,
} from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

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
const windowsImage = process.env.BRIDGE_TEST_WINDOWS_VHD_INPUT;
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
  'PowerShell inspector accepts the real offline VHD and refuses changed provenance or corrupt bytes without mounting',
  { skip: process.platform !== 'win32' || !windowsImage, timeout: 30000 },
  async () => {
    const source = await realpath(windowsImage);
    const meta = JSON.parse(
      await readFile(join(source, 'volume.json'), 'utf8'),
    );
    const inspect = (directory) =>
      spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-File',
          resolve('tests/fixtures/windows-owned-full-volume.ps1'),
          '-ImageDirectory',
          directory,
          '-InspectOnly',
        ],
        options,
      );
    const good = inspect(source);
    assert.equal(good.status, 0);
    assert.deepEqual(JSON.parse(good.stdout), {
      inspected: true,
      diskBytes: 16777216,
      fixedVhd: true,
      ntfs: true,
      mounted: false,
      sha256: meta.sha256,
    });
    const build = await realpath('build');
    const root = await mkdtemp(join(build, 'owned-vhd-guard-'));
    const image = join(root, 'owned-full.vhd');
    try {
      await copyFile(join(source, 'owned-full.vhd'), image);
      for (const changed of [
        { ...meta, sourceDeviceOpened: true },
        { ...meta, diskBytes: 33554432 },
        { ...meta, sha256: '0'.repeat(64) },
      ]) {
        await writeFile(join(root, 'volume.json'), JSON.stringify(changed));
        const result = inspect(root);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /OWNED_VHD_REFUSED/);
      }
      const file = await open(image, 'r+');
      try {
        await file.write(Buffer.from([1]), 0, 1, 16777727);
      } finally {
        await file.close();
      }
      const corrupt = createHash('sha256')
        .update(await readFile(image))
        .digest('hex');
      assert.notEqual(corrupt, meta.sha256);
      await writeFile(
        join(root, 'volume.json'),
        JSON.stringify({ ...meta, sha256: corrupt }),
      );
      const result = inspect(root);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /OWNED_VHD_REFUSED/);
      assert.equal(
        createHash('sha256')
          .update(await readFile(join(source, 'owned-full.vhd')))
          .digest('hex'),
        meta.sha256,
      );
      assert.deepEqual((await readdir(root)).sort(), [
        'owned-full.vhd',
        'volume.json',
      ]);
    } finally {
      assert.equal(await realpath(root), root);
      assert.equal(dirname(root), build);
      assert.match(basename(root), /^owned-vhd-guard-[A-Za-z0-9]+$/);
      for (const name of ['owned-full.vhd', 'volume.json'])
        await unlink(join(root, name));
      await rmdir(root);
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
