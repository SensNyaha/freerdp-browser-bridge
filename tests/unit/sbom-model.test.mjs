import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  nodeInventory,
  packageRecord,
  externalNativeDocument,
  validateSpdx,
} from '../../scripts/sbom-model.mjs';

const make = () => ({
  spdxVersion: 'SPDX-2.3',
  SPDXID: 'SPDXRef-DOCUMENT',
  dataLicense: 'CC0-1.0',
  name: 'fixture',
  documentNamespace: 'https://spdx.org/spdxdocs/fixture',
  creationInfo: {
    created: '2026-10-15T00:00:00Z',
    creators: ['Tool: fixture'],
  },
  packages: [packageRecord('fixture', '1.0.0', 'SPDXRef-app', 'MIT')],
  documentDescribes: ['SPDXRef-app'],
  relationships: [
    {
      spdxElementId: 'SPDXRef-DOCUMENT',
      relationshipType: 'DESCRIBES',
      relatedSpdxElement: 'SPDXRef-app',
    },
  ],
});

test('SBOM Node projection: scoped identity, repeated dependencies, exact graph and metadata privacy', () => {
  const child = {
    path: '/fixture/dep',
    resolved: 'https://user:synthetic-secret@registry.invalid/file',
    password: 'synthetic-secret',
  };
  const root = {
    path: '/fixture/app',
    dependencies: { one: child, two: child },
    privateValue: 'synthetic-secret',
  };
  const graph = nodeInventory([root], (path) =>
    path.endsWith('/app')
      ? { name: '@fixture/app', version: '1.0.0', license: 'synthetic-secret' }
      : { name: 'dep', version: '2.0.0', license: 'MIT' },
  );
  assert.equal(graph.packages.length, 2);
  assert.equal(graph.relationships.length, 1);
  const app = graph.packages.find((pkg) => pkg.name === '@fixture/app');
  assert.equal(app.licenseDeclared, 'NOASSERTION');
  assert.equal(
    app.externalRefs[0].referenceLocator,
    'pkg:npm/%40fixture/app@1.0.0',
  );
  assert.equal(
    graph.packages.find((pkg) => pkg.name === 'dep').licenseDeclared,
    'MIT',
  );
  assert.ok(!JSON.stringify(graph).includes('synthetic-secret'));
  assert.ok(!JSON.stringify(graph).includes('/fixture/'));
});

test('SBOM Node projection: recursion/count/identity and callback failures are bounded and fixed', () => {
  const lookup = () => ({ name: 'fixture', version: '1.0.0' });
  for (const input of [
    [],
    [{ path: 'x' }, { path: 'y' }],
    [{ path: 'x', dependencies: [] }],
    [{ path: 'x'.repeat(4097) }],
  ])
    assert.throws(() => nodeInventory(input, lookup), {
      message: 'SBOM_INPUT_INVALID',
    });
  const cycle = { path: 'x' };
  cycle.dependencies = { cycle };
  assert.throws(() => nodeInventory([cycle], lookup), {
    message: 'SBOM_INPUT_INVALID',
  });
  assert.throws(
    () =>
      nodeInventory([{ path: 'x' }], () => {
        throw new Error('synthetic-secret');
      }),
    { message: 'SBOM_INPUT_INVALID' },
  );
  assert.throws(() => nodeInventory([{ path: 'x' }], () => null), {
    message: 'SBOM_INPUT_INVALID',
  });
  assert.throws(() => packageRecord('../secret', '1.0.0'), {
    message: 'SBOM_INPUT_INVALID',
  });
  assert.throws(() => packageRecord('fixture', 'user:synthetic-secret'), {
    message: 'SBOM_INPUT_INVALID',
  });
});

