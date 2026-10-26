import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('actual RDP HTML helper refuses unprepared, unowned and ambiguous invocations before accessing the lab', () => {
  const approvedShape = [
    '--prepared-remote-edge',
    '--owned-os-clipboard',
    'sha256:' + 'a'.repeat(64),
    'build/native-clean-fixture/receipt.json',
  ];
  for (const args of [
    [],
    approvedShape.slice(1),
    [approvedShape[0], ...approvedShape.slice(2)],
    [...approvedShape, '--extra'],
    [...approvedShape, '--owned-os-clipboard'],
    [...approvedShape.slice(0, 2), 'ignore', approvedShape[3]],
    [...approvedShape.slice(0, 3), '../outside/receipt.json'],
    [...approvedShape.slice(0, 3), 'build/bundled/receipt.json'],
    ['--prepared-remote-document=invalid', ...approvedShape.slice(1)],
    ['--prepared-remote-document=' + 'a'.repeat(33), ...approvedShape.slice(1)],
  ]) {
    const result = spawnSync(
      process.execPath,
      ['scripts/test-html-rdp-clipboard.mjs', ...args],
      {
        encoding: 'utf8',
        timeout: 5000,
        windowsHide: true,
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--prepared-remote-edge --owned-os-clipboard/);
    assert.equal(result.stdout, '');
  }
});

test(
  'owned prepared-document mode validates the native receipt before any RDP or clipboard access',
  { skip: process.platform !== 'win32' },
  () => {
    const result = spawnSync(
      process.execPath,
      [
        'scripts/test-html-rdp-clipboard.mjs',
        '--prepared-remote-document=' + 'a'.repeat(32),
        '--owned-os-clipboard',
        'sha256:' + 'a'.repeat(64),
        'build/native-clean-unavailable/receipt.json',
      ],
      { encoding: 'utf8', timeout: 5000, windowsHide: true },
    );
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /LAB_NATIVE_PROFILE_INVALID/);
  },
);
