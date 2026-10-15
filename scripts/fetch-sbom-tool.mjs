import { readFile, mkdir, realpath, stat, rename, rm } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';
import { resolve, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
const lock = JSON.parse(
  await readFile(new URL('./sbom-tools.json', import.meta.url)),
);
const bound = 64 * 1024 * 1024;
async function checksum(path) {
  if (!(await stat(path)).isFile() || (await stat(path)).size > bound)
    throw new Error('SBOM_TOOL_SIZE');
  const hash = createHash('sha256');
  let length = 0;
  for await (const chunk of createReadStream(path, { highWaterMark: 65536 })) {
    if ((length += chunk.length) > bound) throw new Error('SBOM_TOOL_SIZE');
    hash.update(chunk);
  }
  return hash.digest('hex');
}
export async function ensureSbomTool() {
  const platform = process.platform + '-' + process.arch;
  const artifact = lock.syft.platforms[platform];
  if (
    !artifact ||
    resolve('.') !== project ||
    process.versions.node.split('.')[0] !== '24'
  )
    throw new Error('SBOM_TOOL_PLATFORM');
  const directory = resolve(
    '.tools',
    'syft-' + lock.syft.version + '-' + platform,
  );
  await mkdir(directory, { recursive: true });
  if (
    (await realpath(directory)) !== directory ||
    !directory.startsWith(project + sep)
  )
    throw new Error('SBOM_TOOL_DIRECTORY');
  const archive = join(directory, artifact.file);
  let cached = false;
  try {
    cached = (await checksum(archive)) === artifact.sha256;
  } catch {
    /* Fetch a missing/incomplete cache entry. */
  }
  if (!cached) {
    const temporary = archive + '.partial';
    await rm(temporary, { force: true });
    try {
      const response = await fetch(
        `https://github.com/anchore/syft/releases/download/v${lock.syft.version}/${artifact.file}`,
        { signal: AbortSignal.timeout(120000) },
      );
      if (
        !response.ok ||
        Number(response.headers.get('content-length') ?? '0') > bound
      )
        throw new Error('SBOM_TOOL_DOWNLOAD');
      let length = 0;
      const limiter = new Transform({
        transform(chunk, _encoding, done) {
          if ((length += chunk.length) > bound)
            done(new Error('SBOM_TOOL_SIZE'));
          else done(null, chunk);
        },
      });
      await pipeline(
        Readable.fromWeb(response.body),
        limiter,
        createWriteStream(temporary, { flags: 'wx' }),
      );
      if ((await checksum(temporary)) !== artifact.sha256)
        throw new Error('SBOM_TOOL_CHECKSUM');
      await rename(temporary, archive);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  // Re-extract the verified archive rather than trusting a previously altered executable.
  const extracted = spawnSync('tar', ['-xf', archive, '-C', directory], {
    stdio: 'ignore',
    windowsHide: true,
    timeout: 30000,
  });
  if (extracted.status !== 0) throw new Error('SBOM_TOOL_EXTRACT');
  const executable = join(
    directory,
    process.platform === 'win32' ? 'syft.exe' : 'syft',
  );
  const checked = spawnSync(executable, ['version', '-o', 'json'], {
    encoding: 'utf8',
    maxBuffer: 16384,
    timeout: 5000,
    windowsHide: true,
  });
  if (
    checked.status !== 0 ||
    JSON.parse(checked.stdout).version !== lock.syft.version
  )
    throw new Error('SBOM_TOOL_VERSION');
  return {
    executable,
    version: lock.syft.version,
    archiveSha256: artifact.sha256,
  };
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const tool = await ensureSbomTool();
  console.log(
    JSON.stringify({
      tool: 'syft',
      version: tool.version,
      archiveSha256: tool.archiveSha256,
    }),
  );
}
