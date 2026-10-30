import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
test(
  'standalone source CLI / controlled runtime resolver / real SDK and native worker: selected metadata only and joined empty runtime, no RDP or HTTP listener',
  { skip: !process.env.BRIDGE_TEST_BINARY_DIR, timeout: 15000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'bridge-owned-inventory-cli-'));
    try {
      const child = spawnSync(
        process.execPath,
        [
          '--import',
          pathToFileURL(resolve('tests/fixtures/device-inventory-cli-hook.mjs'))
            .href,
          resolve('apps/standalone/dist/main.js'),
          '--inventory',
          'usb',
          '--runtime-root',
          root,
          '--max-devices',
          '3',
        ],
        {
          encoding: 'utf8',
          timeout: 10000,
          maxBuffer: 131072,
          windowsHide: true,
        },
      );
      assert.ifError(child.error);
      assert.equal(child.status, 0);
      assert.equal(child.stderr, '');
      const report = JSON.parse(child.stdout);
      assert.equal(report.classes.length, 1);
      assert.equal(report.classes[0].kind, 'usb');
      assert.ok(report.classes[0].devices.length <= 3);
      for (const device of report.classes[0].devices) {
        assert.equal(device.origin, 'bridge-host');
        assert.ok(device.usb);
      }
      assert.deepEqual(await readdir(root), []);
    } finally {
      await rmdir(root);
    }
  },
);
