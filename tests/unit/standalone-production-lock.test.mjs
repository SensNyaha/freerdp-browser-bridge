import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { standaloneProductionManifest } from '../../scripts/standalone/production-lock.mjs';

for (const platform of ['win32-x64', 'linux-x64-gnu'])
  test(`standalone ${platform} production lock pins public archives and refuses version/source/development drift`, async () => {
    const lock = JSON.parse(
      await readFile(
        new URL(
          '../../packaging/standalone/locks/' + platform + '.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    const before = structuredClone(lock);
    const manifest = standaloneProductionManifest(lock, lock.version, platform);
    assert.equal(manifest.private, true);
    assert.equal(manifest.dependencies['@freerdp-bridge/api'], lock.version);
    assert.deepEqual(lock, before);
    assert.throws(
      () => standaloneProductionManifest(lock, '0.0.0', platform),
      /STANDALONE_PRODUCTION_LOCK_INVALID/,
    );
    const target = 'node_modules/@freerdp-bridge/api';
    for (const change of [
      (copy) => {
        copy.packages[target].resolved =
          'https://registry.npmjs.org.evil.invalid/archive.tgz';
      },
      (copy) => {
        copy.packages[target].resolved = 'file:../local.tgz';
      },
      (copy) => {
        copy.packages[target].integrity = 'sha1-legacy';
      },
      (copy) => {
        copy.packages[target].version = '0.0.0';
      },
      (copy) => {
        copy.packages[target].dev = true;
      },
      (copy) => {
        copy.packages[target].link = true;
      },
      (copy) => {
        copy.packages[''].dependencies.unexpected = '1.0.0';
      },
      (copy) => {
        copy.packages['node_modules/../escape'] = copy.packages[target];
      },
    ]) {
      const invalid = structuredClone(lock);
      change(invalid);
      assert.throws(
        () => standaloneProductionManifest(invalid, lock.version, platform),
        /STANDALONE_PRODUCTION_LOCK_INVALID/,
      );
    }
  });
