import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { ProcessSampleError } from './process-resident.js';

function requireSample(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ProcessSampleError('PROCESS_SAMPLE_CANCELLED');
}

/** Cumulative kernel+user microseconds, not a utilization percentage. */
export function processCpuReceipt(text: string): number {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 128)
    throw new ProcessSampleError('PROCESS_SAMPLE_INVALID');
  try {
    const seen = new Set<string>();
    for (const match of text.matchAll(/"((?:[^"\\]|\\.)*)"\s*:/g)) {
      const key = match[1]!;
      if (!['v', 'micros', 'error'].includes(key) || seen.has(key))
        throw new Error();
      seen.add(key);
    }
    if (seen.size !== 3) throw new Error();
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error();
    const record = value as Record<string, unknown>;
    if (
      Object.keys(record).sort().join(',') !== 'error,micros,v' ||
      record.v !== 1 ||
      record.error !== 0 ||
      !Number.isSafeInteger(record.micros) ||
      (record.micros as number) < 0 ||
      Object.is(record.micros, -0)
    )
      throw new Error();
    return record.micros as number;
  } catch {
    throw new ProcessSampleError('PROCESS_SAMPLE_INVALID');
  }
}

/** Trusted host query only. The caller retains process identity/liveness ownership. */
export async function windowsWorkerCpuMicros(
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
  return queryCpuMicros(
    pid,
    workerPath,
    'rdp-runtime-directory.exe',
    { SystemRoot: root, WINDIR: root, PATH: '' },
    signal,
  );
}

export async function linuxWorkerCpuMicros(
  pid: number,
  workerPath: string,
  signal?: AbortSignal,
): Promise<number> {
  if (!Number.isInteger(pid) || pid < 1 || pid > 0x7fffffff)
    throw new ProcessSampleError('PROCESS_SAMPLE_INVALID');
  requireSample(signal);
  if (process.platform !== 'linux')
    throw new ProcessSampleError('PROCESS_SAMPLE_UNAVAILABLE');
  return queryCpuMicros(
    pid,
    workerPath,
    'rdp-process-query',
    { PATH: '' },
    signal,
  );
}

export function workerCpuMicros(
  pid: number,
  workerPath: string,
  signal?: AbortSignal,
): Promise<number> {
  if (process.platform === 'win32')
    return windowsWorkerCpuMicros(pid, workerPath, signal);
  if (process.platform === 'linux')
    return linuxWorkerCpuMicros(pid, workerPath, signal);
  return Promise.reject(new ProcessSampleError('PROCESS_SAMPLE_UNAVAILABLE'));
}

async function queryCpuMicros(
  pid: number,
  workerPath: string,
  helper: string,
  env: Record<string, string>,
  signal?: AbortSignal,
): Promise<number> {
  try {
    if (
      typeof workerPath !== 'string' ||
      !workerPath ||
      workerPath.length > 32767
    )
      throw new Error();
    const execution = promisify(execFile)(
      join(dirname(workerPath), helper),
      ['--process-cpu-micros', String(pid)],
      {
        windowsHide: true,
        timeout: 2000,
        maxBuffer: 128,
        encoding: 'utf8',
        env,
        signal,
      },
    );
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
    return processCpuReceipt(result.stdout);
  } catch {
    requireSample(signal);
    throw new ProcessSampleError('PROCESS_SAMPLE_UNAVAILABLE');
  }
}
