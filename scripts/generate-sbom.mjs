import { productVersion } from './product-version.mjs';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  createReadStream,
  readFileSync,
  realpathSync,
  statSync,
  lstatSync,
  readdirSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { resolve, join, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  nodeInventory,
  packageRecord,
  externalNativeDocument,
  validateSpdx,
} from './sbom-model.mjs';
import { windowsRuntimeInventory } from './windows-runtime-model.mjs';
import { freeRdpOverrideInventory } from './freerdp-override-model.mjs';

const fail = () => new Error('SBOM_BUILD_INVALID');
const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
const windows = process.platform === 'win32';
if (
  !['linux', 'win32'].includes(process.platform) ||
  process.versions.node.split('.')[0] !== '24' ||
  process.arch !== 'x64' ||
  resolve('.') !== project ||
  process.argv.length !== 2
)
  throw fail();
const build = realpathSync(resolve('build'));
if (build !== resolve('build') || !build.startsWith(project + sep))
  throw fail();
const inside = (root, path) => path === root || path.startsWith(root + sep);
const archive = resolve(
  windows
    ? `build/packages/freerdp-bridge-sbom-${productVersion}-win64.zip`
    : `build/packages/freerdp-bridge-sbom-${productVersion}-linux.tar.gz`,
);
if (realpathSync(dirname(archive)) !== dirname(archive)) throw fail();
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
    path: resolve(
      windows
        ? `build/packages/freerdp-bridge-native-${productVersion}-win64.zip`
        : `build/packages/freerdp-bridge-native-${productVersion}-Linux.tar.gz`,
    ),
    maximum: 128 * 1024 * 1024,
    strip: windows ? 1 : 3,
  },
  ...(!windows
    ? [
        {
          name: 'node',
          path: resolve(
            `build/packages/freerdp-bridge-node-${productVersion}-linux.tar.gz`,
          ),
          maximum: 64 * 1024 * 1024,
          strip: 0,
        },
      ]
    : []),
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
      ...(input.strip ? ['--strip-components=' + input.strip] : []),
      '-C',
      join(extracted, input.name),
    ],
    { stdio: 'ignore', timeout: 30000 },
  );
  if (result.status !== 0) throw fail();
}
const nativeRoot = realpathSync(join(extracted, 'native'));
if (!inside(build, nativeRoot)) throw fail();
let node;
if (!windows) {
  const nodeRoot = realpathSync(join(extracted, 'node'));
  if (!inside(build, nodeRoot)) throw fail();
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
  node = nodeInventory(records, (path) => {
    const canonical = realpathSync(path);
    if (!inside(nodeRoot, canonical)) throw fail();
    if (!manifestCache.has(canonical))
      manifestCache.set(canonical, readJson(join(canonical, 'package.json')));
    return manifestCache.get(canonical);
  });
}
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
const overrideInput = (path, maximum) => {
  const file = join(metadata, path);
  let stat;
  try {
    stat = lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw fail();
  }
  if (
    !stat.isFile() ||
    stat.size > maximum ||
    !inside(nativeRoot, realpathSync(file))
  )
    throw fail();
  const bytes = readFileSync(file);
  if (bytes.length > maximum) throw fail();
  return bytes;
};
const overrides = freeRdpOverrideInventory(
  lock.freerdp.commit,
  overrideInput('freerdp-overrides.json', 4096),
  overrideInput('overrides/freerdp-dsp-override.cmake', 131072),
);
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
freerdp.sourceInfo = overrides.sourceInfo;
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
for (const [pkg, input] of [
  [nativeArtifact, inputs[0]],
  ...(!windows ? [[nodeArtifact, inputs[1]]] : []),
])
  pkg.checksums = [
    {
      algorithm: 'SHA256',
      checksumValue: input.hash,
    },
  ];
const relationships = [
  [
    'SPDXRef-DOCUMENT',
    'DESCRIBES',
    windows ? nativeArtifact.SPDXID : service.SPDXID,
  ],
  ...(!windows
    ? [
        [service.SPDXID, 'CONTAINS', nativeArtifact.SPDXID],
        [service.SPDXID, 'CONTAINS', nodeArtifact.SPDXID],
        [nodeArtifact.SPDXID, 'CONTAINS', node.root],
      ]
    : []),
  [nativeArtifact.SPDXID, 'CONTAINS', worker.SPDXID],
  [worker.SPDXID, 'DEPENDS_ON', freerdp.SPDXID],
].map(([spdxElementId, relationshipType, relatedSpdxElement]) => ({
  spdxElementId,
  relationshipType,
  relatedSpdxElement,
}));
if (node) relationships.push(...node.relationships);
const output = resolve(build, windows ? 'sbom-win64' : 'sbom-linux');
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
  const source = resolve(metadata, 'sbom/vcpkg', name + '.spdx.json');
  if (
    !/^[a-z0-9-]{1,64}$/.test(name) ||
    !inside(nativeRoot, realpathSync(source)) ||
    !statSync(source).isFile() ||
    statSync(source).size > 8 * 1024 * 1024 ||
    (documentBytes += statSync(source).size) > 32 * 1024 * 1024
  )
    throw fail();
  const bytes = readFileSync(source);
  const external = externalNativeDocument(
    name,
    version,
    bytes,
    windows ? 'x64-windows-bundled' : 'x64-linux-bundled',
  );
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
for (const directory of windows ? ['bin'] : ['bin', 'lib'])
  await collectFiles(directory);
