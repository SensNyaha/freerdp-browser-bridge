import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  nativeCleanProfile,
  requireWindowsDebugSdk,
} from '../../scripts/native-clean-profile.mjs';

test('clean native profiles preserve existing Release/foundation settings and explicitly require a receipt for linked Debug', () => {
  assert.deepEqual(nativeCleanProfile('foundation'), {
    linked: false,
    buildType: 'Debug',
    receiptRequired: false,
  });
  assert.deepEqual(nativeCleanProfile('linked'), {
    linked: true,
    buildType: 'Release',
    receiptRequired: false,
  });
  assert.deepEqual(nativeCleanProfile('linked-debug'), {
    linked: true,
    buildType: 'Debug',
    receiptRequired: true,
  });
  for (const mode of [
    undefined,
    null,
    '',
    'debug',
    'Linked',
    'linked-release',
    {},
    [],
  ])
    assert.throws(() => nativeCleanProfile(mode), {
      message: 'Unsupported clean native build profile',
    });
  const first = nativeCleanProfile('linked');
  first.buildType = 'Debug';
  assert.equal(nativeCleanProfile('linked').buildType, 'Release');
});

test('linked Debug CLI refuses missing SDK provenance before Catch2 access or build preparation', () => {
  const result = spawnSync(
    process.execPath,
    [
      'scripts/test-native-clean-build.mjs',
      'absent-catch-source',
      'linked-debug',
    ],
    { encoding: 'utf8', timeout: 10000, maxBuffer: 65536, windowsHide: true },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Linked Debug requires a rebuilt SDK receipt/);
  assert.equal(result.stdout, '');
});

test(
  'Windows linked Debug wrapper refuses missing SDK receipt before toolchain/alias acquisition',
  { skip: process.platform !== 'win32' },
  () => {
    const result = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-File',
        'scripts/native-build.ps1',
        '-Task',
        'clean-bundled-debug',
      ],
      { encoding: 'utf8', timeout: 10000, maxBuffer: 65536, windowsHide: true },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Linked Debug requires a rebuilt SDK receipt/);
    assert.equal(result.stdout, '');
  },
);

test('Windows Debug SDK admission requires matching recorded build type and dynamic Debug CRT before consumer output', () => {
  const cache =
    'CMAKE_BUILD_TYPE:STRING=Debug\nCMAKE_MSVC_RUNTIME_LIBRARY:STRING=MultiThreaded$<$<CONFIG:Debug>:Debug>DLL\n';
  assert.doesNotThrow(() =>
    requireWindowsDebugSdk({ buildType: 'Debug' }, cache),
  );
  assert.doesNotThrow(() =>
    requireWindowsDebugSdk(
      { buildType: 'Debug' },
      cache.replace(
        'MultiThreaded$<$<CONFIG:Debug>:Debug>DLL',
        'MultiThreadedDebugDLL',
      ),
    ),
  );
  for (const [receipt, input] of [
    [{}, cache],
    [{ buildType: 'Release' }, cache],
    [{ buildType: 'Debug' }, cache.replace('STRING=Debug', 'STRING=Release')],
    [
      { buildType: 'Debug' },
      cache.replace(
        'MultiThreaded$<$<CONFIG:Debug>:Debug>DLL',
        'MultiThreadedDLL',
      ),
    ],
    [{ buildType: 'Debug' }, ''],
    [{ buildType: 'Debug' }, cache + 'CMAKE_BUILD_TYPE:STRING=Debug\n'],
  ])
    assert.throws(() => requireWindowsDebugSdk(receipt, input), {
      message: 'Windows linked Debug requires a matching Debug CRT SDK',
    });
});
