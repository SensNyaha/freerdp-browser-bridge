import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('Linux HTML RDP driver refuses implicit/foreign invocation before Docker, credentials or OS clipboard', () => {
  const args = [
    'freerdp-bridge-linux-viewer-501',
    '--prepared-remote-document=' + 'a'.repeat(32),
    'sha256:' + 'b'.repeat(64),
    '--owned-os-clipboard',
  ];
  for (const value of [
    [],
    args.slice(1),
    ['foreign', ...args.slice(1)],
    [...args.slice(0, 3)],
    [...args, 'unknown'],
    [...args, 'auto', '--bootstrap-only', '--extra'],
  ]) {
    const result = spawnSync(
      process.execPath,
      ['scripts/test-linux-html-rdp.mjs', ...value],
      { encoding: 'utf8', timeout: 5000, windowsHide: true },
    );
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /LINUX_HTML_LAB_PROFILE_REFUSED/);
  }
});

test(
  'Linux HTML driver masks Docker inspection errors before creating auth material',
  { skip: process.platform !== 'win32' },
  () => {
    const env = { ...process.env, PATH: '' };
    delete env.BRIDGE_LAB_PROFILE;
    const result = spawnSync(
      process.execPath,
      [
        'scripts/test-linux-html-rdp.mjs',
        'freerdp-bridge-linux-viewer-501',
        '--prepared-remote-document=' + 'a'.repeat(32),
        'sha256:' + 'b'.repeat(64),
        '--owned-os-clipboard',
        'auto',
        '--bootstrap-only',
      ],
      { env, encoding: 'utf8', timeout: 5000, windowsHide: true },
    );
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /LINUX_HTML_LAB_PROFILE_REFUSED/);
    assert.equal(result.stderr.includes('spawn docker'), false);
  },
);
