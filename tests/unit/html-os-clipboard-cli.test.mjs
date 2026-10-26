import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
test('owned OS HTML helper refuses implicit, duplicate and unknown scenarios before browser or clipboard access', () => {
  for (const args of [
    [],
    ['--headless'],
    ['--owned-os-clipboard', '--owned-os-clipboard'],
    ['--owned-os-clipboard', '--extra'],
  ]) {
    const result = spawnSync(
      process.execPath,
      ['scripts/test-html-os-clipboard.mjs', ...args],
      { encoding: 'utf8', timeout: 5000, windowsHide: true },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--owned-os-clipboard/);
    assert.equal(result.stdout, '');
  }
});
