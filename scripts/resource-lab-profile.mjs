import { createReadStream } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative, sep } from 'node:path';

const invalid = () => new Error('LAB_NATIVE_PROFILE_INVALID');

export function resourceLabRequest(args) {
  const cpuBreach = Array.isArray(args) && args[0] === '--cpu-breach';
  const memoryBreach = Array.isArray(args) && args[0] === '--memory-breach';
  const nativeArgs = cpuBreach || memoryBreach ? args.slice(1) : args;
  resourceLabArguments(nativeArgs);
  return {
    nativeArgs: [...nativeArgs],
    cpuBreach,
    memoryBreach,
    limits: {
      maxResidentBytes: memoryBreach ? 1 : 256 * 1024 * 1024,
      maxCpuPercent: cpuBreach ? 1 : 100,
      residentPollIntervalMs: cpuBreach || memoryBreach ? 5000 : 500,
      cpuPollIntervalMs: cpuBreach || memoryBreach ? 5000 : 500,
      cpuWindowMs: 1000,
    },
  };
}

export function resourceLabArguments(args) {
  if (
    !Array.isArray(args) ||
    args.length !== 2 ||
    typeof args[0] !== 'string' ||
    typeof args[1] !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/.test(args[0]) ||
    !/^build[\\/]native-clean-[A-Za-z0-9_-]+[\\/]receipt\.json$/.test(args[1])
  )
    throw new Error(
      'Use verified sha256 fingerprint and isolated native receipt',
    );
  return { fingerprint: args[0], receipt: args[1] };
}

async function artifactHash(path) {
  const stat = await lstat(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size < 1 ||
    stat.size > 67108864
  )
    throw invalid();
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    bytes += chunk.length;
    if (bytes > 67108864) throw invalid();
    hash.update(chunk);
  }
  return hash.digest('hex');
}

export async function loadResourceLabProfile(
  args,
  projectRoot,
  platform = process.platform,
) {
  const options = resourceLabArguments(args);
  if (platform !== 'win32') throw new Error('LAB_NATIVE_PROFILE_UNSUPPORTED');
  try {
    const path = resolve(projectRoot, options.receipt);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536)
      throw invalid();
    const receipt = JSON.parse(
      (await readFile(path, 'utf8')).replace(/^\uFEFF/, ''),
    );
    const root = dirname(path);
    if (
      receipt.cleanNativeSource !== true ||
      receipt.prebuiltOutput !== false ||
      receipt.linked !== true ||
      receipt.sourceUnchanged !== true ||
      receipt.platform !== 'win32' ||
      !['Release', 'Debug'].includes(receipt.buildProfile?.buildType) ||
      receipt.fixture?.replaceAll('\\', '/') !==
        relative(projectRoot, root).split(sep).join('/') ||
      receipt.sdkSourceCommit !== 'bf217a504e54cc719880c228e82353382cd7d4fa' ||
      !/^[0-9a-f]{64}$/.test(receipt.sourceHash)
    )
      throw invalid();
    for (const name of ['rdp-worker.exe', 'rdp-runtime-directory.exe']) {
      if (
        !/^[0-9a-f]{64}$/.test(receipt.artifacts?.[name]) ||
        (await artifactHash(resolve(root, 'out', name))) !==
          receipt.artifacts[name]
      )
        throw invalid();
    }
    return {
      fingerprint: options.fingerprint,
      workerPath: resolve(root, 'out/rdp-worker.exe'),
      buildType: receipt.buildProfile.buildType,
      sourceHash: receipt.sourceHash,
      workerHash: receipt.artifacts['rdp-worker.exe'],
      helperHash: receipt.artifacts['rdp-runtime-directory.exe'],
    };
  } catch {
    throw invalid();
  }
}
