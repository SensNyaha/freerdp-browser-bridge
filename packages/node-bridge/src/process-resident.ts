import { execFile } from 'node:child_process';
import { open, type FileHandle } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

export type ProcessSampleCode =
  | 'PROCESS_SAMPLE_INVALID'
  | 'PROCESS_SAMPLE_UNAVAILABLE';

export class ProcessSampleError extends Error {
  constructor(readonly code: ProcessSampleCode) {
    super(code);
  }
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
export async function linuxWorkerResidentBytes(pid: number): Promise<number> {
  if (!Number.isInteger(pid) || pid < 1 || pid > 0x7fffffff)
    throw new ProcessSampleError('PROCESS_SAMPLE_INVALID');
  if (process.platform !== 'linux')
    throw new ProcessSampleError('PROCESS_SAMPLE_UNAVAILABLE');
  const scratch = Buffer.alloc(16385);
  let file: FileHandle | undefined;
  try {
    file = await open('/proc/' + pid + '/status', 'r');
    let length = 0;
    for (;;) {
      const { bytesRead } = await file.read(
        scratch,
        length,
        scratch.length - length,
        null,
      );
      length += bytesRead;
      if (length > 16384) throw new Error();
      if (!bytesRead) break;
    }
    return linuxResidentReceipt(scratch.subarray(0, length).toString('ascii'));
  } catch {
    throw new ProcessSampleError('PROCESS_SAMPLE_UNAVAILABLE');
  } finally {
    scratch.fill(0);
    try {
      await file?.close();
    } catch {
      throw new ProcessSampleError('PROCESS_SAMPLE_UNAVAILABLE');
    }
  }
}

export async function windowsWorkerResidentBytes(
  pid: number,
  workerPath: string,
): Promise<number> {
  if (!Number.isInteger(pid) || pid < 1 || pid > 0xffffffff)
    throw new ProcessSampleError('PROCESS_SAMPLE_INVALID');
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
    const result = await promisify(execFile)(
      join(dirname(workerPath), 'rdp-runtime-directory.exe'),
      ['--process-resident-bytes', String(pid)],
      {
        windowsHide: true,
        timeout: 2000,
        maxBuffer: 128,
        encoding: 'utf8',
        env: { SystemRoot: root, WINDIR: root, PATH: '' },
      },
    );
    if (result.stderr !== '') throw new Error();
    return processResidentReceipt(result.stdout);
  } catch {
    throw new ProcessSampleError('PROCESS_SAMPLE_UNAVAILABLE');
  }
}

/** Host diagnostic only; this creates no watchdog or resource enforcement. */
export function workerResidentBytes(
  pid: number,
  workerPath: string,
): Promise<number> {
  if (process.platform === 'linux') return linuxWorkerResidentBytes(pid);
  if (process.platform === 'win32')
    return windowsWorkerResidentBytes(pid, workerPath);
  return Promise.reject(new ProcessSampleError('PROCESS_SAMPLE_UNAVAILABLE'));
}
