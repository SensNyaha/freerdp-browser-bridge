import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  symlink,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkerProcess } from '../../packages/node-bridge/dist/index.js';

const linux = { skip: process.platform !== 'linux' };
class ObservedWorker extends WorkerProcess {
  spawnAttempts = 0;
  spawnWorker() {
    ++this.spawnAttempts;
    throw new Error('Synthetic spawn boundary');
  }
}
async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'bridge-root-admission-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
function worker(runtimeRoot) {
  return new ObservedWorker({
    workerPath: process.execPath,
    runtimeRoot,
    ipcTransport: 'framed-pipes',
  });
}

for (const mode of [0o777, 0o770])
  test(
    `Linux runtime admission: mode ${mode.toString(8)} refuses before session creation or spawn`,
    linux,
    async () => {
      await fixture(async (root) => {
        const runtime = join(root, 'runtime');
        await mkdir(runtime);
        await chmod(runtime, mode);
        const instance = worker(runtime);
        try {
          await assert.rejects(instance.start(), {
            code: 'RUNTIME_DIRECTORY_REFUSED',
          });
          assert.equal(instance.spawnAttempts, 0);
          assert.equal((await lstat(runtime)).mode & 0o777, mode);
          assert.deepEqual(await readdir(runtime), []);
        } finally {
          await instance.close();
        }
      });
    },
  );

test(
  'Linux runtime admission: a root symlink is refused without touching its target',
  linux,
  async () => {
    await fixture(async (root) => {
      const target = join(root, 'target');
      const runtime = join(root, 'runtime');
      await mkdir(target, { mode: 0o700 });
      await symlink(target, runtime);
      const instance = worker(runtime);
      try {
        await assert.rejects(instance.start(), {
          code: 'RUNTIME_DIRECTORY_REFUSED',
        });
        assert.equal(instance.spawnAttempts, 0);
        assert.equal((await lstat(runtime)).isSymbolicLink(), true);
        assert.deepEqual(await readdir(target), []);
      } finally {
        await instance.close();
      }
    });
  },
);

test(
  'Linux runtime admission: a safe owned root reaches the spawn boundary and owned session cleanup',
  linux,
  async () => {
    await fixture(async (root) => {
      const runtime = join(root, 'runtime');
      const instance = worker(runtime);
      try {
        await assert.rejects(instance.start(), { code: 'WORKER_START_FAILED' });
        assert.equal(instance.spawnAttempts, 1);
        assert.equal((await lstat(runtime)).mode & 0o777, 0o700);
        assert.deepEqual(await readdir(runtime), []);
      } finally {
        await instance.close();
      }
    });
  },
);

test(
  'Linux runtime admission: an actual foreign-UID fixture is refused before spawn',
  {
    skip:
      process.platform !== 'linux' ||
      !process.env.BRIDGE_TEST_FOREIGN_RUNTIME_ROOT,
  },
  async () => {
    const runtime = process.env.BRIDGE_TEST_FOREIGN_RUNTIME_ROOT;
    const before = await lstat(runtime);
    assert.notEqual(before.uid, process.getuid());
    const instance = worker(runtime);
    try {
      await assert.rejects(instance.start(), {
        code: 'RUNTIME_DIRECTORY_REFUSED',
      });
      assert.equal(instance.spawnAttempts, 0);
      const after = await lstat(runtime);
      assert.equal(after.uid, before.uid);
      assert.equal(after.mode, before.mode);
      assert.equal(after.ino, before.ino);
    } finally {
      await instance.close();
    }
  },
);