for (const entry of overrides.files) {
  const id =
    'SPDXRef-file-' +
    createHash('sha256').update(entry.path).digest('hex').slice(0, 32);
  const actualHash = await digest(join(nativeRoot, entry.path), 131072);
  if (actualHash !== entry.sha256) throw fail();
  files.push({
    SPDXID: id,
    fileName: './native/' + entry.path,
    checksums: [{ algorithm: 'SHA256', checksumValue: actualHash }],
    licenseConcluded: 'NOASSERTION',
    copyrightText: 'NOASSERTION',
  });
  relationships.push(
    {
      spdxElementId: nativeArtifact.SPDXID,
      relationshipType: 'CONTAINS',
      relatedSpdxElement: id,
    },
    {
      spdxElementId: freerdp.SPDXID,
      relationshipType: 'GENERATED_FROM',
      relatedSpdxElement: id,
    },
  );
}
let crt = { packages: [], relationships: [] };
if (windows) {
  const versions = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-File',
      resolve('scripts/windows-runtime-versions.ps1'),
      '-Directory',
      join(nativeRoot, 'bin'),
    ],
    { encoding: 'utf8', maxBuffer: 16384, timeout: 10000, windowsHide: true },
  );
  if (versions.status !== 0) throw fail();
  crt = windowsRuntimeInventory(JSON.parse(versions.stdout), files);
  relationships.push(...crt.relationships);
  for (const pkg of crt.packages)
    relationships.push({
      spdxElementId: nativeArtifact.SPDXID,
      relationshipType: 'CONTAINS',
      relatedSpdxElement: pkg.SPDXID,
    });
}
const document = validateSpdx({
  spdxVersion: 'SPDX-2.3',
  dataLicense: 'CC0-1.0',
  SPDXID: 'SPDXRef-DOCUMENT',
  name: windows
    ? 'FreeRDP Node Bridge Windows native artifact'
    : 'FreeRDP Node Bridge Linux application artifacts',
  documentNamespace:
    'https://spdx.org/spdxdocs/freerdp-node-bridge-' +
    (windows ? 'win64-' : 'linux-') +
    randomUUID(),
  creationInfo: {
    created: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    creators: [`Tool: freerdp-bridge-sbom-${productVersion}`],
  },
  comment:
    (windows
      ? 'Windows native artifact only; no Node application/distribution or system Windows inventory. CRT grouping uses packaged PE file versions, not installer versions or verified publisher signatures. '
      : 'Application/native artifact inventory. Container base OS and Node runtime distribution are outside scope. ') +
    'Native component membership is flattened; upstream vcpkg documents describe complete installed packages, not only runtime files. Unresolved license declarations remain NOASSERTION.',
  documentDescribes: [windows ? nativeArtifact.SPDXID : service.SPDXID],
  packages: [
    ...(!windows ? [service, nodeArtifact, ...node.packages] : []),
    worker,
    freerdp,
    nativeArtifact,
    ...nativePackages,
    ...crt.packages,
  ],
  externalDocumentRefs,
  files,
  relationships,
});
writeFileSync(
  join(output, windows ? 'native.spdx.json' : 'application.spdx.json'),
  JSON.stringify(document, null, 2) + '\n',
);
for (const input of inputs)
  if ((await digest(input.path, input.maximum)) !== input.hash) throw fail();
const packed = spawnSync(
  'tar',
  [...(windows ? ['-a', '-cf'] : ['-czf']), archive, '-C', output, '.'],
  {
    stdio: 'ignore',
    timeout: 30000,
  },
);
if (packed.status !== 0) throw fail();
rmSync(extracted, { recursive: true, force: true }); // Known mkdtemp child of verified build root.
console.log(
  JSON.stringify({
    platform: process.platform + '-x64',
    packages: document.packages.length,
    nativeDocuments: externalDocumentRefs.length,
    files: files.length,
    relationships: relationships.length,
    schemaValidated: true,
    sbomSha256: await digest(archive, 64 * 1024 * 1024),
  }),
);
