import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

test('isolated SDK consumer refuses mixed or incomplete SDK provenance before creating build output', async () => {
  const root = await mkdtemp(resolve('build/sdk-receipt-guard-'));
  assert.ok(root.startsWith(resolve('build') + sep));
  try {
    const catchSource = resolve(root, 'catch');
    await mkdir(resolve(catchSource, 'src/catch2'), { recursive: true });
    await writeFile(
      resolve(catchSource, 'src/catch2/catch_version_macros.hpp'),
      '#define CATCH_VERSION_MAJOR 3\n#define CATCH_VERSION_MINOR 8\n#define CATCH_VERSION_PATCH 1\n',
    );
    const receipt = {
      source: resolve(root, 'source'),
      binary: resolve(root, 'out'),
      installed: resolve(root, 'installed'),
      reusedDependencyPrefix: resolve(
        '.deps/installed',
        process.platform === 'win32'
          ? 'x64-windows-bundled'
          : 'x64-linux-bundled',
      ),
      freerdpRebuilt: true,
      dependenciesRebuilt: false,
      foreignPrefixRejected: true,
      nativeTests: 1,
      runtime: { version: '3.32.1', winpr: '3.32.1', privateModules: 3 },
    };
    const path = resolve(root, 'receipt.json');
    for (const [description, body, error] of [
      [
        'old SDK prefix despite a new-source claim',
        JSON.stringify({
          ...receipt,
          installed: resolve('.deps/freerdp-install'),
        }),
        /Rebuilt SDK receipt does not describe/,
      ],
      [
        'missing completed origin check',
        JSON.stringify({ ...receipt, foreignPrefixRejected: false }),
        /Rebuilt SDK receipt does not describe/,
      ],
      [
        'oversized receipt before parsing',
        'x'.repeat(65537),
        /Invalid rebuilt SDK receipt/,
      ],
    ]) {
      await writeFile(path, body);
      const result = spawnSync(
        process.execPath,
        [
          resolve('scripts/test-native-clean-build.mjs'),
          catchSource,
          'linked',
          path,
        ],
        {
          encoding: 'utf8',
          timeout: 10000,
          maxBuffer: 65536,
          windowsHide: true,
        },
      );
      assert.equal(result.status, 1, description);
      assert.match(result.stderr, error, description);
      assert.deepEqual(
        (await readdir(root)).sort(),
        ['catch', 'receipt.json'],
        description,
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
