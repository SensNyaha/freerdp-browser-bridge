import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rebaseWindowsBuildPath,
  windowsFreeRdpBuildPath,
} from '../fixtures/cmake-paths.mjs';

test('CMake cached Windows paths: ordinary workspace output rebases after alias removal', () => {
  assert.equal(
    rebaseWindowsBuildPath(
      'D:\\work\\build\\bundled',
      'R:/build/bundled',
      'R:/.deps/freerdp-install',
    ),
    'D:\\work\\.deps\\freerdp-install',
  );
});

test('CMake cached Windows paths: isolated source/output retains the actual SDK prefix', () => {
  assert.equal(
    rebaseWindowsBuildPath(
      'D:\\work\\build\\native-clean-X\\out',
      'r:/build/native-clean-X/out',
      'R:/.deps/freerdp-install',
    ),
    'D:\\work\\.deps\\freerdp-install',
  );
  assert.equal(
    rebaseWindowsBuildPath(
      'D:\\work\\build\\native-clean-X\\out',
      'R:/build/native-clean-X/out',
      'E:/sdk/freerdp-install',
    ),
    'E:\\sdk\\freerdp-install',
  );
});

test('CMake SDK dependency tracking follows the consumed source SDK and refuses unknown layouts', () => {
  assert.equal(
    windowsFreeRdpBuildPath(
      'D:\\work\\build\\native-clean-X\\out',
      'R:/build/native-clean-X/out',
      'R:/build/freerdp-source-clean-Y/installed',
    ),
    'D:\\work\\build\\freerdp-source-clean-Y\\out',
  );
  assert.equal(
    windowsFreeRdpBuildPath(
      'D:\\work\\build\\bundled',
      'R:/build/bundled',
      'R:/.deps/freerdp-install',
    ),
    'D:\\work\\build\\freerdp-local',
  );
  assert.throws(
    () =>
      windowsFreeRdpBuildPath(
        'D:\\work\\build\\native-clean-X\\out',
        'R:/build/native-clean-X/out',
        'E:/unknown-sdk/installed',
      ),
    /Unsupported FreeRDP SDK build layout/,
  );
});
