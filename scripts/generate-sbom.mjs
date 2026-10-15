import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  createReadStream,
  readFileSync,
  realpathSync,
  statSync,
  readdirSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  nodeInventory,
  packageRecord,
  externalNativeDocument,
  validateSpdx,
} from './sbom-model.mjs';

const fail = () => new Error('SBOM_BUILD_INVALID');
const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
if (
  process.platform !== 'linux' ||
  process.arch !== 'x64' ||
  resolve('.') !== project ||
  process.argv.length !== 2
)
  throw fail();
const build = realpathSync(resolve('build'));
const inside = (root, path) => path === root || path.startsWith(root + sep);
const archive = resolve('build/packages/freerdp-bridge-sbom-linux.tar.gz');
rmSync(archive, { force: true }); // Never retain a stale success archive after failure.
const readJson = (path, maximum = 65536) => {
  try {
    if (!statSync(path).isFile() || statSync(path).size > maximum) throw fail();
    return JSON.parse(readFileSync(path));
  } catch {
    throw fail();
  }
};
const digest = async (path, maximum) => {
  const before = statSync(path);
  if (!before.isFile() || before.size > maximum) throw fail();
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(path, { highWaterMark: 65536 })) {
    bytes += chunk.length;
    if (bytes > maximum) throw fail();
    hash.update(chunk);
  }
  const after = statSync(path);
  if (
    bytes !== before.size ||
    before.size !== after.size ||
    before.mtimeMs !== after.mtimeMs
  )
    throw fail();
  return hash.digest('hex');
};

// Inventory exact packaged artifacts, not mutable SDK/staging directories.
const extracted = mkdtempSync(join(build, 'sbom-input-'));
const inputs = [
  {
    name: 'native',
    path: resolve('build/packages/freerdp-bridge-native-0.1.0-Linux.tar.gz'),
    maximum: 128 * 1024 * 1024,
    strip: true,
  },
  {
    name: 'node',
    path: resolve('build/packages/freerdp-bridge-node-0.1.0-linux.tar.gz'),
    maximum: 64 * 1024 * 1024,
    strip: false,
  },
];
for (const input of inputs) {
  if (!inside(build, realpathSync(input.path))) throw fail();
  input.hash = await digest(input.path, input.maximum);
  mkdirSync(join(extracted, input.name));
  const result = spawnSync(
    'tar',
    [
      '-xf',
      input.path,
      ...(input.strip ? ['--strip-components=3'] : []),
      '-C',
      join(extracted, input.name),
    ],
    { stdio: 'ignore', timeout: 30000 },
  );
  if (result.status !== 0) throw fail();
}
const nodeRoot = realpathSync(join(extracted, 'node'));
const nativeRoot = realpathSync(join(extracted, 'native'));
if (!inside(build, nodeRoot) || !inside(build, nativeRoot)) throw fail();
const listed = spawnSync(
  'pnpm',
  [
    '--ignore-workspace',
    '--dir',
    nodeRoot,
    'list',
    '--prod',
    '--depth',
    'Infinity',
    '--json',
  ],
  { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 30000 },
);
if (listed.status !== 0 || Buffer.byteLength(listed.stdout) > 4 * 1024 * 1024)
  throw fail();
const manifestCache = new Map();
let records;
try {
  records = JSON.parse(listed.stdout);
} catch {
  throw fail();
}
const node = nodeInventory(records, (path) => {
  const canonical = realpathSync(path);
  if (!inside(nodeRoot, canonical)) throw fail();
  if (!manifestCache.has(canonical))
    manifestCache.set(canonical, readJson(join(canonical, 'package.json')));
  return manifestCache.get(canonical);
});
const metadata = join(nativeRoot, 'share/freerdp-bridge');
const features = readJson(join(metadata, 'native-features.json'));
const lock = readJson(join(metadata, 'dependencies.json'));
const repositoryLock = readJson(resolve('native/dependencies.json'));
if (
  lock.freerdp.version !== '3.32.1' ||
  lock.freerdp.commit !== repositoryLock.freerdp.commit ||
  features.freeRdpSourceCommit !== lock.freerdp.commit ||
  features.vcpkgCommit !== lock.vcpkg.commit ||
  !/^[0-9a-f]{40}$/.test(lock.freerdp.commit)
)
  throw fail();
