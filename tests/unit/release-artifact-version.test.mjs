import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
  access,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

async function fixture(version, run) {
  await mkdir('build', { recursive: true });
  const root = await mkdtemp(resolve('build/release-artifact-version-'));
  try {
    for (const directory of [
      'scripts',
      'build/packages',
      'docker',
      'tests/packaging',
    ])
      await mkdir(join(root, directory), { recursive: true });
    for (const file of [
      'scripts/product-version.mjs',
      'scripts/prepare-native-runtime-check.mjs',
      'scripts/prepare-service-runtime.mjs',
      'docker/native-runtime-check.Dockerfile',
      'docker/service-runtime.Dockerfile',
      'tests/packaging/native-clean-probe.mjs',
      'tests/packaging/api-runtime-probe.mjs',
    ])
      await copyFile(file, join(root, file));
    await writeFile(join(root, 'package.json'), JSON.stringify({ version }));
    await run(root);
  } finally {
    assert.equal(dirname(root), resolve('build'));
    await rm(root, { recursive: true, force: true });
  }
}
function invoke(root, name) {
  const result = spawnSync(process.execPath, ['scripts/' + name], {
    cwd: root,
    encoding: 'utf8',
    timeout: 5000,
    windowsHide: true,
  });
  assert.equal(result.error, undefined);
  return result;
}

test('runtime preparation selects current product archives instead of retained 0.1.0 artifacts', async () => {
  for (const version of ['0.2.0', '4.5.6'])
    await fixture(version, async (root) => {
      for (const [kind, suffix] of [
        ['native', 'Linux'],
        ['node', 'linux'],
      ]) {
        await writeFile(
          join(
            root,
            `build/packages/freerdp-bridge-${kind}-0.1.0-${suffix}.tar.gz`,
          ),
          'old',
        );
        await writeFile(
          join(
            root,
            `build/packages/freerdp-bridge-${kind}-${version}-${suffix}.tar.gz`,
          ),
          `current-${kind}`,
        );
      }
      assert.equal(invoke(root, 'prepare-native-runtime-check.mjs').status, 0);
      assert.equal(
        await readFile(
          join(root, 'build/native-runtime-check/native-linux.tar.gz'),
          'utf8',
        ),
        'current-native',
      );
      assert.equal(invoke(root, 'prepare-service-runtime.mjs').status, 0);
      for (const kind of ['native', 'node'])
        assert.equal(
          await readFile(
            join(root, `build/service-runtime/${kind}-linux.tar.gz`),
            'utf8',
          ),
          `current-${kind}`,
        );
    });
});

test('a missing current archive fails instead of falling back to the older release', async () => {
  await fixture('0.2.0', async (root) => {
    await writeFile(
      join(root, 'build/packages/freerdp-bridge-native-0.1.0-Linux.tar.gz'),
      'old',
    );
    assert.notEqual(invoke(root, 'prepare-native-runtime-check.mjs').status, 0);
    await assert.rejects(
      access(join(root, 'build/native-runtime-check/native-linux.tar.gz')),
    );
  });
});

test('invalid product versions fail before creating a runtime preparation directory', async () => {
  for (const version of ['../0.1.0', '0.02.0', '0.2.0-rc.1', 2])
    await fixture(version, async (root) => {
      const result = invoke(root, 'prepare-service-runtime.mjs');
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /PRODUCT_VERSION_INVALID/);
      await assert.rejects(access(join(root, 'build/service-runtime')));
    });
});
