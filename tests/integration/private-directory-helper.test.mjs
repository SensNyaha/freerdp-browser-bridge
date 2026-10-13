import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  readdir,
  rm,
} from 'node:fs/promises';
import { resolve, join, relative, isAbsolute } from 'node:path';

const execute = promisify(execFile);
const helper = resolve(
  process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
  'rdp-runtime-directory.exe',
);
async function run(args) {
  try {
    const result = await execute(helper, args, {
      windowsHide: true,
      timeout: 5000,
      maxBuffer: 128,
      encoding: 'utf8',
      env: { SystemRoot: process.env.SystemRoot, PATH: '' },
    });
    return { ...result, code: 0 };
  } catch (error) {
    assert.equal(typeof error.code, 'number');
    return { stdout: error.stdout, stderr: error.stderr, code: error.code };
  }
}
async function fixture(body) {
  const build = resolve('build');
  await mkdir(build, { recursive: true });
  const directory = await mkdtemp(join(build, 'private-directory-cli-'));
  const within = relative(build, resolve(directory));
  assert.ok(within && !within.startsWith('..') && !isAbsolute(within));
  try {
    await body(directory);
  } finally {
    // Only this verified new test subtree; helper never creates links or repairs ACLs.
    await rm(directory, { recursive: true, force: true });
  }
}
test(
  'native directory helper: UTF16 creation and collision preserve bounded nonsecret results',
  { skip: process.platform !== 'win32' },
  async () =>
    fixture(async (root) => {
      const directory = join(root, 'каталог с пробелами');
      const created = await run(['--create-private-directory', directory]);
      assert.equal(created.code, 0);
      assert.equal(created.stderr, '');
      assert.deepEqual(JSON.parse(created.stdout), {
        v: 1,
        created: true,
        error: 0,
      });
      assert.equal(created.stdout.includes(directory), false);
      await writeFile(join(directory, 'sentinel'), 'fixture-data');
      const duplicate = await run(['--create-private-directory', directory]);
      assert.equal(duplicate.code, 1);
      assert.deepEqual(JSON.parse(duplicate.stdout), {
        v: 1,
        created: false,
        error: 183,
      });
      assert.equal(
        await readFile(join(directory, 'sentinel'), 'utf8'),
        'fixture-data',
      );
    }),
);
test(
  'native directory helper: invalid command grammar performs no filesystem operation',
  { skip: process.platform !== 'win32' },
  async () =>
    fixture(async (root) => {
      const directory = join(root, 'absent');
      for (const args of [
        [],
        ['--create-private-directory'],
        ['--unknown', directory],
        ['--create-private-directory', directory, 'extra'],
      ]) {
        const result = await run(args);
        assert.deepEqual(result, { stdout: '', stderr: '', code: 2 });
      }
      assert.deepEqual(await readdir(root), []);
    }),
);
test(
  'native directory helper: invalid paths and file parents refuse without fallback or repair',
  { skip: process.platform !== 'win32' },
  async () =>
    fixture(async (root) => {
      const file = join(root, 'file');
      await writeFile(file, 'unchanged');
      for (const path of ['relative-directory', join(file, 'child')]) {
        const result = await run(['--create-private-directory', path]);
        assert.equal(result.code, 1);
        assert.deepEqual(JSON.parse(result.stdout), {
          v: 1,
          created: false,
          error: 123,
        });
        assert.equal(result.stderr, '');
      }
      assert.equal(await readFile(file, 'utf8'), 'unchanged');
      assert.deepEqual(await readdir(root), ['file']);
    }),
);
