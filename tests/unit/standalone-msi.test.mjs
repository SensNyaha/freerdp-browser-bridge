import test from 'node:test';
import assert from 'node:assert/strict';
import { standaloneWindowsMsi } from '../../scripts/standalone/windows-msi.mjs';

const required = [
  'bridge-service.exe',
  'node/node.exe',
  'node/LICENSE',
  'service/package.json',
  'service/dist/main.js',
  'bridge.example.json',
];
const entry = (path) => ({ path, bytes: 1, sha256: 'a'.repeat(64) });
const input = () => ({ version: '0.2.5', files: required.map(entry) });
test('standalone MSI rejects traversal, Windows aliases, file/directory ambiguity and unbounded manifests before rendering', () => {
  for (const path of [
    '../outside',
    '/outside',
    'service/../outside',
    'service//outside',
    'C:/outside',
    'service/file:stream',
    'service/NUL.txt',
    'service/name.',
    'service/name ',
    'service/$(var.Bad)',
    'service/file\nname',
    'service\\escape',
  ])
    assert.throws(
      () =>
        standaloneWindowsMsi({
          ...input(),
          files: [...input().files, entry(path)],
        }),
      /STANDALONE_MSI_MANIFEST_INVALID/,
    );
  for (const extra of [
    [entry('NODE/node.exe')],
    [entry('service/package.json/child')],
    [entry('Service/other.js')],
  ])
    assert.throws(
      () =>
        standaloneWindowsMsi({
          ...input(),
          files: [...input().files, ...extra],
        }),
      /STANDALONE_MSI_MANIFEST_INVALID/,
    );
  for (const version of [
    '0.2.5-beta',
    '256.0.0',
    '0.256.0',
    '0.2.65536',
    '01.2.5',
    '0.2.5" injected="yes',
  ])
    assert.throws(
      () => standaloneWindowsMsi({ ...input(), version }),
      /STANDALONE_MSI_MANIFEST_INVALID/,
    );
  for (const invalid of [
    [],
    required.slice(1).map(entry),
    Array(10001).fill(entry('file')),
    [...input().files, { ...entry('large'), bytes: 536870913 }],
    [...input().files, { ...entry('bad-hash'), sha256: 'not-a-digest' }],
  ])
    assert.throws(
      () => standaloneWindowsMsi({ ...input(), files: invalid }),
      /STANDALONE_MSI_MANIFEST_INVALID/,
    );
});

test('standalone MSI renders stable inventory order, preserves public configuration and separates development upgrade identity', () => {
  const before = input();
  const snapshot = structuredClone(before);
  const production = standaloneWindowsMsi(before);
  assert.deepEqual(before, snapshot);
  assert.equal(
    standaloneWindowsMsi({ ...before, files: [...before.files].reverse() }),
    production,
  );
  assert.match(production, /Scope="perMachine"/);
  assert.match(production, /Account="NT AUTHORITY\\LocalService"/);
  assert.match(production, /Permanent="yes" NeverOverwrite="yes"/);
  assert.match(production, /Stop="both" Remove="uninstall" Wait="yes"/);
  assert.match(production, /ThirdFailureActionType="none"/);
  const development = standaloneWindowsMsi({ ...before, development: true });
  assert.notEqual(
    production.match(/UpgradeCode="([^"]+)"/)[1],
    development.match(/UpgradeCode="([^"]+)"/)[1],
  );
  assert.ok(!production.includes('<CustomAction'));
});
