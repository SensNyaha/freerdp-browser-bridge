import { constants } from 'node:fs';
import { lstat, open, opendir, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  dirname,
  join,
  relative,
  isAbsolute,
  sep,
  resolve,
  toNamespacedPath,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WorkerOptions } from './index.js';
import { selectWorkerIpc } from './ipc-selection.js';

const maximumFileBytes = 64 * 1024 * 1024;
const maximumTotalBytes = 256 * 1024 * 1024;
const freeRdpCommit = 'bf217a504e54cc719880c228e82353382cd7d4fa';
type Platform = 'linux' | 'win32';
interface RuntimeFile {
  path: string;
  bytes: number;
  sha256: string;
}
interface RuntimeManifest {
  schema: 1;
  productVersion: string;
  freeRdpVersion: '3.32.1';
  freeRdpCommit: typeof freeRdpCommit;
  platform: Platform;
  arch: 'x64';
  files: RuntimeFile[];
}
export class NativeRuntimeError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
function refuse(code = 'NATIVE_RUNTIME_INVALID'): never {
  throw new NativeRuntimeError(code);
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) refuse();
  return value as Record<string, unknown>;
}
export function nativeRuntimePackageName(platform: Platform): string {
  return platform === 'linux'
    ? '@freerdp-bridge/runtime-linux-x64-gnu'
    : '@freerdp-bridge/runtime-win32-x64';
}
/** The inventory is compatibility/integrity metadata, not a publisher signature. */
export function parseNativeRuntimeManifest(
  value: unknown,
  version: string,
  platform: Platform,
): RuntimeManifest {
  const record = object(value);
  if (
    Object.keys(record).sort().join(',') !==
      'arch,files,freeRdpCommit,freeRdpVersion,platform,productVersion,schema' ||
    record.schema !== 1 ||
    record.productVersion !== version ||
    record.freeRdpVersion !== '3.32.1' ||
    record.freeRdpCommit !== freeRdpCommit ||
    record.platform !== platform ||
    record.arch !== 'x64' ||
    !Array.isArray(record.files) ||
    record.files.length < 1 ||
    record.files.length > 512
  )
    refuse('NATIVE_RUNTIME_MISMATCH');
  let total = 0;
  const names = new Set<string>();
  const files = record.files.map((entry) => {
    const file = object(entry);
    if (
      Object.keys(file).sort().join(',') !== 'bytes,path,sha256' ||
      typeof file.path !== 'string' ||
      file.path.length > 240 ||
      !/^(?:bin|lib|share)\/(?:[A-Za-z0-9_+-][A-Za-z0-9_.+-]*\/){0,15}[A-Za-z0-9_+-][A-Za-z0-9_.+-]*$/.test(
        file.path,
      ) ||
      !Number.isSafeInteger(file.bytes) ||
      (file.bytes as number) < 1 ||
      (file.bytes as number) > maximumFileBytes ||
      typeof file.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(file.sha256) ||
      names.has(file.path.toLowerCase())
    )
      refuse();
    names.add(file.path.toLowerCase());
    total += file.bytes as number;
    if (total > maximumTotalBytes) refuse();
    return {
      path: file.path,
      bytes: file.bytes,
      sha256: file.sha256,
    } as RuntimeFile;
  });
  for (const name of [
    platform === 'linux' ? 'bin/rdp-worker' : 'bin/rdp-worker.exe',
    ...(platform === 'linux'
      ? [
          'bin/rdp-ipc.node',
          'bin/rdp-worker.ipc.json',
          'bin/rdp-runtime-check',
          'bin/rdp-process-query',
        ]
      : ['bin/rdp-runtime-directory.exe', 'bin/rdp-runtime-check.exe']),
    'share/freerdp-bridge/dependencies.json',
    'share/freerdp-bridge/native-features.json',
    'share/freerdp-bridge/licenses/freerdp/LICENSE',
  ])
    if (!files.some((file) => file.path === name)) refuse();
  return { ...record, files } as unknown as RuntimeManifest;
}
async function json(file: string, maximum: number): Promise<unknown> {
  if ((await lstat(file)).isSymbolicLink()) refuse();
  const handle = await open(
    file,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size < 1 || info.size > maximum) refuse();
    const bytes = Buffer.alloc(maximum + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead !== info.size) refuse();
    return JSON.parse(bytes.subarray(0, bytesRead).toString('utf8'));
  } finally {
    await handle.close();
  }
}
async function verifyTree(root: string, files: RuntimeFile[]): Promise<void> {
  const expected = new Set(files.map((file) => file.path));
  let entries = 0;
  const walk = async (directory: string, depth: number): Promise<void> => {
    if (depth > 16) refuse();
    for await (const entry of await opendir(join(root, directory))) {
      if (++entries > 1024 || entry.isSymbolicLink()) refuse();
      const path = directory ? directory + '/' + entry.name : entry.name;
      if (entry.isDirectory()) await walk(path, depth + 1);
      else if (!entry.isFile() || !expected.delete(path)) refuse();
    }
  };
  await walk('', 0);
  if (expected.size) refuse();
}
async function verifyFile(root: string, file: RuntimeFile): Promise<void> {
  // Published runtimes have flattened private links. Refuse all link components.
  let target = root;
  for (const component of file.path.split('/')) {
    target = join(target, component);
    if ((await lstat(target)).isSymbolicLink()) refuse();
  }
  const canonical = await realpath(target);
  const part = relative(root, canonical);
  if (!part || part === '..' || part.startsWith('..' + sep) || isAbsolute(part))
    refuse();
  const handle = await open(
    canonical,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size !== file.bytes) refuse();
    if (
      process.platform === 'linux' &&
      [
        'bin/rdp-worker',
        'bin/rdp-process-query',
        'bin/rdp-runtime-check',
      ].includes(file.path) &&
      !(before.mode & 0o111)
    )
      refuse('NATIVE_RUNTIME_PERMISSION');
    const hash = createHash('sha256');
    const buffer = Buffer.alloc(65536);
    let offset = 0;
    while (offset < file.bytes) {
      const { bytesRead } = await handle.read(
        buffer,
        0,
        Math.min(buffer.length, file.bytes - offset),
        offset,
      );
      if (!bytesRead) refuse();
      offset += bytesRead;
      hash.update(buffer.subarray(0, bytesRead));
    }
    const after = await handle.stat();
    if (
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs ||
      hash.digest('hex') !== file.sha256
    )
      refuse('NATIVE_RUNTIME_INTEGRITY');
  } finally {
    await handle.close();
  }
}
export interface NativeRuntimeOptions {
  /** A private writable session root owned by the host application. */
  runtimeRoot: string;
  /** Trusted explicit runtime npm package directory; never a browser setting. */
  packageDirectory?: string;
}
/** Resolve/verify once during host startup. Never downloads, compiles or launches RDP. */
export async function resolveNativeRuntime(
  options: NativeRuntimeOptions,
): Promise<WorkerOptions> {
  if (process.versions.node.split('.')[0] !== '24')
    refuse('NATIVE_RUNTIME_NODE');
  if (process.arch !== 'x64' || !['linux', 'win32'].includes(process.platform))
    refuse('NATIVE_RUNTIME_PLATFORM');
  if (
    typeof options.runtimeRoot !== 'string' ||
    !isAbsolute(options.runtimeRoot)
  )
    refuse('NATIVE_RUNTIME_ROOT');
  const platform = process.platform as Platform;
  if (platform === 'linux') {
    // Inspect only this scalar in memory; never emit or persist a process report.
    const report = process.report.getReport() as {
      header?: { glibcVersionRuntime?: string };
    };
    if (!/^\d+\.\d+(?:\.\d+)?$/.test(report.header?.glibcVersionRuntime ?? ''))
      refuse('NATIVE_RUNTIME_LIBC');
  }
  try {
    const own = object(
      await json(
        fileURLToPath(new URL('../package.json', import.meta.url)),
        65536,
      ),
    );
    if (
      typeof own.version !== 'string' ||
      !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(own.version)
    )
      refuse();
    let directory: string;
    if (options.packageDirectory !== undefined) {
      if (!isAbsolute(options.packageDirectory)) refuse('NATIVE_RUNTIME_ROOT');
      directory = await realpath(options.packageDirectory);
    } else {
      let manifestPath: string;
      try {
        manifestPath = createRequire(import.meta.url).resolve(
          nativeRuntimePackageName(platform) + '/package.json',
        );
      } catch {
        refuse('NATIVE_RUNTIME_NOT_INSTALLED');
      }
      directory = dirname(await realpath(manifestPath));
    }
    const manifest = object(await json(join(directory, 'package.json'), 65536));
    if (
      manifest.name !== nativeRuntimePackageName(platform) ||
      manifest.version !== own.version
    )
      refuse('NATIVE_RUNTIME_MISMATCH');
    const inventory = parseNativeRuntimeManifest(
      await json(join(directory, 'runtime-manifest.json'), 131072),
      own.version,
      platform,
    );
    const root = join(directory, 'runtime');
    if ((await lstat(root)).isSymbolicLink()) refuse();
    await verifyTree(root, inventory.files);
    for (const file of inventory.files) await verifyFile(root, file);
    const workerPath = join(
      root,
      'bin',
      platform === 'linux' ? 'rdp-worker' : 'rdp-worker.exe',
    );
    if (
      platform === 'linux' &&
      (await selectWorkerIpc(workerPath, 'auto')) !== 'unix-seqpacket-rws1'
    )
      refuse('NATIVE_RUNTIME_MISMATCH');
    return {
      workerPath:
        platform === 'win32' ? toNamespacedPath(workerPath) : workerPath,
      runtimeRoot: resolve(options.runtimeRoot),
      ipcTransport: 'auto',
    };
  } catch (error) {
    throw error instanceof NativeRuntimeError
      ? error
      : new NativeRuntimeError('NATIVE_RUNTIME_INVALID');
  }
}
