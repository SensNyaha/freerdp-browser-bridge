import { spawn } from 'node:child_process';
import {
  readFile,
  writeFile,
  stat,
  mkdir,
  realpath,
  rm,
} from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureSbomTool } from './fetch-sbom-tool.mjs';
import { validateSpdx } from './sbom-model.mjs';
import {
  imageReference,
  imageInspection,
  imageConfig,
  imageInventory,
} from './image-sbom-model.mjs';

const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
const image = imageReference(process.argv[2]);
if (process.argv.length !== 3 || resolve('.') !== project)
  throw new Error('SBOM_IMAGE_ARGUMENT');

// No shell, registry source, container execution or raw scanner diagnostics.
async function command(executable, args, cwd = project) {
  return new Promise((resolveCommand, reject) => {
    const child = spawn(executable, args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            ([key]) => !key.startsWith('SYFT_'),
          ),
        ),
        SYFT_CHECK_FOR_APP_UPDATE: 'false',
        SYFT_ENRICH: '',
      },
    });
    const chunks = [];
    let bytes = 0;
    let failed = false;
    const fail = () => {
      failed = true;
      child.kill();
    };
    const timer = setTimeout(fail, 180000);
    for (const stream of [child.stdout, child.stderr])
      stream.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > 65536) fail();
        else if (stream === child.stdout) chunks.push(chunk);
      });
    child.once('error', () => {
      clearTimeout(timer);
      reject(new Error('SBOM_IMAGE_PROCESS'));
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 || failed) reject(new Error('SBOM_IMAGE_PROCESS'));
      else resolveCommand(Buffer.concat(chunks).toString('utf8'));
    });
  });
}
const tool = await ensureSbomTool();
const inspected = imageInspection(
  JSON.parse(await command('docker', ['image', 'inspect', image])),
);
const imageId = inspected.Id;
const directory = resolve('build', 'image-sbom-' + imageId.slice(7, 23));
await mkdir(directory, { recursive: true });
if ((await realpath(directory)) !== directory)
  throw new Error('SBOM_IMAGE_DIRECTORY');
const archive = join(directory, 'runtime-image.tar');
async function archiveChecksum() {
  const value = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(archive, {
    highWaterMark: 65536,
  })) {
    if ((bytes += chunk.length) > 512 * 1024 * 1024)
      throw new Error('SBOM_IMAGE_ARCHIVE_SIZE');
    value.update(chunk);
  }
  return value.digest('hex');
}
const report = join(directory, 'runtime-image.spdx.json');
const inventory = join(directory, 'runtime-image.syft.json');
await mkdir(resolve('build/packages'), { recursive: true });
const published = resolve('build/packages/freerdp-bridge-runtime.spdx.json');
const receiptPath = resolve('build/packages/freerdp-bridge-runtime-sbom.json');
await rm(published, { force: true });
await rm(receiptPath, { force: true });
await command('docker', ['image', 'save', '--output', archive, imageId]);
if ((await stat(archive)).size > 512 * 1024 * 1024)
  throw new Error('SBOM_IMAGE_ARCHIVE_SIZE');
const archiveSha256 = await archiveChecksum();
const config = await imageConfig(imageId, async (id) => {
  const name = id.slice(7);
  try {
    return Buffer.from(
      await command('tar', ['-xOf', archive, 'blobs/sha256/' + name]),
    );
  } catch {
    // Classic Docker save uses a flat config filename instead of OCI blobs.
    return Buffer.from(await command('tar', ['-xOf', archive, name + '.json']));
  }
});
await command(
  tool.executable,
  [
    'scan',
    'docker-archive:runtime-image.tar',
    '--config',
    join(project, 'scripts/syft.yaml'),
    '--quiet',
    '--scope',
    'squashed',
    '--parallelism',
    '2',
    '--source-name',
    'freerdp-bridge-service',
    '--source-version',
    imageId,
    '--output',
    'spdx-json=runtime-image.spdx.json',
    '--output',
    'syft-json=runtime-image.syft.json',
  ],
  directory,
);
for (const file of [report, inventory])
  if (
    !(await stat(file)).isFile() ||
    (await stat(file)).size > 32 * 1024 * 1024
  )
    throw new Error('SBOM_IMAGE_REPORT_SIZE');
const bytes = await readFile(report);
const document = validateSpdx(JSON.parse(bytes));
const source = JSON.parse(await readFile(inventory, 'utf8'));
const packageTypes = imageInventory(inspected, config, source);
const hash = (data) => createHash('sha256').update(data).digest('hex');
if ((await archiveChecksum()) !== archiveSha256)
  throw new Error('SBOM_IMAGE_ARCHIVE_CHANGED');
const receipt = {
  imageId,
  configDigest: config.digest,
  imageBytes: inspected.Size,
  archiveSha256,
  scanner: {
    name: 'syft',
    version: tool.version,
    archiveSha256: tool.archiveSha256,
  },
  scope: 'squashed',
  spdxSha256: hash(bytes),
  packages: document.packages.length,
  packageTypes,
  files: document.files?.length ?? 0,
  relationships: document.relationships?.length ?? 0,
  schemaValidated: true,
};
await writeFile(published, bytes);
await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
await rm(archive);
console.log(JSON.stringify(receipt));
