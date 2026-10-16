import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

test(
  'Windows clean SDK wrapper refuses wrong task, traversal and absolute receipt paths before toolchain setup',
  { skip: process.platform !== 'win32' },
  () => {
    for (const [task, receipt] of [
      ['foundation', 'build/freerdp-source-clean-example/receipt.json'],
      ['clean-bundled', 'build/freerdp-source-clean-example/../receipt.json'],
      [
        'clean-bundled',
        resolve('build/freerdp-source-clean-example/receipt.json'),
      ],
    ]) {
      const result = spawnSync(
        'powershell',
        [
          '-NoProfile',
          '-File',
          resolve('scripts/native-build.ps1'),
          '-Task',
          task,
          '-RebuiltSdkReceipt',
          receipt,
        ],
        {
          encoding: 'utf8',
          timeout: 10000,
          maxBuffer: 65536,
          windowsHide: true,
        },
      );
      assert.equal(result.status, 1);
      assert.match(
        result.stderr,
        /A rebuilt SDK receipt must name an isolated/,
      );
      assert.equal(result.stdout, '');
    }
  },
);
