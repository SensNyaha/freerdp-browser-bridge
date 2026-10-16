import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

test(
  'Windows clean SDK wrapper refuses wrong task, traversal and absolute receipt paths before toolchain setup',
  { skip: process.platform !== 'win32' },
  () => {
    for (const [parameter, task, receipt] of [
      [
        '-RebuiltSdkReceipt',
        'foundation',
        'build/freerdp-source-clean-example/receipt.json',
      ],
      [
        '-RebuiltSdkReceipt',
        'clean-bundled',
        'build/freerdp-source-clean-example/../receipt.json',
      ],
      [
        '-RebuiltSdkReceipt',
        'clean-bundled',
        resolve('build/freerdp-source-clean-example/receipt.json'),
      ],
      [
        '-DependencyReceipt',
        'clean-bundled',
        'build/dependencies-source-clean-example/installed/bridge-dependency-build.json',
      ],
      [
        '-DependencyReceipt',
        'clean-freerdp',
        'build/dependencies-source-clean-example/installed/../bridge-dependency-build.json',
      ],
      [
        '-DependencyReceipt',
        'clean-freerdp',
        resolve(
          'build/dependencies-source-clean-example/installed/bridge-dependency-build.json',
        ),
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
          parameter,
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
        parameter === '-DependencyReceipt'
          ? /A source dependency receipt must name an isolated/
          : /A rebuilt SDK receipt must name an isolated/,
      );
      assert.equal(result.stdout, '');
    }
  },
);
