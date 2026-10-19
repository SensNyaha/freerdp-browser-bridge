import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
for (const script of [
  'test-rdp-performance-lab.mjs',
  'test-rdp-performance-form-lab.mjs',
])
  test(`${script} refuses invalid native selection before private configuration access`, () => {
    const fingerprint = 'sha256:' + 'a'.repeat(64);
    for (const args of [
      [],
      ['--other', fingerprint, 'build/native-clean-example/receipt.json'],
      [fingerprint, 'build/bundled/receipt.json'],
      [fingerprint, `build/native-clean-missing-${process.pid}/receipt.json`],
    ]) {
      const result = spawnSync(
        process.execPath,
        ['scripts/' + script, ...args],
        {
          encoding: 'utf8',
          timeout: 10000,
          maxBuffer: 65536,
          windowsHide: true,
        },
      );
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.match(
        result.stderr,
        /Use verified sha256 fingerprint and isolated native receipt|LAB_NATIVE_PROFILE_INVALID|LAB_NATIVE_PROFILE_UNSUPPORTED/,
      );
      assert.equal(result.stderr.includes('xrdp-lab.secrets'), false);
    }
  });