test('SBOM Node resource bounds reject excessive unique packages and repeated tree expansion', () => {
  const branches = Object.fromEntries(
    Array.from({ length: 256 }, (_, i) => [
      'dep' + i,
      { path: 'pkg' + i, dependencies: { leaf: { path: 'leaf' + i } } },
    ]),
  );
  assert.throws(
    () =>
      nodeInventory([{ path: 'root', dependencies: branches }], (path) => ({
        name: path,
        version: '1.0.0',
      })),
    { message: 'SBOM_INPUT_INVALID' },
  );
  const leaves = Object.fromEntries(
    Array.from({ length: 512 }, (_, i) => ['leaf' + i, { path: 'leaf' }]),
  );
  const repeated = Object.fromEntries(
    Array.from({ length: 16 }, (_, i) => [
      'branch' + i,
      { path: 'branch', dependencies: leaves },
    ]),
  );
  assert.throws(
    () =>
      nodeInventory([{ path: 'root', dependencies: repeated }], () => ({
        name: 'fixture',
        version: '1.0.0',
      })),
    { message: 'SBOM_INPUT_INVALID' },
  );
});

test('SBOM native companion: exact identity/version/target and checksum bind unmodified upstream bytes', () => {
  const doc = {
    spdxVersion: 'SPDX-2.3',
    documentNamespace: 'https://spdx.org/spdxdocs/zlib-fixture',
    packages: [
      { SPDXID: 'SPDXRef-port', name: 'zlib', versionInfo: '1.3.2#2' },
      { SPDXID: 'SPDXRef-binary' },
    ],
  };
  const bytes = Buffer.from(JSON.stringify(doc));
  const reference = externalNativeDocument('zlib', '1.3.2', bytes);
  assert.equal(
    reference.checksum.checksumValue,
    createHash('sha256').update(bytes).digest('hex'),
  );
  assert.equal(reference.externalDocumentId, 'DocumentRef-vcpkg-zlib');
  assert.throws(() => externalNativeDocument('zlib', '1.3.3', bytes), {
    message: 'SBOM_INPUT_INVALID',
  });
  assert.throws(
    () =>
      externalNativeDocument(
        'zlib',
        '1.3.2',
        Buffer.from('bad synthetic-secret'),
      ),
    { message: 'SBOM_INPUT_INVALID' },
  );
  doc.packages.pop();
  assert.throws(
    () =>
      externalNativeDocument('zlib', '1.3.2', Buffer.from(JSON.stringify(doc))),
    { message: 'SBOM_INPUT_INVALID' },
  );
});

test('SBOM schema and semantic graph: reject unknown fields, duplicate IDs and dangling relationships', () => {
  assert.equal(validateSpdx(make()).spdxVersion, 'SPDX-2.3');
  const unknown = make();
  unknown.password = 'synthetic-secret';
  assert.throws(() => validateSpdx(unknown), {
    message: 'SBOM_SCHEMA_INVALID',
  });
  const duplicate = make();
  duplicate.packages.push({ ...duplicate.packages[0] });
  assert.throws(() => validateSpdx(duplicate), {
    message: 'SBOM_INPUT_INVALID',
  });
  const dangling = make();
  dangling.relationships[0].relatedSpdxElement = 'SPDXRef-missing';
  assert.throws(() => validateSpdx(dangling), {
    message: 'SBOM_INPUT_INVALID',
  });
  const external = make();
  external.relationships.push({
    spdxElementId: 'SPDXRef-app',
    relationshipType: 'GENERATED_FROM',
    relatedSpdxElement: 'DocumentRef-unpublished:SPDXRef-port',
  });
  assert.throws(() => validateSpdx(external), {
    message: 'SBOM_INPUT_INVALID',
  });
  const duplicateExternal = make();
  const entry = {
    externalDocumentId: 'DocumentRef-fixture',
    spdxDocument: 'https://spdx.org/spdxdocs/fixture',
    checksum: { algorithm: 'SHA256', checksumValue: '0'.repeat(64) },
  };
  duplicateExternal.externalDocumentRefs = [
    entry,
    { ...entry, spdxDocument: 'https://spdx.org/spdxdocs/other' },
  ];
  assert.throws(() => validateSpdx(duplicateExternal), {
    message: 'SBOM_INPUT_INVALID',
  });
});
