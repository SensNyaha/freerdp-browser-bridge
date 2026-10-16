import { spawnSync } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  realpath,
  readFile,
  stat,
} from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSpdx } from './sbom-model.mjs';

const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
if (
  resolve('.') !== project ||
  process.argv.length !== 2 ||
  process.versions.node.split('.')[0] !== '24' ||
  !['linux', 'win32'].includes(process.platform)
)
  throw new Error('SBOM_ARTIFACT_TEST_ARGUMENT');
const build = await realpath(resolve('build'));
if (build !== resolve('build') || !build.startsWith(project + sep))
  throw new Error('SBOM_ARTIFACT_TEST_DIRECTORY');
const fixture = await mkdtemp(join(build, 'sbom-artifacts-only-'));
await mkdir(join(fixture, 'scripts/schemas'), { recursive: true });
await mkdir(join(fixture, 'native'));
await mkdir(join(fixture, 'build/packages'), { recursive: true });
for (const path of [
  'package.json',
  'native/dependencies.json',
  'scripts/generate-sbom.mjs',
  'scripts/sbom-model.mjs',
  'scripts/freerdp-override-model.mjs',
  'scripts/windows-runtime-model.mjs',
  'scripts/windows-runtime-versions.ps1',
  'scripts/schemas/spdx-2.3.schema.json',
])
  await copyFile(resolve(path), join(fixture, path));
const windows = process.platform === 'win32';
for (const name of windows
  ? ['freerdp-bridge-native-0.1.0-win64.zip']
  : [
      'freerdp-bridge-native-0.1.0-Linux.tar.gz',
      'freerdp-bridge-node-0.1.0-linux.tar.gz',
    ]) {
  const source = resolve('build/packages', name);
  if (
    (await stat(source)).size > 128 * 1024 * 1024 ||
    !(await realpath(source)).startsWith(build + sep)
  )
    throw new Error('SBOM_ARTIFACT_TEST_INPUT');
  await copyFile(source, join(fixture, 'build/packages', name));
}
// There is deliberately no .deps, native staging tree or dependency receipt
// outside the archives. JS validator packages resolve from the parent install.
const result = spawnSync(process.execPath, ['scripts/generate-sbom.mjs'], {
  cwd: fixture,
  windowsHide: true,
  encoding: 'utf8',
  maxBuffer: 16384,
  timeout: 120000,
});
if (result.status !== 0) throw new Error('SBOM_ARTIFACT_TEST_FAILED');
const reportFile = join(
  fixture,
  'build',
  windows ? 'sbom-win64/native.spdx.json' : 'sbom-linux/application.spdx.json',
);
if ((await stat(reportFile)).size > 8 * 1024 * 1024)
  throw new Error('SBOM_ARTIFACT_TEST_SIZE');
const document = validateSpdx(JSON.parse(await readFile(reportFile, 'utf8')));
if (document.externalDocumentRefs.length !== (windows ? 7 : 13))
  throw new Error('SBOM_ARTIFACT_TEST_COUNT');
const freerdp = document.packages.find(
  (pkg) => pkg.SPDXID === 'SPDXRef-freerdp',
);
const overrideFiles = document.files.filter((file) =>
  /^\.\/native\/share\/freerdp-bridge\/(freerdp-overrides\.json|overrides\/freerdp-dsp-override\.cmake)$/.test(
    file.fileName,
  ),
);
const corrected = freerdp.sourceInfo.includes('dsp-opus-reset-ownership-v1');
if (corrected) {
  if (
    overrideFiles.length !== 2 ||
    overrideFiles.some(
      (file) =>
        !document.relationships.some(
          (edge) =>
            edge.spdxElementId === freerdp.SPDXID &&
            edge.relationshipType === 'GENERATED_FROM' &&
            edge.relatedSpdxElement === file.SPDXID,
        ),
    )
  )
    throw new Error('SBOM_ARTIFACT_TEST_OVERRIDE');
} else if (
  overrideFiles.length !== 0 ||
  !freerdp.sourceInfo.includes('modification status not established')
) {
  throw new Error('SBOM_ARTIFACT_TEST_LEGACY');
}
console.log(
  JSON.stringify({
    platform: process.platform + '-x64',
    nativeSdkPresent: false,
    upstreamDocumentsFromArchive: document.externalDocumentRefs.length,
    packages: document.packages.length,
    schemaValidated: true,
    freerdpOverrideRecorded: corrected,
  }),
);
