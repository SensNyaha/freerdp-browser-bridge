import { spawn, type ChildProcess } from 'node:child_process';
import { lstat, opendir } from 'node:fs/promises';
import { isAbsolute, resolve, toNamespacedPath } from 'node:path';
import { ProcessQueryGate } from './process-query-gate.js';
import { probeRuntimeOwner } from './runtime-owner.js';
import {
  checkRecoveryBudget,
  RuntimeRecoveryError,
  selectRuntimeCohort,
  type RecoveryBudget,
  type RuntimeCohort,
} from './runtime-cohort.js';

export interface RuntimeRecoveryOptions {
  workerPath: string;
  runtimeRoot: string;
  /** Total operation budget, including admission/hashing; 1..60,000, default 10,000 ms. */
  timeoutMs?: number;
  /** Entries examined, including unknown names; 1..1,024, default 128. */
  maxEntries?: number;
  signal?: AbortSignal;
}
export interface RuntimeRecoveryReport {
  supported: boolean;
  complete: boolean;
  scanned: number;
  removed: number;
  active: number;
  retained: number;
}
type HelperStatus = 'removed' | 'busy' | 'retained';
const gate = new ProcessQueryGate(4, 64, 2000);
// Logical timeout must not authorize more OS children while a previous helper's
// termination/stdio closure remains unconfirmed. Retain these slots until close.
const helperChildren = new Set<ChildProcess>();

/** Internal retirement of one already-owned session, after its worker and
 * endpoint have joined. Revalidate the startup cohort; never scan sibling
 * sessions or substitute a different helper after an installation changes.
 */
export async function recoverOwnedRuntimeDirectory(
  expected: RuntimeCohort,
  root: string,
  component: string,
  timeoutMs: number,
): Promise<HelperStatus> {
  if (
    !/^worker-[a-f0-9]{32}-1-[a-f0-9]{32}$/.test(component) ||
    !isAbsolute(root) ||
    root.includes('\0') ||
    root.length > 32767 ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 60000
  )
    throw new RuntimeRecoveryError('RUNTIME_RECOVERY_INVALID');
  const budget = { due: performance.now() + timeoutMs };
  return gate.run(undefined, async () => {
    checkRecoveryBudget(budget);
    const current = await selectRuntimeCohort(expected.workerPath, budget);
    if (
      !current ||
      current.workerPath !== expected.workerPath ||
      current.helperPath !== expected.helperPath ||
      current.workerSha256 !== expected.workerSha256 ||
      current.helperSha256 !== expected.helperSha256
    )
      throw new RuntimeRecoveryError('RUNTIME_RECOVERY_MISMATCH');
    return runRuntimeRecoveryHelper(
      current.helperPath,
      root,
      component,
      budget,
    );
  });
}

