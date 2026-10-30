import test from 'node:test';
import assert from 'node:assert/strict';
import { standaloneUpgradeSeed } from '../../scripts/standalone/upgrade-seed.mjs';
import {
  standaloneReleaseManifest,
  standaloneReleaseNames,
} from '../../scripts/standalone/release-artifacts.mjs';

test('0.7.0 inventory distribution explicitly upgrades 0.6.0 and refuses an unassigned future minor', () => {
  assert.deepEqual(standaloneUpgradeSeed('0.7.0'), {
    version: '0.6.0',
    ref: 'v0.6.0',
  });
  assert.throws(
    () => standaloneUpgradeSeed('0.8.0'),
    /STANDALONE_RELEASE_UPGRADE_SEED_REQUIRED/,
  );
});

test('0.7.0 inventory release refuses older, same-version, missing or mixed installed upgrade evidence', () => {
  const input = ['win32-x64', 'linux-x64-gnu'].map((platform) => ({
    schema: 1,
    version: '0.7.0',
    sourceCommit: 'a'.repeat(40),
    platform,
    files: standaloneReleaseNames('0.7.0', platform).map((name) => ({
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
      upgradeFrom: '0.6.0',
    },
  }));
  const before = structuredClone(input);
  assert.equal(standaloneReleaseManifest(input).files.length, 7);
  assert.deepEqual(input, before);
  for (const index of [0, 1])
    for (const previous of ['0.2.5', '0.4.0', '0.5.0', '0.7.0', null]) {
      const changed = structuredClone(input);
      changed[index].acceptance.upgradeFrom = previous;
      assert.throws(
        () => standaloneReleaseManifest(changed),
        /STANDALONE_RELEASE_MANIFEST_INVALID/,
      );
    }
});
