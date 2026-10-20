import { ProcessSampleError } from './process-resident.js';

export const processResourceBatchLimit = 16;
export const processResourceBatchBytes = 2048;
export type ProcessResourceBatchItem = {
  bytes: number;
  micros: number;
  error: number;
};

/** Canonical private helper schema 1, with exact per-request positional results. */
export function processResourceBatchReceipt(
  text: string,
  expected: number,
): ProcessResourceBatchItem[] {
  if (
    typeof text !== 'string' ||
    Buffer.byteLength(text) > processResourceBatchBytes ||
    !Number.isInteger(expected) ||
    expected < 1 ||
    expected > processResourceBatchLimit
  )
    throw new ProcessSampleError('PROCESS_SAMPLE_INVALID');
  try {
    const line = text.endsWith('\r\n')
      ? text.slice(0, -2)
      : text.endsWith('\n')
        ? text.slice(0, -1)
        : text;
    const prefix = '{"v":1,"items":[';
    if (!line.startsWith(prefix) || !line.endsWith(']}')) throw new Error();
    const item =
      /\{"bytes":(0|[1-9][0-9]{0,15}),"micros":(0|[1-9][0-9]{0,15}),"error":(0|[1-9][0-9]{0,9})\}/y;
    const result: ProcessResourceBatchItem[] = [];
    let offset = prefix.length;
    for (let index = 0; index < expected; ++index) {
      item.lastIndex = offset;
      const match = item.exec(line);
      if (!match) throw new Error();
      const bytes = Number(match[1]);
      const micros = Number(match[2]);
      const error = Number(match[3]);
      if (
        !Number.isSafeInteger(bytes) ||
        !Number.isSafeInteger(micros) ||
        error > 0xffffffff ||
        (error === 0 ? bytes < 1 : bytes !== 0 || micros !== 0)
      )
        throw new Error();
      result.push({ bytes, micros, error });
      offset = item.lastIndex;
      if (index + 1 < expected) {
        if (line[offset] !== ',') throw new Error();
        ++offset;
      }
    }
    if (offset !== line.length - 2) throw new Error();
    return result;
  } catch {
    throw new ProcessSampleError('PROCESS_SAMPLE_INVALID');
  }
}