export function parseRuntimeRecoveryReceipt(bytes: Buffer): HelperStatus {
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > 128)
    throw new RuntimeRecoveryError('RUNTIME_RECOVERY_UNAVAILABLE');
  try {
    const record = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    ) as Record<string, unknown>;
    if (
      !record ||
      typeof record !== 'object' ||
      Array.isArray(record) ||
      Object.keys(record).sort().join(',') !== 'status,v' ||
      record.v !== 1 ||
      !['removed', 'busy', 'retained'].includes(record.status as string)
    )
      throw new Error();
    return record.status as HelperStatus;
  } catch {
    throw new RuntimeRecoveryError('RUNTIME_RECOVERY_UNAVAILABLE');
  }
}
/** Internal child owner; all failures are fixed codes and settlement joins close. */
export async function runRuntimeRecoveryHelper(
  helper: string,
  root: string,
  component: string,
  budget: RecoveryBudget,
): Promise<HelperStatus> {
  checkRecoveryBudget(budget);
  if (helperChildren.size >= 4)
    throw new RuntimeRecoveryError('RUNTIME_RECOVERY_UNAVAILABLE');
  const due = Math.min(budget.due, performance.now() + 3000);
  return new Promise((done, reject) => {
    const output = Buffer.alloc(129);
    let used = 0;
    let refusal: RuntimeRecoveryError | undefined;
    let settled = false;
    let closeDeadline: NodeJS.Timeout | undefined;
    const env = Object.fromEntries(
      ['SystemRoot', 'WINDIR', 'PATH', 'LD_LIBRARY_PATH'].flatMap((key) =>
        process.env[key] === undefined ? [] : [[key, process.env[key]!]],
      ),
    );
    // realpath may remove the extended-length prefix from a verified cohort.
    const executable =
      process.platform === 'win32' ? toNamespacedPath(helper) : helper;
    const child = spawn(executable, [root, component], {
      windowsHide: true,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    helperChildren.add(child);
    const refuse = (code: RuntimeRecoveryError['code']) => {
      if (settled) return;
      refusal ??= new RuntimeRecoveryError(code);
      child.kill('SIGKILL');
      closeDeadline ??= setTimeout(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        budget.signal?.removeEventListener('abort', abort);
        reject(new RuntimeRecoveryError('RUNTIME_RECOVERY_CLOSE_FAILED'));
      }, 2000);
    };
    const abort = () => refuse('RUNTIME_RECOVERY_CANCELLED');
    const timer = setTimeout(
      () => refuse('RUNTIME_RECOVERY_TIMEOUT'),
      Math.max(1, due - performance.now()),
    );
    budget.signal?.addEventListener('abort', abort, { once: true });
    child.once('error', () => refuse('RUNTIME_RECOVERY_UNAVAILABLE'));
    child.stdout.on('data', (bytes: Buffer) => {
      if (used + bytes.length > 128) {
        refuse('RUNTIME_RECOVERY_UNAVAILABLE');
        return;
      }
      bytes.copy(output, used);
      used += bytes.length;
    });
    child.stdout.on('error', () => refuse('RUNTIME_RECOVERY_UNAVAILABLE'));
    child.stderr.on('data', () => refuse('RUNTIME_RECOVERY_UNAVAILABLE'));
    child.stderr.on('error', () => refuse('RUNTIME_RECOVERY_UNAVAILABLE'));
    child.once('close', (code, signal) => {
      helperChildren.delete(child);
      clearTimeout(timer);
      if (closeDeadline) clearTimeout(closeDeadline);
      budget.signal?.removeEventListener('abort', abort);
      if (settled) return;
      settled = true;
      try {
        checkRecoveryBudget(budget);
        if (performance.now() >= due && !refusal)
          throw new RuntimeRecoveryError('RUNTIME_RECOVERY_TIMEOUT');
        if (refusal) throw refusal;
        if (code !== 0 || signal)
          throw new RuntimeRecoveryError('RUNTIME_RECOVERY_UNAVAILABLE');
        done(parseRuntimeRecoveryReceipt(output.subarray(0, used)));
      } catch (error) {
        reject(error);
      }
    });
    if (budget.signal?.aborted) abort();
  });
}
/** Trusted host startup operation; never connects RDP or kills session processes. */
export async function recoverRuntimeSessions(
  options: RuntimeRecoveryOptions,
): Promise<RuntimeRecoveryReport> {
  const timeout = options?.timeoutMs ?? 10000;
  const maximum = options?.maxEntries ?? 128;
  if (
    !options ||
    typeof options.workerPath !== 'string' ||
    !isAbsolute(options.workerPath) ||
    typeof options.runtimeRoot !== 'string' ||
    !isAbsolute(options.runtimeRoot) ||
    options.runtimeRoot.includes('\0') ||
    options.workerPath.includes('\0') ||
    options.runtimeRoot.length > 32767 ||
    options.workerPath.length > 32767 ||
    !Number.isInteger(timeout) ||
    timeout < 1 ||
    timeout > 60000 ||
    !Number.isInteger(maximum) ||
    maximum < 1 ||
    maximum > 1024 ||
    (options.signal !== undefined && !(options.signal instanceof AbortSignal))
  )
    throw new RuntimeRecoveryError('RUNTIME_RECOVERY_INVALID');
  const budget: RecoveryBudget = {
    due: performance.now() + timeout,
    ...(options.signal ? { signal: options.signal } : {}),
  };
  checkRecoveryBudget(budget);
  try {
    return await gate.run(options.signal, async () => {
      checkRecoveryBudget(budget);
      const report: RuntimeRecoveryReport = {
        supported: false,
        complete: false,
        scanned: 0,
        removed: 0,
        active: 0,
        retained: 0,
      };
      const cohort = await selectRuntimeCohort(options.workerPath, budget);
      checkRecoveryBudget(budget);
      if (!cohort) return report;
      report.supported = true;
      const root = resolve(options.runtimeRoot);
      let info;
      try {
        info = await lstat(root);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          checkRecoveryBudget(budget);
          report.complete = true;
          return report;
        }
        throw error;
      }
      if (
        !info.isDirectory() ||
        (process.platform === 'linux' &&
          (info.uid !== process.getuid?.() || info.mode & 0o022))
      )
        throw new RuntimeRecoveryError('RUNTIME_RECOVERY_INVALID');
      checkRecoveryBudget(budget);
      const directory = await opendir(root, { bufferSize: 16 });
      try {
        for (;;) {
          checkRecoveryBudget(budget);
          const entry = await directory.read();
          checkRecoveryBudget(budget);
          if (!entry) {
            report.complete = true;
            break;
          }
          if (report.scanned === maximum) break;
          ++report.scanned;
          const match = /^worker-([a-f0-9]{32})-1-[a-f0-9]{32}$/.exec(
            entry.name,
          );
          if (!match || !entry.isDirectory()) {
            ++report.retained;
            continue;
          }
          const owner = await probeRuntimeOwner(match[1]!, {
            timeoutMs: Math.max(
              1,
              Math.min(500, Math.floor(budget.due - performance.now())),
            ),
            ...(options.signal ? { signal: options.signal } : {}),
          });
          checkRecoveryBudget(budget);
          if (owner === 'live') {
            ++report.active;
            continue;
          }
          if (owner === 'unknown') {
            ++report.retained;
            continue;
          }
          const result = await runRuntimeRecoveryHelper(
            cohort.helperPath,
            root,
            entry.name,
            budget,
          );
          if (result === 'removed') ++report.removed;
          else if (result === 'busy') ++report.active;
          else ++report.retained;
        }
      } finally {
        await directory.close();
      }
      checkRecoveryBudget(budget);
      return Object.freeze(report);
    });
  } catch (error) {
    if (
      error instanceof RuntimeRecoveryError &&
      error.code === 'RUNTIME_RECOVERY_CLOSE_FAILED'
    )
      throw error;
    checkRecoveryBudget(budget);
    throw error instanceof RuntimeRecoveryError
      ? error
      : new RuntimeRecoveryError('RUNTIME_RECOVERY_UNAVAILABLE');
  }
}
