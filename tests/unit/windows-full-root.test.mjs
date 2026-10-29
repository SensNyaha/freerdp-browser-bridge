import test from 'node:test';
import assert from 'node:assert/strict';
import { windowsFullProof } from '../fixtures/windows-full-root.mjs';

test('Windows full-volume proof binds the coordinator, fresh root, bounded image and volume identity', () => {
  const root = 'V:\\bridge-owned-full-' + 'a'.repeat(32);
  const proof = {
    schema: 1,
    kind: 'owned-windows-vhd-full',
    root,
    coordinatorPid: 1234,
    diskBytes: 16777216,
    imageSha256: 'b'.repeat(64),
    volumeGuid: '\\\\?\\Volume{12345678-1234-1234-1234-123456789abc}\\',
  };
  assert.equal(windowsFullProof(proof, root, 1234), proof);
  for (const value of [
    null,
    [],
    {},
    { ...proof, schema: 2 },
    { ...proof, coordinatorPid: 1235 },
    { ...proof, root: 'C:\\' },
    { ...proof, diskBytes: 33554432 },
    { ...proof, imageSha256: 'x' },
    { ...proof, volumeGuid: 'C:\\' },
    { ...proof, extraRoot: root },
  ])
    assert.throws(() => windowsFullProof(value, root, 1234), {
      code: 'OWNED_WINDOWS_FULL_ROOT_REFUSED',
    });
  assert.throws(() => windowsFullProof(proof, root, 1235), {
    code: 'OWNED_WINDOWS_FULL_ROOT_REFUSED',
  });
  assert.throws(() => windowsFullProof(proof, 'C:\\', 1234), {
    code: 'OWNED_WINDOWS_FULL_ROOT_REFUSED',
  });
});
