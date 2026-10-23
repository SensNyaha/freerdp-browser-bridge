import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

for (const arguments_ of [
  [],
  ['--owned-lab'],
  ['--owned-lab-redos-7.3', 'extra'],
  ...(process.platform !== 'linux' ? [['--owned-lab-redos-7.3']] : []),
])
  test(`installed standalone acceptance refuses unapproved execution ${JSON.stringify(arguments_)} before reading install inputs`, () => {
    const env = { ...process.env, GITHUB_ACTIONS: 'false' };
    const result = spawnSync(
      process.execPath,
      ['tests/packaging/standalone-installed.mjs', ...arguments_],
      {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 10000,
        maxBuffer: 65536,
        env,
      },
    );
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('STANDALONE_FRESH_CI_ONLY'));
    assert.ok(!result.stderr.includes('STANDALONE_INSTALLED_COMMAND_FAILED'));
  });
