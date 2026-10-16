import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodeTestDirectories } from '../../scripts/node-test-directories.mjs';

test(
  'Windows native test driver: physical paths preserve workspace error identity across subst and pnpm junctions',
  { skip: process.platform !== 'win32', timeout: 20000 },
  async () => {
    const project = resolve(fileURLToPath(new URL('../..', import.meta.url)));
    let drive;
    for (const letter of ['R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z']) {
      try {
        await access(letter + ':\\');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        drive = letter + ':';
        break;
      }
    }
    assert.ok(drive, 'A free temporary workspace alias is required');
    const options = { windowsHide: true, timeout: 5000, encoding: 'utf8' };
    assert.equal(spawnSync('subst.exe', [drive, project], options).status, 0);
    try {
      const context = nodeTestDirectories(
        drive + '\\',
        join(drive + '\\', 'tests/fixtures'),
      );
      const probe = spawnSync(
        process.execPath,
        [join(context.project, 'tests/fixtures/node-module-identity.mjs')],
        { ...options, cwd: context.project, maxBuffer: 65536, timeout: 10000 },
      );
      assert.equal(probe.status, 0);
      assert.equal(probe.stderr, '');
      assert.equal(probe.stdout.trim(), 'workspace error identity preserved');
      await access(join(context.binary, 'node-module-identity.mjs'));
    } finally {
      assert.equal(spawnSync('subst.exe', [drive, '/d'], options).status, 0);
    }
  },
);
