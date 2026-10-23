import { execFile } from 'node:child_process';
import { open, type FileHandle } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { withProcessQuery } from './process-query-gate.js';

export type ProcessSampleCode =
  | 'PROCESS_SAMPLE_INVALID'
  | 'PROCESS_SAMPLE_UNAVAILABLE'
  | 'PROCESS_SAMPLE_CANCELLED'
  | 'PROCESS_SAMPLE_CLOSE_FAILED';

export class ProcessSampleError extends Error {
  constructor(readonly code: ProcessSampleCode) {
    super(code);
  }
}

function requireSample(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ProcessSampleError('PROCESS_SAMPLE_CANCELLED');
}

export function linuxResidentReceipt(text: string): number {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 16384)
    throw new ProcessSampleError('PROCESS_SAMPLE_INVALID');
  const pattern = /^VmRSS:[\t ]+([0-9]{1,13})[\t ]+kB[\t ]*$/gm;
  const match = pattern.exec(text);
  if (!match || pattern.exec(text))
    throw new ProcessSampleError('PROCESS_SAMPLE_INVALID');
  const bytes = Number(match[1]) * 1024;
  if (!Number.isSafeInteger(bytes) || bytes < 1)
    throw new ProcessSampleError('PROCESS_SAMPLE_INVALID');
  return bytes;
}

/** Scalar working-set receipt, not private allocation or process CPU time. */
export function processResidentReceipt(text: string): number {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 128)
    throw new ProcessSampleError('PROCESS_SAMPLE_INVALID');
  let result: unknown;
  try {
    result = JSON.parse(text);
  } catch {
    throw new ProcessSampleError('PROCESS_SAMPLE_INVALID');
  }
  if (!result || typeof result !== 'object' || Array.isArray(result))
    throw new ProcessSampleError('PROCESS_SAMPLE_INVALID');
  const record = result as Record<string, unknown>;
  if (
    Object.keys(record).sort().join(',') !== 'bytes,error,v' ||
    record.v !== 1 ||
    record.error !== 0 ||
    !Number.isSafeInteger(record.bytes) ||
    (record.bytes as number) < 1
  )
    throw new ProcessSampleError('PROCESS_SAMPLE_INVALID');
  return record.bytes as number;
}

/** Sampling only; the trusted caller retains process identity/liveness ownership. */
export async function linuxWorkerResidentBytes(
  pid: number,
  signal?: AbortSignal,
): Promise<number> {
  if (!Number.isInteger(pid) || pid < 1 || pid > 0x7fffffff)
    throw new ProcessSampleError('PROCESS_SAMPLE_INVALID');
  requireSample(signal);
  if (process.platform !== 'linux')
    throw new ProcessSampleError('PROCESS_SAMPLE_UNAVAILABLE');
  const scratch = Buffer.alloc(16385);
  let file: FileHandle | undefined;
  let bytes: number;
  try {
    file = await open('/proc/' + pid + '/status', 'r');
    requireSample(signal);
    let length = 0;
    for (;;) {
      const { bytesRead } = await file.read(
        scratch,
        length,
        scratch.length - length,
        null,
      );
      requireSample(signal);
      length += bytesRead;
      if (length > 16384) throw new Error();
      if (!bytesRead) break;
    }
    bytes = linuxResidentReceipt(scratch.subarray(0, length).toString('ascii'));
  } catch {
    requireSample(signal);
    throw new ProcessSampleError('PROCESS_SAMPLE_UNAVAILABLE');
  } finally {
    scratch.fill(0);
    try {
      await file?.close();
    } catch {
      throw new ProcessSampleError('PROCESS_SAMPLE_CLOSE_FAILED');
    }
  }
  requireSample(signal);
  return bytes;
}

export async function windowsWorkerResidentBytes(
  pid: number,
  workerPath: string,
  signal?: AbortSignal,
): Promise<number> {
  if (!Number.isInteger(pid) || pid < 1 || pid > 0xffffffff)
    throw new ProcessSampleError('PROCESS_SAMPLE_INVALID');
  requireSample(signal);
  const root = process.env.SystemRoot;
  if (process.platform !== 'win32' || !root)
    throw new ProcessSampleError('PROCESS_SAMPLE_UNAVAILABLE');
  try {
    if (
      typeof workerPath !== 'string' ||
      !workerPath ||
      workerPath.length > 32767
    )
      throw new Error();
    return await withProcessQuery(signal, async () => {
      requireSample(signal);
      const execution = promisify(execFile)(
        join(dirname(workerPath), 'rdp-runtime-directory.exe'),
        ['--process-resident-bytes', String(pid)],
        {
          windowsHide: true,
          timeout: 2000,
          maxBuffer: 128,
          encoding: 'utf8',
          env: { SystemRoot: root, WINDIR: root, PATH: '' },
          signal,
        },
      );
      // Abort may reject execFile before the helper's close notification.
      // Join the owned process and its streams before publishing completion.
      const closed = new Promise<void>((done) => {
        execution.child.once('close', () => done());
      });
      let result: Awaited<typeof execution>;
      try {
        result = await execution;
      } finally {
        await closed;
      }
      requireSample(signal);
      if (result.stderr !== '') throw new Error();
      return processResidentReceipt(result.stdout);
    });
  } catch {
    requireSample(signal);
    throw new ProcessSampleError('PROCESS_SAMPLE_UNAVAILABLE');
  }
}

/** Host diagnostic only; this creates no watchdog or resource enforcement. */
export function workerResidentBytes(
  pid: number,
  workerPath: string,
  signal?: AbortSignal,
): Promise<number> {
  if (process.platform === 'linux')
    return linuxWorkerResidentBytes(pid, signal);
  if (process.platform === 'win32')
    return windowsWorkerResidentBytes(pid, workerPath, signal);
  return Promise.reject(new ProcessSampleError('PROCESS_SAMPLE_UNAVAILABLE'));
}
