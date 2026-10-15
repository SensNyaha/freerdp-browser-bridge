import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const invalid = () => new Error('SBOM_INPUT_INVALID');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const reference = (value) => 'SPDXRef-' + hash(value).slice(0, 32);
const knownLicenses = new Set([
  'MIT',
  'Apache-2.0',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Zlib',
  '0BSD',
  'Unlicense',
]);
const nameValid = (name) =>
  typeof name === 'string' &&
  name.length <= 214 &&
  /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(name);
const versionValid = (version) =>
  typeof version === 'string' && /^[A-Za-z0-9.+_-]{1,128}$/.test(version);
export function packageRecord(
  name,
  version,
  id = reference(name + '@' + version),
  license,
) {
  if (!nameValid(name) || !versionValid(version)) throw invalid();
  return {
    SPDXID: id,
    name,
    versionInfo: version,
    downloadLocation: 'NOASSERTION',
    filesAnalyzed: false,
    licenseConcluded: 'NOASSERTION',
    licenseDeclared: knownLicenses.has(license) ? license : 'NOASSERTION',
    copyrightText: 'NOASSERTION',
  };
}

// Project only package identities/edges. Registry URLs, paths and arbitrary
// manifest fields are not copied into the generated document.
export function nodeInventory(records, loadManifest) {
  if (!Array.isArray(records) || records.length !== 1) throw invalid();
  const packages = new Map(),
    edges = new Map();
  let visited = 0;
  const visit = (record, depth) => {
    if (
      !record ||
      typeof record !== 'object' ||
      Array.isArray(record) ||
      depth > 64 ||
      ++visited > 4096 ||
      typeof record.path !== 'string' ||
      record.path.length > 4096
    )
      throw invalid();
    let manifest;
    try {
      manifest = loadManifest(record.path);
    } catch {
      throw invalid();
    }
    if (!manifest || typeof manifest !== 'object') throw invalid();
    const pkg = packageRecord(
      manifest.name,
      manifest.version,
      undefined,
      manifest.license,
    );
    pkg.externalRefs = [
      {
        referenceCategory: 'PACKAGE-MANAGER',
        referenceType: 'purl',
        referenceLocator: `pkg:npm/${manifest.name.split('/').map(encodeURIComponent).join('/')}@${encodeURIComponent(manifest.version)}`,
      },
    ];
    if (packages.size >= 512 && !packages.has(pkg.SPDXID)) throw invalid();
    packages.set(pkg.SPDXID, pkg);
    const children = record.dependencies ?? {};
    if (
      !children ||
      typeof children !== 'object' ||
      Array.isArray(children) ||
      Object.keys(children).length > 512
    )
      throw invalid();
    for (const child of Object.values(children)) {
      const dependency = visit(child, depth + 1);
      const key = pkg.SPDXID + ':' + dependency;
      edges.set(key, {
        spdxElementId: pkg.SPDXID,
        relationshipType: 'DEPENDS_ON',
        relatedSpdxElement: dependency,
      });
      if (edges.size > 4096) throw invalid();
    }
    return pkg.SPDXID;
  };
  const root = visit(records[0], 0);
  return {
    root,
    packages: [...packages.values()].sort((a, b) =>
      a.SPDXID.localeCompare(b.SPDXID),
    ),
    relationships: [...edges.values()].sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b)),
    ),
  };
}

export function externalNativeDocument(name, version, bytes) {
  if (
    !nameValid(name) ||
    !versionValid(version) ||
    !Buffer.isBuffer(bytes) ||
    bytes.length > 8 * 1024 * 1024
  )
    throw invalid();
  let value;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw invalid();
  }
  if (
    value?.spdxVersion !== 'SPDX-2.3' ||
    typeof value.documentNamespace !== 'string' ||
    value.documentNamespace.length > 2048 ||
    !value.documentNamespace.startsWith('https://spdx.org/spdxdocs/') ||
    !Array.isArray(value.packages) ||
    value.packages.length > 1024
  )
    throw invalid();
  if (value.packages.some((pkg) => !pkg || typeof pkg !== 'object'))
    throw invalid();
  const port = value.packages.find((pkg) => pkg.SPDXID === 'SPDXRef-port');
  if (
    port?.name !== name ||
    typeof port.versionInfo !== 'string' ||
    port.versionInfo.replace(/#[0-9]+$/, '') !== version ||
    !value.packages.some((pkg) => pkg.SPDXID === 'SPDXRef-binary')
  )
    throw invalid();
  return {
    externalDocumentId: 'DocumentRef-vcpkg-' + name,
    spdxDocument: value.documentNamespace,
    checksum: { algorithm: 'SHA256', checksumValue: hash(bytes) },
  };
}

const schemaBytes = readFileSync(
  new URL('./schemas/spdx-2.3.schema.json', import.meta.url),
);
if (
  hash(schemaBytes) !==
  '239208b7ac287b3cf5d9a9af23f9d69863971102a5e1587a27a398b43490b89b'
)
  throw new Error('SBOM_SCHEMA_MISMATCH');
const ajv = new Ajv({ strict: false, allErrors: false });
addFormats(ajv);
const validate = ajv.compile(JSON.parse(schemaBytes));
export function validateSpdx(document) {
  if (!validate(document)) throw new Error('SBOM_SCHEMA_INVALID');
  if (
    document.spdxVersion !== 'SPDX-2.3' ||
    document.SPDXID !== 'SPDXRef-DOCUMENT'
  )
    throw invalid();
  const ids = new Set([document.SPDXID]);
  for (const item of [
    ...(document.packages ?? []),
    ...(document.files ?? []),
  ]) {
    if (!/^SPDXRef-[A-Za-z0-9.+-]+$/.test(item.SPDXID) || ids.has(item.SPDXID))
      throw invalid();
    ids.add(item.SPDXID);
  }
  const external = new Set(
    (document.externalDocumentRefs ?? []).map(
      (item) => item.externalDocumentId,
    ),
  );
  if (
    external.size !== (document.externalDocumentRefs ?? []).length ||
    [...external].some((id) => !/^DocumentRef-[A-Za-z0-9.+-]+$/.test(id))
  )
    throw invalid();
  const exists = (id) =>
    ids.has(id) ||
    (typeof id === 'string' &&
      external.has(id.split(':')[0]) &&
      /^[^:]+:SPDXRef-[A-Za-z0-9.+-]+$/.test(id));
  for (const item of document.relationships ?? [])
    if (!exists(item.spdxElementId) || !exists(item.relatedSpdxElement))
      throw invalid();
  for (const id of document.documentDescribes ?? [])
    if (!ids.has(id)) throw invalid();
  return document;
}
