import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const script = resolve('scripts/check-version.mjs');
async function fixture(run) {
  await mkdir(resolve('build'), { recursive: true });
  const root = await mkdtemp(resolve('build/version-check-'));
  try {
    await mkdir(join(root, 'packages/example'), { recursive: true });
    await mkdir(join(root, 'apps/static-harness'), { recursive: true });
    await writeFile(join(root, 'package.json'), '{"version":"0.1.0"}');
    await writeFile(
      join(root, 'packages/example/package.json'),
      '{"version":"0.1.0"}',
    );
    await writeFile(
      join(root, 'CMakeLists.txt'),
      'project(Example VERSION 0.1.0 LANGUAGES CXX)\n',
    );
    await run(root);
  } finally {
    assert.equal(dirname(root), resolve('build'));
    await rm(root, { recursive: true, force: true });
  }
}
function check(root, expected = '0.1.0') {
  const result = spawnSync(process.execPath, [script, expected], {
    cwd: root,
    encoding: 'utf8',
    timeout: 5000,
    windowsHide: true,
  });
  assert.equal(result.error, undefined);
  return result;
}
test('release version check accepts consistent product/native manifests and ignores a static non-package harness', async () => {
  await fixture(async (root) => {
    const result = check(root);
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), {
      productVersion: '0.1.0',
      nativeVersion: '0.1.0',
      manifests: 2,
    });
    const wrongExpectation = check(root, '0.2.0');
    assert.equal(wrongExpectation.status, 1);
    assert.match(wrongExpectation.stderr, /VERSION_EXPECTED_MISMATCH/);
  });
});
test('release version check rejects workspace/native drift and an invalid stable release number', async () => {
  for (const [path, contents, message] of [
    [
      'packages/example/package.json',
      '{"version":"0.2.0"}',
      'VERSION_MANIFEST_MISMATCH',
    ],
    [
      'CMakeLists.txt',
      'project(Example VERSION 0.1.1 LANGUAGES CXX)',
      'VERSION_NATIVE_MISMATCH',
    ],
    ['package.json', '{"version":"0.01.0"}', 'VERSION_STABLE_REQUIRED'],
  ])
    await fixture(async (root) => {
      await writeFile(join(root, path), contents);
      const result = check(root);
      assert.equal(result.status, 1);
      assert.match(result.stderr, new RegExp(message));
    });
});
