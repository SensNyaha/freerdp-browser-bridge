import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export class RuntimeRecoveryError extends Error {
  constructor(
    readonly code:
      | 'RUNTIME_RECOVERY_INVALID'
      | 'RUNTIME_RECOVERY_MISMATCH'
      | 'RUNTIME_RECOVERY_UNAVAILABLE'
      | 'RUNTIME_RECOVERY_CANCELLED'
      | 'RUNTIME_RECOVERY_TIMEOUT'
      | 'RUNTIME_RECOVERY_CLOSE_FAILED',
  ) {
    super(code);
  }
}
interface CohortManifest {
  v: 1;
  directorySchema: 1;
  worker: string;
  helper: string;
  workerSha256: string;
  helperSha256: string;
}
export interface RuntimeCohort {
  workerPath: string;
  helperPath: string;
  workerSha256: string;
  helperSha256: string;
}
export interface RecoveryBudget {
  readonly due: number;
  readonly signal?: AbortSignal;
}
export function checkRecoveryBudget(budget: RecoveryBudget): void {
  if (budget.signal?.aborted)
    throw new RuntimeRecoveryError('RUNTIME_RECOVERY_CANCELLED');
  if (performance.now() >= budget.due)
    throw new RuntimeRecoveryError('RUNTIME_RECOVERY_TIMEOUT');
}
export function parseRuntimeCohort(
  value: unknown,
  platform = process.platform,
): CohortManifest {
  if (
    !['win32', 'linux'].includes(platform) ||
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  )
    throw new RuntimeRecoveryError('RUNTIME_RECOVERY_INVALID');
  const record = value as Record<string, unknown>;
  const suffix = platform === 'win32' ? '.exe' : '';
  if (
    Object.keys(record).sort().join(',') !==
      'directorySchema,helper,helperSha256,v,worker,workerSha256' ||
    record.v !== 1 ||
    record.directorySchema !== 1 ||
    record.worker !== 'rdp-worker' + suffix ||
    record.helper !== 'rdp-runtime-recovery' + suffix ||
    typeof record.workerSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(record.workerSha256) ||
    typeof record.helperSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(record.helperSha256)
  )
    throw new RuntimeRecoveryError('RUNTIME_RECOVERY_INVALID');
  return { ...record } as unknown as CohortManifest;
}
async function regular(file: string, maximum: number) {
  const before = await lstat(file);
  if (!before.isFile() || before.size < 1 || before.size > maximum)
    throw new RuntimeRecoveryError('RUNTIME_RECOVERY_INVALID');
  const handle = await open(
    file,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const info = await handle.stat();
    if (
      !info.isFile() ||
      info.size !== before.size ||
      info.dev !== before.dev ||
      info.ino !== before.ino
    )
      throw new RuntimeRecoveryError('RUNTIME_RECOVERY_INVALID');
    return { handle, info };
  } catch (error) {
    await handle.close();
    throw error;
  }
}
async function hash(file: string, budget: RecoveryBudget): Promise<string> {
  checkRecoveryBudget(budget);
  const { handle, info } = await regular(file, 64 * 1024 * 1024);
  try {
    const digest = createHash('sha256');
    const buffer = Buffer.alloc(65536);
    let offset = 0;
    while (offset < info.size) {
      checkRecoveryBudget(budget);
      const { bytesRead } = await handle.read(
        buffer,
        0,
        Math.min(buffer.length, info.size - offset),
        offset,
      );
      if (!bytesRead)
        throw new RuntimeRecoveryError('RUNTIME_RECOVERY_INVALID');
      digest.update(buffer.subarray(0, bytesRead));
      offset += bytesRead;
    }
    const after = await handle.stat();
    checkRecoveryBudget(budget);
    if (
      after.size !== info.size ||
      after.mtimeMs !== info.mtimeMs ||
      after.ctimeMs !== info.ctimeMs
    )
      throw new RuntimeRecoveryError('RUNTIME_RECOVERY_INVALID');
    return digest.digest('hex');
  } finally {
    await handle.close();
  }
}
/** Integrity/compatibility inside a trusted installation, not a publisher signature. */
export async function selectRuntimeCohort(
  workerPath: string,
  budget: RecoveryBudget = { due: performance.now() + 5000 },
): Promise<RuntimeCohort | undefined> {
  try {
    checkRecoveryBudget(budget);
    if (
      !['win32', 'linux'].includes(process.platform) ||
      typeof workerPath !== 'string' ||
      workerPath.includes('\0') ||
      workerPath.length > 32767
    )
      throw new RuntimeRecoveryError('RUNTIME_RECOVERY_INVALID');
    let worker: string;
    try {
      worker = await realpath(workerPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
    // Only the actual worker basename can opt in. Adjacent metadata belonging
    // to the real worker must not change synthetic/legacy fixture semantics.
    const expectedWorker =
      'rdp-worker' + (process.platform === 'win32' ? '.exe' : '');
    if (basename(worker) !== expectedWorker) return undefined;
    let input;
    try {
      input = await regular(
        join(dirname(worker), 'rdp-worker.runtime.json'),
        8192,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
    let manifest: CohortManifest;
    try {
      const bytes = Buffer.alloc(8193);
      const { bytesRead } = await input.handle.read(bytes, 0, bytes.length, 0);
      const after = await input.handle.stat();
      if (
        bytesRead !== input.info.size ||
        after.size !== input.info.size ||
        after.mtimeMs !== input.info.mtimeMs ||
        after.ctimeMs !== input.info.ctimeMs
      )
        throw new RuntimeRecoveryError('RUNTIME_RECOVERY_INVALID');
      manifest = parseRuntimeCohort(
        JSON.parse(bytes.subarray(0, bytesRead).toString('utf8')),
      );
    } finally {
      await input.handle.close();
    }
    const helperPath = join(dirname(worker), manifest.helper);
    if (
      (await hash(worker, budget)) !== manifest.workerSha256 ||
      (await hash(helperPath, budget)) !== manifest.helperSha256
    )
      throw new RuntimeRecoveryError('RUNTIME_RECOVERY_MISMATCH');
    checkRecoveryBudget(budget);
    return Object.freeze({
      workerPath: worker,
      helperPath,
      workerSha256: manifest.workerSha256,
      helperSha256: manifest.helperSha256,
    });
  } catch (error) {
    throw error instanceof RuntimeRecoveryError
      ? error
      : new RuntimeRecoveryError('RUNTIME_RECOVERY_INVALID');
  }
}
