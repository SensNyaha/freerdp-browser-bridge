import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { ProcessSampleError } from './process-resident.js';
import { withProcessQuery } from './process-query-gate.js';

export type ProcessResources = {
  bytes: number;
  micros: number;
  startedNs: bigint;
  completedNs: bigint;
};

export function processResourcesReceipt(text: string): {
  bytes: number;
  micros: number;
} {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 128)
    throw new ProcessSampleError('PROCESS_SAMPLE_INVALID');
  try {
    const seen = new Set<string>();
    for (const match of text.matchAll(/"((?:[^"\\]|\\.)*)"\s*:/g)) {
      const key = match[1]!;
      if (!['v', 'bytes', 'micros', 'error'].includes(key) || seen.has(key))
        throw new Error();
      seen.add(key);
    }
    if (seen.size !== 4) throw new Error();
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error();
    const record = value as Record<string, unknown>;
    if (
      Object.keys(record).sort().join(',') !== 'bytes,error,micros,v' ||
      record.v !== 1 ||
      record.error !== 0 ||
      !Number.isSafeInteger(record.bytes) ||
      (record.bytes as number) < 1 ||
      !Number.isSafeInteger(record.micros) ||
      (record.micros as number) < 0 ||
      Object.is(record.micros, -0)
    )
      throw new Error();
    return { bytes: record.bytes as number, micros: record.micros as number };
  } catch {
    throw new ProcessSampleError('PROCESS_SAMPLE_INVALID');
  }
}

export async function windowsProcessResources(
  pid: number,
  workerPath: string,
  signal?: AbortSignal,
): Promise<ProcessResources> {
  if (!Number.isInteger(pid) || pid < 1 || pid > 0xffffffff)
    throw new ProcessSampleError('PROCESS_SAMPLE_INVALID');
  const cancelled = () => {
    if (signal?.aborted)
      throw new ProcessSampleError('PROCESS_SAMPLE_CANCELLED');
  };
  cancelled();
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
    const startedNs = process.hrtime.bigint();
    return await withProcessQuery(signal, async () => {
      cancelled();
      const execution = promisify(execFile)(
        join(dirname(workerPath), 'rdp-runtime-directory.exe'),
        ['--process-resources', String(pid)],
        {
          windowsHide: true,
          timeout: 2000,
          maxBuffer: 128,
          encoding: 'utf8',
          env: { SystemRoot: root, WINDIR: root, PATH: '' },
          signal,
        },
      );
      const closed = new Promise<void>((done) =>
        execution.child.once('close', () => done()),
      );
      let result: Awaited<typeof execution>;
      try {
        result = await execution;
      } finally {
        await closed;
      }
      cancelled();
      if (result.stderr !== '') throw new Error();
      return {
        ...processResourcesReceipt(result.stdout),
        startedNs,
        completedNs: process.hrtime.bigint(),
      };
    });
  } catch {
    cancelled();
    throw new ProcessSampleError('PROCESS_SAMPLE_UNAVAILABLE');
  }
}
