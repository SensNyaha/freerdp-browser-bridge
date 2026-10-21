import test from 'node:test';
import assert from 'node:assert/strict';
import {
  viewerLabFiles,
  requireOwnedLabTarget,
} from '../../scripts/viewer-lab-files.mjs';

test('viewer lab profile preserves legacy files and selects only the fixed owned container', () => {
  assert.deepEqual(viewerLabFiles(undefined), {
    config: '.local-tests/xrdp-lab.json',
    credentials: '.local-tests/xrdp-lab.secrets.json',
    ownedContainer: false,
  });
  assert.deepEqual(viewerLabFiles('owned-container'), {
    config: '.local-tests/xrdp-container-lab.json',
    credentials: '.local-tests/xrdp-container-lab.secrets.json',
    ownedContainer: true,
  });
  for (const value of ['', null, {}, '../xrdp-lab', 'production'])
    assert.throws(() => viewerLabFiles(value), /LAB_PROFILE_REFUSED/);
});
test('owned container selection refuses foreign endpoints and credential aliases', () => {
  const target = {
    host: '127.0.0.1',
    port: 3391,
    credentialFile: 'xrdp-container-lab.secrets.json',
  };
  requireOwnedLabTarget(target);
  for (const invalid of [
    null,
    {},
    { ...target, host: '192.168.21.149' },
    { ...target, host: 'localhost' },
    { ...target, port: 3389 },
    { ...target, credentialFile: 'xrdp-lab.secrets.json' },
  ])
    assert.throws(
      () => requireOwnedLabTarget(invalid),
      /LAB_OWNED_TARGET_REFUSED/,
    );
});
