import test from 'node:test';
import assert from 'node:assert/strict';
import {
  copyFile,
  mkdir,
  mkdtemp,
  realpath,
  readdir,
  rm,
} from 'node:fs/promises';
import { basename, dirname, join, toNamespacedPath } from 'node:path';
import { tmpdir } from 'node:os';
import { runRuntimeRecoveryHelper } from '../../packages/node-bridge/dist/runtime-recovery.js';
import { binaryDir, runtimeFixture } from '../fixtures/runtime-ownership.mjs';

test(
  'native recovery: canonical Windows helper path above MAX_PATH launches and joins orphan cleanup',
  { skip: process.platform !== 'win32', timeout: 15000 },
  async () => {
    const temporary = await realpath(tmpdir());
    const scratch = await mkdtemp(join(temporary, 'bridge-recovery-long-'));
    try {
      const nested = join(
        scratch,
        'a'.repeat(96),
        'b'.repeat(96),
        'c'.repeat(96),
      );
      await mkdir(toNamespacedPath(nested), { recursive: true });
      const copied = join(nested, 'rdp-runtime-recovery.exe');
      await copyFile(
        join(binaryDir, 'rdp-runtime-recovery.exe'),
        toNamespacedPath(copied),
      );
      // Canonicalization removes the extended-length prefix. Filesystem APIs
      // can still read it, but CreateProcess requires that prefix for launch.
      const canonical = await realpath(toNamespacedPath(copied));
      assert.ok(canonical.length > 260 && canonical.length < 1024);
      assert.notEqual(canonical, toNamespacedPath(canonical));
      await runtimeFixture(async (root, directory) => {
        assert.equal(
          await runRuntimeRecoveryHelper(canonical, root, basename(directory), {
            due: performance.now() + 5000,
          }),
          'removed',
        );
        assert.deepEqual(await readdir(root), []);
      });
    } finally {
      const target = await realpath(scratch);
      assert.equal(dirname(target), temporary);
      assert.match(basename(target), /^bridge-recovery-long-[A-Za-z0-9]+$/);
      await rm(toNamespacedPath(target), { recursive: true });
    }
  },
);
