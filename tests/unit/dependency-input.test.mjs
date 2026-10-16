import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { resolve, sep } from 'node:path';
import {
  dependencyRecipeHash,
  dependencyRoots,
  readDependencyReceipt,
} from '../../scripts/dependency-input.mjs';

test('dependency build input binds source-only provenance, current recipes and exact installed status before SDK use', () => {
  const root = mkdtempSync(resolve('build/dependencies-source-clean-guard-'));
  assert.ok(root.startsWith(resolve('build') + sep));
  try {
    const triplet =
      process.platform === 'win32'
        ? 'x64-windows-bundled'
        : 'x64-linux-bundled';
    const installed = resolve(root, 'installed'),
      prefix = resolve(installed, triplet);
    mkdirSync(resolve(installed, 'vcpkg'), { recursive: true });
    mkdirSync(prefix);
    const required = dependencyRoots(triplet);
    const status = required
      .map(
        (name) =>
          `Package: ${name}\nVersion: 1.0\nArchitecture: ${triplet}\nStatus: install ok installed\n`,
      )
      .join('\n');
    const statusPath = resolve(installed, 'vcpkg/status');
    writeFileSync(statusPath, status);
    const path = resolve(installed, 'bridge-dependency-build.json');
    const receipt = {
      vcpkgCommit: JSON.parse(readFileSync('native/dependencies.json', 'utf8'))
        .vcpkg.commit,
      triplet,
      prefix,
      isolatedSourceRebuild: true,
      binaryCache: false,
      sourceDownloadsAllowed: false,
      cachedSourceInputs: true,
      maxConcurrency: 2,
      buildDeadlineMs: 3600000,
      recipeUnchanged: true,
      recipeSha256: dependencyRecipeHash(),
      statusSha256: createHash('sha256').update(status).digest('hex'),
      installedRecords: required.length,
      required,
    };
    const save = (body) => writeFileSync(path, JSON.stringify(body));
    save(receipt);
    const accepted = readDependencyReceipt(path, triplet);
    assert.equal(accepted.prefix, prefix);
    assert.equal(accepted.installedRoot, installed);
    assert.equal(
      accepted.sha256,
      createHash('sha256').update(readFileSync(path)).digest('hex'),
    );
    for (const changed of [
      { binaryCache: true },
      { sourceDownloadsAllowed: true },
      { recipeSha256: '0'.repeat(64) },
      { prefix: resolve('.deps/installed', triplet) },
      { vcpkgCommit: '0'.repeat(40) },
    ]) {
      save({ ...receipt, ...changed });
      assert.throws(
        () => readDependencyReceipt(path, triplet),
        /provenance does not match/,
      );
    }
    save(receipt);
    writeFileSync(
      statusPath,
      status + 'status-content-must-not-appear-in-errors',
    );
    assert.throws(
      () => readDependencyReceipt(path, triplet),
      /^Error: Dependency installed status does not match its receipt$/,
    );
    writeFileSync(path, 'x'.repeat(65537));
    assert.throws(() => readDependencyReceipt(path, triplet), /input exceeded/);
    writeFileSync(path, '"receipt-content-must-not-appear-in-errors');
    assert.throws(
      () => readDependencyReceipt(path, triplet),
      /^Error: Invalid dependency build receipt$/,
    );
    assert.throws(
      () => readDependencyReceipt('.local-tests/never-open-this.json', triplet),
      /outside an isolated build prefix/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
