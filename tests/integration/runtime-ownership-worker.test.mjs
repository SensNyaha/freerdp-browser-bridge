import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  runtimeFixture as fixture,
  launchRuntimeWorker as launch,
} from '../fixtures/runtime-ownership.mjs';
test(
  'native runtime ownership: competing worker is refused; hard kill releases lock; replacement cleans directory',
  { timeout: 20000 },
  async () =>
    fixture(async (root, directory) => {
      const owner = launch(directory);
      try {
        assert.equal(await owner.ready, true, owner.diagnostic());
        const competitor = launch(directory);
        try {
          assert.equal(await competitor.ready, false);
          assert.equal((await competitor.closed)[0], 2);
          assert.deepEqual(competitor.packets, []);
          assert.equal(competitor.diagnostic(), 'Worker IPC failure\n');
          if (process.platform === 'win32')
            await assert.rejects(
              readFile(join(directory, '.rdp-worker-owned'), 'utf8'),
              (error) => error.code === 'EBUSY',
            );
          else
            assert.equal(
              await readFile(join(directory, '.rdp-worker-owned'), 'utf8'),
              'runtime-v1',
            );
          assert.deepEqual(await readdir(directory), ['.rdp-worker-owned']);
        } finally {
          await competitor.kill();
        }
      } finally {
        await owner.kill();
      }
      assert.equal(
        await readFile(join(directory, '.rdp-worker-owned'), 'utf8'),
        'runtime-v1',
      );
      const replacement = launch(directory);
      try {
        assert.equal(await replacement.ready, true, replacement.diagnostic());
        assert.equal((await replacement.shutdown())[0], 0);
        assert.deepEqual(await readdir(root), []);
      } finally {
        await replacement.kill();
      }
    }),
);

test(
  'native runtime ownership: partial or invalid marker is refused before HELLO without deletion',
  { timeout: 20000 },
  async () =>
    fixture(async (_root, directory) => {
      for (const marker of ['', 'runtime-v', 'Runtime-v1', 'runtime-v1x']) {
        await writeFile(join(directory, '.rdp-worker-owned'), marker, {
          mode: 0o600,
        });
        const child = launch(directory);
        try {
          assert.equal(await child.ready, false);
          assert.equal((await child.closed)[0], 2);
          assert.deepEqual(child.packets, []);
          assert.equal(child.diagnostic(), 'Worker IPC failure\n');
          assert.equal(
            await readFile(join(directory, '.rdp-worker-owned'), 'utf8'),
            marker,
          );
        } finally {
          await child.kill();
        }
      }
    }),
);
