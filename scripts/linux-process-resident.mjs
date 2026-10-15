import { open } from 'node:fs/promises';

export function linuxResidentReceipt(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 16384)
    throw new Error('LAB_PROCESS_SAMPLE_INVALID');
  const matches = [
    ...text.matchAll(/^VmRSS:[\t ]+([0-9]{1,13})[\t ]+kB[\t ]*$/gm),
  ];
  if (matches.length !== 1) throw new Error('LAB_PROCESS_SAMPLE_INVALID');
  const bytes = Number(matches[0][1]) * 1024;
  if (!Number.isSafeInteger(bytes) || bytes < 1)
    throw new Error('LAB_PROCESS_SAMPLE_INVALID');
  return bytes;
}

// Sampling only; process ownership/liveness remains the caller's responsibility.
export async function linuxWorkerResidentBytes(pid) {
  if (!Number.isInteger(pid) || pid < 1 || pid > 0x7fffffff)
    throw new Error('LAB_PROCESS_SAMPLE_INVALID');
  if (process.platform !== 'linux')
    throw new Error('LAB_PROCESS_SAMPLE_UNAVAILABLE');
  const scratch = Buffer.alloc(16385);
  let file;
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
    throw new Error('LAB_PROCESS_SAMPLE_UNAVAILABLE');
  } finally {
    scratch.fill(0);
    try {
      await file?.close();
    } catch {
      throw new Error('LAB_PROCESS_SAMPLE_UNAVAILABLE');
    }
  }
}
