import test from 'node:test';
import assert from 'node:assert/strict';
import {
  standaloneReleaseNames,
  standaloneReleaseManifest,
} from '../../scripts/standalone/release-artifacts.mjs';
const receipts = () =>
  ['win32-x64', 'linux-x64-gnu'].map((platform) => ({
    schema: 1,
    version: '0.2.5',
    sourceCommit: 'a'.repeat(40),
    platform,
    files: standaloneReleaseNames('0.2.5', platform).map((name) => ({
      name,
      bytes: 1,
      sha256: 'b'.repeat(64),
      integrity: 'sha512-' + Buffer.alloc(64, 1).toString('base64'),
    })),
    acceptance: {
      portable: true,
      installed: true,
      realRdpDesktop: false,
      os: platform === 'win32-x64' ? 'windows-2025' : 'ubuntu-24.04',
      upgradeFrom: '0.2.4',
    },
  }));
test('standalone release requires both exact platform sets, source identity and accepted two-version upgrade without claiming real RDP', () => {
  const input = receipts(),
    before = structuredClone(input);
  assert.equal(standaloneReleaseManifest(input).files.length, 7);
  assert.deepEqual(input, before);
  for (const mutate of [
    (r) => r.pop(),
    (r) => r.push(r[0]),
    (r) => (r[1].platform = 'win32-x64'),
    (r) => (r[1].version = '0.2.6'),
    (r) => (r[1].sourceCommit = 'c'.repeat(40)),
    (r) => r[0].files.pop(),
    (r) => (r[0].files[0].name = '../outside'),
    (r) => (r[0].files[0].bytes = 536870913),
    (r) => (r[0].files[0].sha256 = 'bad'),
    (r) => (r[0].files[0].integrity = 'bad'),
    (r) => (r[0].acceptance.installed = false),
    (r) => (r[0].acceptance.upgradeFrom = null),
    (r) => (r[1].acceptance.realRdpDesktop = true),
    (r) => (r[1].acceptance.os = 'Astra 1.7.5'),
  ]) {
    const changed = receipts();
    mutate(changed);
    assert.throws(
      () => standaloneReleaseManifest(changed),
      /STANDALONE_RELEASE_MANIFEST_INVALID/,
    );
  }
});
