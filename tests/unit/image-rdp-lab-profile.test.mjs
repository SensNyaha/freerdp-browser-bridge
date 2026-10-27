import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { imageRdpLabArguments } from '../../scripts/image-rdp-lab-profile.mjs';
const args = [
  '--prepared-remote-document=' + 'a'.repeat(32),
  '--owned-os-clipboard',
  'sha256:' + 'b'.repeat(64),
  'build/native-clean-owned/receipt.json',
];
test('image RDP profile binds prepared identity certificate and clean receipt with explicit reset mode', () => {
  assert.deepEqual(imageRdpLabArguments(args), {
    nonce: 'a'.repeat(32),
    fingerprint: args[2],
    receipt: args[3],
    keepRemoteDocument: false,
  });
  assert.equal(
    imageRdpLabArguments([...args, '--keep-remote-document'])
      .keepRemoteDocument,
    true,
  );
  assert.equal(
    imageRdpLabArguments([
      ...args.slice(0, 3),
      'build\\native-clean-owned\\receipt.json',
    ]).receipt,
    'build\\native-clean-owned\\receipt.json',
  );
});
test('image RDP profile refuses arbitrary app launch inputs unknown flags malformed pin and escaped receipt', () => {
  for (const bad of [
    null,
    {},
    [],
    args.slice(0, 3),
    [...args, '--keep-remote-document', '--keep-remote-document'],
    ['--prepared-remote-edge', ...args.slice(1)],
    ['--prepared-remote-document=' + 'a'.repeat(31), ...args.slice(1)],
    [args[0], '--read-existing-clipboard', ...args.slice(2)],
    [...args.slice(0, 2), 'sha256:' + 'b'.repeat(63), args[3]],
    [...args.slice(0, 3), 'build/native-clean-owned/../receipt.json'],
    [...args.slice(0, 3), 'C:/unowned/receipt.json'],
    [...args, '--unknown'],
    [...args.slice(0, 3), null],
  ])
    assert.throws(
      () => imageRdpLabArguments(bad),
      /^Error: IMAGE_RDP_LAB_ARGUMENTS_INVALID$/,
    );
});
test('image RDP CLI refuses missing consent and profile before reading lab files or launching anything', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/test-image-rdp-clipboard.mjs'],
    { encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 32768 },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /IMAGE_RDP_LAB_ARGUMENTS_INVALID/);
  assert.equal(result.stdout, '');
});
