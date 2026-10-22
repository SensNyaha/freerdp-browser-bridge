import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import {
  checkNpmArchiveReadme,
  validateNpmReadme,
} from '../../scripts/npm-readme.mjs';

const name = '@freerdp-bridge/config';
const readme = await readFile('packages/config/README.md', 'utf8');

test('npm README contract rejects a missing usage/license section or wrong package', () => {
  assert.equal(validateNpmReadme(readme, name).name, name);
  for (const invalid of [
    '',
    readme.replace('## Usage', 'Usage'),
    readme.replace('## License', 'License'),
    readme.replaceAll(name, '@other/package'),
    readme + 'x'.repeat(65536),
  ])
    assert.throws(() => validateNpmReadme(invalid, name), /NPM_README_INVALID/);
});

test('actual npm archives require a bounded explanatory README at package root', async () => {
  await mkdir('build', { recursive: true });
  const root = await mkdtemp(resolve('build/npm-readme-'));
  try {
    const payload = join(root, 'package');
    await mkdir(join(payload, 'corresponding-source'), { recursive: true });
    await writeFile(
      join(payload, 'package.json'),
      JSON.stringify({ name, version: '1.2.3' }),
    );
    await writeFile(join(payload, 'corresponding-source/README.md'), readme);
    const archive = join(root, 'package with spaces.tgz');
    const pack = () => {
      const result = spawnSync(
        'tar',
        ['-czf', archive, '-C', root, 'package'],
        {
          encoding: 'utf8',
          timeout: 10000,
          windowsHide: true,
        },
      );
      assert.equal(result.error, undefined);
      assert.equal(result.status, 0);
    };
    // LGPL build instructions nested in a runtime are not an npm package README.
    pack();
    await assert.rejects(checkNpmArchiveReadme(archive), /NPM_README_INVALID/);
    await writeFile(join(payload, 'README.md'), readme);
    pack();
    assert.deepEqual(await checkNpmArchiveReadme(archive), {
      name,
      readmeBytes: Buffer.byteLength(readme),
    });
    await writeFile(join(payload, 'README.md'), readme + 'x'.repeat(65536));
    pack();
    await assert.rejects(checkNpmArchiveReadme(archive), /NPM_README_INVALID/);
  } finally {
    assert.equal(dirname(root), resolve('build'));
    await rm(root, { recursive: true, force: true });
  }
});

test('workspace documentation check discovers future publishable adapters', async () => {
  await mkdir('build', { recursive: true });
  const root = await mkdtemp(resolve('build/npm-readme-workspace-'));
  try {
    for (const directory of ['apps', 'packages/new-adapter', 'docs/npm'])
      await mkdir(join(root, directory), { recursive: true });
    for (const platform of ['win32-x64', 'linux-x64-gnu']) {
      const path = 'docs/npm/runtime-' + platform + '.README.md';
      await writeFile(join(root, path), await readFile(path));
    }
    await writeFile(
      join(root, 'packages/new-adapter/package.json'),
      JSON.stringify({ name, version: '1.2.3' }),
    );
    const invoke = () =>
      spawnSync(process.execPath, [resolve('scripts/check-npm-readmes.mjs')], {
        cwd: root,
        encoding: 'utf8',
        timeout: 10000,
        windowsHide: true,
      });
    assert.notEqual(invoke().status, 0);
    await writeFile(join(root, 'packages/new-adapter/README.md'), readme);
    const result = invoke();
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).npmReadmes.length, 3);
  } finally {
    assert.equal(dirname(root), resolve('build'));
    await rm(root, { recursive: true, force: true });
  }
});
