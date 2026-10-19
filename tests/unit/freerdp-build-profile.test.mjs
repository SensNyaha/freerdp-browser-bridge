import test from 'node:test';
import assert from 'node:assert/strict';
import { freerdpBuildProfile } from '../../scripts/freerdp-build-profile.mjs';

test('SDK profiles preserve ordinary/clean Release and isolate explicit Debug with its dependency receipt', () => {
  assert.deepEqual(freerdpBuildProfile([]), {
    cleanLocal: false,
    buildType: 'Release',
    dependencyReceiptPath: undefined,
  });
  assert.deepEqual(freerdpBuildProfile(['--clean-local']), {
    cleanLocal: true,
    buildType: 'Release',
    dependencyReceiptPath: undefined,
  });
  assert.deepEqual(freerdpBuildProfile(['--clean-local', 'receipt.json']), {
    cleanLocal: true,
    buildType: 'Release',
    dependencyReceiptPath: 'receipt.json',
  });
  assert.deepEqual(freerdpBuildProfile(['--clean-debug', 'receipt.json']), {
    cleanLocal: true,
    buildType: 'Debug',
    dependencyReceiptPath: 'receipt.json',
  });
  assert.equal(freerdpBuildProfile(['--clean-debug']).cleanLocal, true);
  for (const args of [
    undefined,
    null,
    '--clean-debug',
    ['Debug'],
    ['--debug'],
    ['--clean-debug', 'receipt.json', 'extra'],
  ])
    assert.throws(() => freerdpBuildProfile(args), {
      message:
        'Expected optional --clean-local/--clean-debug and completed dependency receipt',
    });
});
