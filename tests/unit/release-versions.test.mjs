import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isReleaseVersion,
  compareReleaseVersions,
} from '../../scripts/github-delivery/manifest.mjs';
import { publicTarballUrl } from '../../scripts/github-delivery/lock.mjs';
import { standaloneUpgradeSeed } from '../../scripts/standalone/upgrade-seed.mjs';
import { standaloneCandidatePointer } from '../../scripts/standalone/candidate-release.mjs';

test('release versions admit canonical bounded pre-1.0 minors and compare the complete version', () => {
  for (const version of ['0.1.0', '0.2.5', '0.3.0', '0.4.0', '0.999999.999999'])
    assert.equal(isReleaseVersion(version), true);
  for (const version of [
    undefined,
    null,
    3,
    {},
    '',
    '1.0.0',
    '0.03.0',
    '0.3.00',
    '0.3.0-beta',
    '0.3.0+build',
    '0.3.0\n',
    '0.1000000.0',
    '0.3.1000000',
    '../0.3.0',
  ])
    assert.equal(isReleaseVersion(version), false);
  assert.equal(compareReleaseVersions('0.3.0', '0.2.5'), 1);
  assert.equal(compareReleaseVersions('0.2.10', '0.2.9'), 1);
  assert.equal(compareReleaseVersions('0.9.99', '0.10.0'), -1);
  assert.equal(compareReleaseVersions('0.3.0', '0.3.0'), 0);
  assert.throws(() => compareReleaseVersions('private-invalid', '0.3.0'), {
    code: 'DELIVERY_VERSION_INVALID',
    message: 'DELIVERY_VERSION_INVALID',
  });
});

test('0.3.0 distribution binds the real 0.2.5 predecessor and exact candidate/archive version', () => {
  assert.deepEqual(standaloneUpgradeSeed('0.3.0'), {
    version: '0.2.5',
    ref: 'v0.2.5',
  });
  assert.deepEqual(standaloneUpgradeSeed('0.3.1'), {
    version: '0.3.0',
    ref: 'v0.3.0',
  });
  assert.throws(
    () => standaloneUpgradeSeed('0.5.0'),
    /STANDALONE_RELEASE_UPGRADE_SEED_REQUIRED/,
  );
  assert.equal(
    publicTarballUrl('@freerdp-bridge/node', '0.3.0'),
    'https://registry.npmjs.org/@freerdp-bridge/node/-/node-0.3.0.tgz',
  );
  const pointer = {
    schema: 1,
    version: '0.3.0',
    sourceCommit: 'a'.repeat(40),
    tag: 'standalone-candidate-0.3.0-' + 'a'.repeat(12),
  };
  assert.deepEqual(standaloneCandidatePointer(pointer, '0.3.0'), pointer);
  assert.throws(
    () => standaloneCandidatePointer(pointer, '0.2.5'),
    /STANDALONE_CANDIDATE_RELEASE_INVALID/,
  );
});

test('0.4.0 distribution upgrades from the published 0.3.0 line without guessing another minor predecessor', () => {
  assert.deepEqual(standaloneUpgradeSeed('0.4.0'), {
    version: '0.3.0',
    ref: 'v0.3.0',
  });
  assert.deepEqual(standaloneUpgradeSeed('0.4.1'), {
    version: '0.4.0',
    ref: 'v0.4.0',
  });
  assert.throws(
    () => standaloneUpgradeSeed('0.5.0'),
    /STANDALONE_RELEASE_UPGRADE_SEED_REQUIRED/,
  );
});