const projectVersion = readJson(resolve('package.json')).version;
const service = packageRecord(
  'freerdp-node-bridge',
  projectVersion,
  'SPDXRef-application',
);
const worker = packageRecord('rdp-worker', projectVersion, 'SPDXRef-worker');
const freerdp = packageRecord(
  'freerdp',
  lock.freerdp.version,
  'SPDXRef-freerdp',
  'Apache-2.0',
);
freerdp.sourceInfo =
  'Pinned FreeRDP/WinPR source commit ' + lock.freerdp.commit;
freerdp.downloadLocation =
  'git+https://github.com/FreeRDP/FreeRDP.git@' + lock.freerdp.commit;
const nativeArtifact = packageRecord(
  'freerdp-bridge-native-artifact',
  projectVersion,
  'SPDXRef-native-artifact',
);
const nodeArtifact = packageRecord(
  'freerdp-bridge-node-artifact',
  projectVersion,
  'SPDXRef-node-artifact',
);
for (const [pkg, path, maximum] of [
  [
    nativeArtifact,
    'build/packages/freerdp-bridge-native-0.1.0-Linux.tar.gz',
    128 * 1024 * 1024,
  ],
  [
    nodeArtifact,
    'build/packages/freerdp-bridge-node-0.1.0-linux.tar.gz',
    64 * 1024 * 1024,
  ],
])
  pkg.checksums = [
    {
      algorithm: 'SHA256',
      checksumValue: await digest(resolve(path), maximum),
    },
  ];
