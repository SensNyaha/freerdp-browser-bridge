import { open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { PacketOwnerError } from './seqpacket-owner.js';

export type WorkerIpcTransport =
  | 'auto'
  | 'framed-pipes'
  | 'unix-seqpacket-rws1';
interface PairManifest {
  v: 1;
  transport: 'unix-seqpacket-rws1';
  worker: string;
  adapter: 'rdp-ipc.node';
  workerSha256: string;
  adapterSha256: string;
  maxPairs: 32;
}
export function parseIpcManifest(value: unknown): PairManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new PacketOwnerError('IPC_PAIR_INVALID');
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).sort().join(',') !==
      'adapter,adapterSha256,maxPairs,transport,v,worker,workerSha256' ||
    record.v !== 1 ||
    record.transport !== 'unix-seqpacket-rws1' ||
    record.worker !== 'rdp-worker' ||
    record.adapter !== 'rdp-ipc.node' ||
    record.maxPairs !== 32 ||
    typeof record.workerSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(record.workerSha256) ||
    typeof record.adapterSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(record.adapterSha256)
  )
    throw new PacketOwnerError('IPC_PAIR_INVALID');
  return { ...record } as unknown as PairManifest;
}
async function hash(file: string): Promise<string> {
  const input = await open(
    file,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = await input.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > 64 * 1024 * 1024)
      throw new PacketOwnerError('IPC_PAIR_INVALID');
    const digest = createHash('sha256');
    const scratch = Buffer.alloc(65536);
    let count = 0;
    while (count < stat.size) {
      const { bytesRead } = await input.read(
        scratch,
        0,
        Math.min(scratch.length, stat.size - count),
        count,
      );
      if (bytesRead === 0) throw new PacketOwnerError('IPC_PAIR_INVALID');
      digest.update(scratch.subarray(0, bytesRead));
      count += bytesRead;
    }
    const after = await input.stat();
    if (
      after.size !== stat.size ||
      after.mtimeMs !== stat.mtimeMs ||
      after.ctimeMs !== stat.ctimeMs
    )
      throw new PacketOwnerError('IPC_PAIR_INVALID');
    return digest.digest('hex');
  } finally {
    await input.close();
  }
}
/** Build pairing is integrity/compatibility metadata, not an authentication signature. */
export async function selectWorkerIpc(
  workerPath: string,
  requested: WorkerIpcTransport,
): Promise<'framed-pipes' | 'unix-seqpacket-rws1'> {
  if (requested !== 'auto') return requested;
  if (process.platform !== 'linux') return 'framed-pipes';
  try {
    let worker: string;
    try {
      worker = await realpath(workerPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return 'framed-pipes';
      throw error;
    }
    let file;
    try {
      file = await open(
        worker + '.ipc.json',
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return 'framed-pipes';
      throw error;
    }
    let manifest: PairManifest;
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size < 1 || stat.size > 8192)
        throw new PacketOwnerError('IPC_PAIR_INVALID');
      // A bounded read also refuses growth after stat, rather than readFile allocating it.
      const bytes = Buffer.alloc(8193);
      const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
      if (bytesRead !== stat.size)
        throw new PacketOwnerError('IPC_PAIR_INVALID');
      manifest = parseIpcManifest(
        JSON.parse(bytes.subarray(0, bytesRead).toString('utf8')),
      );
    } finally {
      await file.close();
    }
    if (basename(worker) !== manifest.worker)
      throw new PacketOwnerError('IPC_PAIR_INVALID');
    const adapter = join(dirname(worker), manifest.adapter);
    if (
      (await hash(worker)) !== manifest.workerSha256 ||
      (await hash(adapter)) !== manifest.adapterSha256
    )
      throw new PacketOwnerError('IPC_PAIR_MISMATCH');
    return 'unix-seqpacket-rws1';
  } catch (error) {
    throw error instanceof PacketOwnerError
      ? error
      : new PacketOwnerError('IPC_PAIR_INVALID');
  }
}
