import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('owned XRDP HTML peer refuses implicit/foreign scenarios before Docker or RDP access', () => {
  for (const args of [
    [],
    ['--external-peer'],
    ['--owned-xrdp-peer'],
    ['--owned-xrdp-peer', '../outside/receipt.json'],
    ['--owned-xrdp-peer', 'build/bundled/receipt.json'],
    ['--owned-xrdp-peer', 'build/native-clean-fixture/receipt.json', '--extra'],
  ]) {
    const result = spawnSync(
      process.execPath,
      ['scripts/test-html-xrdp-peer.mjs', ...args],
      {
        encoding: 'utf8',
        timeout: 5000,
        windowsHide: true,
      },
    );
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /--owned-xrdp-peer/);
  }
});