const relationships = [
  ['SPDXRef-DOCUMENT', 'DESCRIBES', service.SPDXID],
  [service.SPDXID, 'CONTAINS', nativeArtifact.SPDXID],
  [service.SPDXID, 'CONTAINS', nodeArtifact.SPDXID],
  [nodeArtifact.SPDXID, 'CONTAINS', node.root],
  [nativeArtifact.SPDXID, 'CONTAINS', worker.SPDXID],
  [worker.SPDXID, 'DEPENDS_ON', freerdp.SPDXID],
].map(([spdxElementId, relationshipType, relatedSpdxElement]) => ({
  spdxElementId,
  relationshipType,
  relatedSpdxElement,
}));
relationships.push(...node.relationships);
const output = resolve(build, 'sbom-linux');
try {
  if (realpathSync(output) !== output) throw fail();
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
rmSync(output, { recursive: true, force: true });
mkdirSync(join(output, 'vcpkg'), { recursive: true });
const externalDocumentRefs = [],
  nativePackages = [];
let documentBytes = 0;
const dependencyEntries = Object.entries(features.dependencies ?? {});
if (!dependencyEntries.length || dependencyEntries.length > 32) throw fail();
for (const [name, version] of dependencyEntries.sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  const pkg = packageRecord(name, version, 'SPDXRef-native-' + name);
  const source = resolve(
    '.deps/installed/x64-linux-bundled/share',
    name,
    'vcpkg.spdx.json',
  );
  if (
    !/^[a-z0-9-]{1,64}$/.test(name) ||
    !statSync(source).isFile() ||
    statSync(source).size > 8 * 1024 * 1024 ||
    (documentBytes += statSync(source).size) > 32 * 1024 * 1024
  )
    throw fail();
  const bytes = readFileSync(source);
  const external = externalNativeDocument(name, version, bytes);
  externalDocumentRefs.push(external);
  nativePackages.push(pkg);
  writeFileSync(join(output, 'vcpkg', name + '.spdx.json'), bytes);
  relationships.push({
    spdxElementId: nativeArtifact.SPDXID,
    relationshipType: 'CONTAINS',
    relatedSpdxElement: pkg.SPDXID,
  });
  relationships.push({
    spdxElementId: pkg.SPDXID,
    relationshipType: 'GENERATED_FROM',
    relatedSpdxElement: external.externalDocumentId + ':SPDXRef-port',
  });
}
const files = [];
let fileBytes = 0;
async function collectFiles(directory, depth = 0) {
  if (depth > 16) throw fail();
  const entries = readdirSync(join(nativeRoot, directory), {
    withFileTypes: true,
  }).sort((a, b) => a.name.localeCompare(b.name));
  if (entries.length > 512) throw fail();
  for (const entry of entries) {
    const name = entry.name;
    if (!/^[A-Za-z0-9_.+-]{1,255}$/.test(name)) throw fail();
    const path = join(nativeRoot, directory, name);
    if (!inside(nativeRoot, realpathSync(path))) throw fail();
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (!entry.isDirectory()) throw fail();
      await collectFiles(directory + '/' + name, depth + 1);
      continue;
    }
    if (files.length >= 1024 || (fileBytes += stat.size) > 512 * 1024 * 1024)
      throw fail();
    const id =
      'SPDXRef-file-' +
      createHash('sha256')
        .update(directory + '/' + name)
        .digest('hex')
        .slice(0, 32);
    files.push({
      SPDXID: id,
      fileName: './native/' + directory + '/' + name,
      checksums: [
        {
          algorithm: 'SHA256',
          checksumValue: await digest(path, 256 * 1024 * 1024),
        },
      ],
      licenseConcluded: 'NOASSERTION',
      copyrightText: 'NOASSERTION',
    });
    relationships.push({
      spdxElementId: nativeArtifact.SPDXID,
      relationshipType: 'CONTAINS',
      relatedSpdxElement: id,
    });
  }
}
for (const directory of ['bin', 'lib']) await collectFiles(directory);
const document = validateSpdx({
  spdxVersion: 'SPDX-2.3',
  dataLicense: 'CC0-1.0',
  SPDXID: 'SPDXRef-DOCUMENT',
  name: 'FreeRDP Node Bridge Linux application artifacts',
  documentNamespace:
    'https://spdx.org/spdxdocs/freerdp-node-bridge-linux-' + randomUUID(),
  creationInfo: {
    created: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    creators: ['Tool: freerdp-bridge-sbom-0.1.0'],
  },
  comment:
    'Application/native artifact inventory. Container base OS and Node runtime distribution are outside scope. Native component membership is flattened; upstream vcpkg documents describe complete installed packages, not only runtime files. Unresolved license declarations remain NOASSERTION.',
  documentDescribes: [service.SPDXID],
  packages: [
    service,
    worker,
    freerdp,
    nativeArtifact,
    nodeArtifact,
    ...node.packages,
    ...nativePackages,
  ],
  externalDocumentRefs,
  files,
  relationships,
});
writeFileSync(
  join(output, 'application.spdx.json'),
  JSON.stringify(document, null, 2) + '\n',
);
for (const input of inputs)
  if ((await digest(input.path, input.maximum)) !== input.hash) throw fail();
const packed = spawnSync('tar', ['-czf', archive, '-C', output, '.'], {
  stdio: 'ignore',
  timeout: 30000,
});
if (packed.status !== 0) throw fail();
rmSync(extracted, { recursive: true, force: true }); // Known mkdtemp child of verified build root.
console.log(
  JSON.stringify({
    platform: 'linux-x64',
    packages: document.packages.length,
    nativeDocuments: externalDocumentRefs.length,
    files: files.length,
    relationships: relationships.length,
    schemaValidated: true,
    sbomSha256: await digest(archive, 64 * 1024 * 1024),
  }),
);
