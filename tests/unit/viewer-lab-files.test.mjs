import test from 'node:test';
import assert from 'node:assert/strict';
import {
  viewerLabFiles,
  requireOwnedLabTarget,
  ownedLabDefinition,
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

test('Unicode owned lab has independent fixed files/port and cannot borrow legacy or external credentials', () => {
  assert.deepEqual(viewerLabFiles('owned-unicode-container'), {
    config: '.local-tests/xrdp-unicode-lab.json',
    credentials: '.local-tests/xrdp-unicode-lab.secrets.json',
    ownedContainer: true,
  });
  const legacy = ownedLabDefinition('owned-container');
  const unicode = ownedLabDefinition('owned-unicode-container');
  assert.notEqual(legacy.container, unicode.container);
  assert.notEqual(legacy.image, unicode.image);
  assert.equal(legacy.port, 3391);
  assert.equal(unicode.port, 3392);
  const target = {
    host: '127.0.0.1',
    port: 3392,
    credentialFile: 'xrdp-unicode-lab.secrets.json',
  };
  requireOwnedLabTarget(target, 'owned-unicode-container');
  assert.throws(
    () => requireOwnedLabTarget(target),
    /LAB_OWNED_TARGET_REFUSED/,
  );
  for (const invalid of [
    { ...target, port: 3391 },
    { ...target, host: '192.168.21.149' },
    { ...target, credentialFile: 'xrdp-container-lab.secrets.json' },
    { ...target, credentialFile: 'xrdp-lab.secrets.json' },
  ])
    assert.throws(
      () => requireOwnedLabTarget(invalid, 'owned-unicode-container'),
      /LAB_OWNED_TARGET_REFUSED/,
    );
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
