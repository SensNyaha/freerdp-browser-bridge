import { randomBytes } from 'node:crypto';
import {
  FILE_CHUNK_BYTES,
  validFileName,
  encodeFileRecord,
  decodeFileRecord,
  decodeFilePage,
  type FileRecord,
  type FileStatus,
  type NativeFileEntry,
} from '@freerdp-bridge/protocol';
import type { NativeFileCommand } from './index.js';

export type FileErrorCode =
  | 'FILES_NOT_IMPLEMENTED'
  | 'FILES_NOT_CONNECTED'
  | 'FILE_NOT_FOUND'
  | 'FILE_INVALID'
  | 'FILE_QUOTA_EXCEEDED'
  | 'FILE_DISK_FULL'
  | 'FILE_EXISTS'
  | 'FILE_BUSY'
  | 'FILE_DENIED'
  | 'FILE_TIMEOUT'
  | 'FILE_FAILED'
  | 'FILE_NOT_EMPTY'
  | 'FILE_SIZE_MISMATCH'
  | 'FILE_UNAVAILABLE'
  | 'FILE_CONTENT_TYPE';
export class FileError extends Error {
  constructor(readonly code: FileErrorCode) {
    super('File operation failed');
  }
}
export interface ManagedFilesOptions {
  /** Trusted-host opt-in for XRDP's metadata-only unlink sequence. */
  xrdpLegacyDelete?: boolean;
  maxTotalBytes?: number;
  maxFileBytes?: number;
  maxEntries?: number;
  transferTimeoutMs?: number;
  progressTimeoutMs?: number;
  nativeTimeoutMs?: number;
}
export type ManagedFilesPolicy = Readonly<Required<ManagedFilesOptions>>;
export function resolveManagedFilesPolicy(
  options: ManagedFilesOptions,
): ManagedFilesPolicy {
  if (!options || typeof options !== 'object' || Array.isArray(options))
    throw new Error('Invalid file policy');
  if (
    options.xrdpLegacyDelete !== undefined &&
    typeof options.xrdpLegacyDelete !== 'boolean'
  )
    throw new Error('Invalid file policy');
  const result = {
    maxTotalBytes: options.maxTotalBytes ?? 268435456,
    maxFileBytes: options.maxFileBytes ?? 67108864,
    maxEntries: options.maxEntries ?? 1024,
    transferTimeoutMs: options.transferTimeoutMs ?? 600000,
    progressTimeoutMs: options.progressTimeoutMs ?? 30000,
    nativeTimeoutMs: options.nativeTimeoutMs ?? 8000,
  };
  for (const [key, value] of Object.entries(result)) {
    if (
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value >
        (key.endsWith('Bytes')
          ? 2 ** 40
          : key === 'maxEntries'
            ? 65536
            : 600000)
    )
      throw new Error('Invalid file policy');
  }
  if (
    result.maxFileBytes > result.maxTotalBytes ||
    result.transferTimeoutMs < 10 ||
    result.progressTimeoutMs < 10 ||
    result.nativeTimeoutMs < 10 ||
    result.nativeTimeoutMs > 30000 ||
    result.nativeTimeoutMs > result.progressTimeoutMs ||
    result.progressTimeoutMs > result.transferTimeoutMs
  )
    throw new Error('Invalid file policy');
  return Object.freeze({
    ...result,
    xrdpLegacyDelete: options.xrdpLegacyDelete ?? false,
  });
}
export interface ManagedFile {
  fileId: string;
  name: string;
  kind: 'file' | 'directory';
  size: number;
}
export interface ManagedFilePage {
  entries: ManagedFile[];
  nextCursor?: string;
}
export interface FileUpload {
  readonly signal: AbortSignal;
  write(bytes: Buffer): Promise<void>;
  finish(): Promise<ManagedFile>;
  abort(): Promise<void>;
}
export interface FileDownload {
  readonly signal: AbortSignal;
  readonly file: ManagedFile;
  read(): Promise<Buffer>;
  close(): Promise<void>;
}
type Cached = ManagedFile & { nativeId: bigint; parent: bigint };
type Active = {
  kind: 'upload' | 'download' | 'operation';
  control: AbortController;
  reason?: FileError;
  nativeId?: bigint;
  opened: boolean;
  published: boolean;
  unknown: boolean;
  offset: number;
  size: number;
  pending?: Promise<FileRecord>;
  finishing?: Promise<void>;
  whole: NodeJS.Timeout;
  progress: NodeJS.Timeout;
  unsubscribe?: () => void;
};
const errors: Record<Exclude<FileStatus, 'ok'>, FileErrorCode> = {
  invalid: 'FILE_INVALID',
  missing: 'FILE_NOT_FOUND',
  exists: 'FILE_EXISTS',
  denied: 'FILE_DENIED',
  busy: 'FILE_BUSY',
  limit: 'FILE_QUOTA_EXCEEDED',
  'disk-full': 'FILE_DISK_FULL',
  unavailable: 'FILES_NOT_IMPLEMENTED',
  retired: 'FILE_UNAVAILABLE',
  retained: 'FILE_FAILED',
  io: 'FILE_FAILED',
  'not-empty': 'FILE_NOT_EMPTY',
};

/** One bounded, session-owned public locator registry and one active transaction.
 * Guard is supplied by the authenticated session manager. Backend results own
 * their bytes. No pathname IO, native quota ledger or worker process is created.
 */
export class ManagedFiles {
  private readonly cache = new Map<string, Cached>();
  private readonly reverse = new Map<bigint, string>();
  private active?: Active;
  private retired = false;
  private poisoned = false;
  constructor(
    readonly policy: ManagedFilesPolicy,
    private readonly backend: (
      command: NativeFileCommand,
    ) => Promise<FileRecord>,
    private readonly guard: () => void,
    private readonly fatal: () => void,
  ) {
    this.policy = resolveManagedFilesPolicy(policy);
  }
  authorize(): void {
    this.guard();
    if (this.retired) throw new FileError('FILE_UNAVAILABLE');
  }
  private poison(): void {
    if (this.poisoned) return;
    this.poisoned = true;
    this.retired = true;
    this.cache.clear();
    this.reverse.clear();
    if (this.active) this.cancel(this.active, new FileError('FILE_FAILED'));
    this.fatal();
  }
  private cancel(active: Active, error: FileError): void {
    active.reason ??= error;
    if (!active.control.signal.aborted) active.control.abort(active.reason);
  }
  private check(active: Active): void {
    this.authorize();
    if (
      this.active !== active ||
      active.finishing ||
      active.control.signal.aborted
    )
      throw active.reason ?? new FileError('FILE_UNAVAILABLE');
  }
  private touch(active: Active): void {
    clearTimeout(active.progress);
    active.progress = setTimeout(
      () => this.cancel(active, new FileError('FILE_TIMEOUT')),
      this.policy.progressTimeoutMs,
    );
    active.progress.unref();
  }
  private acquire(kind: Active['kind'], signal?: AbortSignal): Active {
    this.authorize();
    if (this.active) throw new FileError('FILE_BUSY');
    if (signal?.aborted) throw new FileError('FILE_UNAVAILABLE');
    const control = new AbortController();
    const active: Active = {
      kind,
      control,
      opened: false,
      published: false,
      unknown: false,
      offset: 0,
      size: 0,
      whole: setTimeout(
        () => this.cancel(active, new FileError('FILE_TIMEOUT')),
        this.policy.transferTimeoutMs,
      ),
      progress: setTimeout(
        () => this.cancel(active, new FileError('FILE_TIMEOUT')),
        this.policy.progressTimeoutMs,
      ),
    };
    active.whole.unref();
    active.progress.unref();
    this.active = active;
    if (signal) {
      const abort = () =>
        this.cancel(active, new FileError('FILE_UNAVAILABLE'));
      signal.addEventListener('abort', abort, { once: true });
      active.unsubscribe = () => signal.removeEventListener('abort', abort);
    }
    control.signal.addEventListener(
      'abort',
      () => {
        void this.finish(active).catch(() => {});
      },
      { once: true },
    );
    return active;
  }
  private command(
    active: Active,
    command: NativeFileCommand,
    apply?: (record: FileRecord) => void,
  ): Promise<FileRecord> {
    if (active.pending) throw new FileError('FILE_BUSY');
    let timer: NodeJS.Timeout | undefined;
    const native = Promise.resolve()
      .then(() => this.backend(command))
      .then((raw) => {
        let encoded: Buffer | undefined;
        try {
          encoded = encodeFileRecord(raw, true);
          const decoded = decodeFileRecord(encoded, true);
          if (active.unknown || decoded.operation !== command.operation)
            throw new FileError('FILE_FAILED');
          if (
            decoded.status === 'ok' &&
            (([
              'write',
              'commit',
              'open-download',
              'read',
              'close-download',
              'abort',
              'remove',
            ].includes(command.operation) &&
              decoded.id !== command.id) ||
              (['begin-upload', 'mkdir'].includes(command.operation) &&
                decoded.argument !== command.id))
          )
            throw new FileError('FILE_FAILED');
          const result = { ...decoded, data: Buffer.from(decoded.data) };
          try {
            apply?.(result);
          } catch (error) {
            result.data.fill(0);
            throw error;
          }
          return result;
        } finally {
          encoded?.fill(0);
          if (Buffer.isBuffer(raw?.data)) raw.data.fill(0);
        }
      });
    const bounded = Promise.race([
      native,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          active.unknown = true;
          this.poison();
          reject(new FileError('FILE_TIMEOUT'));
        }, this.policy.nativeTimeoutMs);
      }),
    ])
      .catch(() => {
        active.unknown = true;
        this.poison();
        throw new FileError('FILE_FAILED');
      })
      .finally(() => {
        if (timer) clearTimeout(timer);
        if (active.pending === bounded) delete active.pending;
      });
    active.pending = bounded;
    // A late result after a deadline must never revive a lease or retain bytes.
    void native.then(
      (result) => {
        if (active.unknown) result.data.fill(0);
      },
      () => {},
    );
    return bounded;
  }
  private ok(record: FileRecord): void {
    if (record.status === 'ok') return;
    if (record.status === 'retained' || record.status === 'retired')
      this.poison();
    throw new FileError(errors[record.status]);
  }
  private finish(active: Active): Promise<void> {
    active.finishing ??= (async () => {
      clearTimeout(active.whole);
      clearTimeout(active.progress);
      active.unsubscribe?.();
      await active.pending?.catch(() => {});
      try {
        if (
          !active.unknown &&
          active.opened &&
          active.nativeId !== undefined &&
          !active.published
        ) {
          const result = await this.command(active, {
            operation: active.kind === 'upload' ? 'abort' : 'close-download',
            id: active.nativeId,
            argument: 0n,
            value: 0n,
          });
          try {
            if (result.status !== 'ok' && result.status !== 'missing') {
              this.poison();
              throw new FileError('FILE_FAILED');
            }
          } finally {
            result.data.fill(0);
          }
        }
      } finally {
        if (this.active === active) delete this.active;
      }
    })();
    return active.finishing;
  }
  close(): Promise<void> {
    this.retired = true;
    this.cache.clear();
    this.reverse.clear();
    const active = this.active;
    if (!active) return Promise.resolve();
    this.cancel(active, new FileError('FILE_UNAVAILABLE'));
    return this.finish(active);
  }
  private lookup(id: string, directory?: boolean): Cached {
    if (typeof id !== 'string' || !/^[0-9a-f]{32}$/.test(id))
      throw new FileError('FILE_INVALID');
    const entry = this.cache.get(id);
    if (!entry) throw new FileError('FILE_NOT_FOUND');
    if (directory !== undefined && (entry.kind === 'directory') !== directory)
      throw new FileError('FILE_INVALID');
    this.cache.delete(id);
    this.cache.set(id, entry);
    return entry;
  }
  private parent(id?: string): bigint {
    return id === undefined ? 0n : this.lookup(id, true).nativeId;
  }
  private remember(entry: NativeFileEntry): ManagedFile {
    if (
      !validFileName(entry.name) ||
      entry.bytes > BigInt(this.policy.maxFileBytes) ||
      !this.policy.maxEntries
    ) {
      this.poison();
      throw new FileError('FILE_FAILED');
    }
    let fileId = this.reverse.get(entry.id);
    if (!fileId) {
      if (this.cache.size >= this.policy.maxEntries) {
        const oldest = this.cache.entries().next().value as
          | [string, Cached]
          | undefined;
        if (oldest) {
          this.cache.delete(oldest[0]);
          this.reverse.delete(oldest[1].nativeId);
        }
      }
      for (let i = 0; i < 8; i++) {
        const candidate = randomBytes(16).toString('hex');
        if (!this.cache.has(candidate)) {
          fileId = candidate;
          break;
        }
      }
      if (!fileId) {
        this.poison();
        throw new FileError('FILE_FAILED');
      }
    }
    const result: Cached = {
      fileId,
      nativeId: entry.id,
      parent: entry.parent,
      name: entry.name,
      kind: entry.directory ? 'directory' : 'file',
      size: Number(entry.bytes),
    };
    this.cache.delete(fileId);
    this.cache.set(fileId, result);
    this.reverse.set(entry.id, fileId);
    return this.public(result);
  }
  private public(entry: Cached): ManagedFile {
    return {
      fileId: entry.fileId,
      name: entry.name,
      kind: entry.kind,
      size: entry.size,
    };
  }
  private name(value: string): void {
    if (!validFileName(value)) throw new FileError('FILE_INVALID');
  }
  async list(
    parentId?: string,
    cursor?: string,
    count = 64,
    signal?: AbortSignal,
  ): Promise<ManagedFilePage> {
    this.authorize();
    const parent = this.parent(parentId);
    if (!Number.isSafeInteger(count) || count < 1 || count > 64)
      throw new FileError('FILE_INVALID');
    const after = cursor === undefined ? 0n : this.lookup(cursor).nativeId;
    if (cursor !== undefined && this.lookup(cursor).parent !== parent)
      throw new FileError('FILE_INVALID');
    const active = this.acquire('operation', signal);
    let result: FileRecord | undefined;
    try {
      result = await this.command(active, {
        operation: 'list',
        id: parent,
        argument: after,
        value: BigInt(count),
      });
      this.ok(result);
      this.check(active);
      const rows = decodeFilePage(result);
      let previous = after;
      if (
        rows.length > count ||
        rows.length > this.policy.maxEntries ||
        (result.id !== 0n && rows.length !== count)
      ) {
        this.poison();
        throw new FileError('FILE_FAILED');
      }
      for (const row of rows) {
        if (row.parent !== parent || row.id <= previous) {
          this.poison();
          throw new FileError('FILE_FAILED');
        }
        previous = row.id;
      }
      const entries = rows.map((row) => this.remember(row));
      return {
        entries,
        ...(result.id === 0n ? {} : { nextCursor: entries.at(-1)!.fileId }),
      };
    } finally {
      result?.data.fill(0);
      await this.finish(active);
    }
  }
  async mkdir(
    name: string,
    parentId?: string,
    signal?: AbortSignal,
  ): Promise<ManagedFile> {
    this.authorize();
    this.name(name);
    const parent = this.parent(parentId),
      active = this.acquire('operation', signal);
    let result: FileRecord | undefined;
    try {
      result = await this.command(active, {
        operation: 'mkdir',
        id: parent,
        argument: 0n,
        value: 0n,
        data: Buffer.from(name),
      });
      this.ok(result);
      this.check(active);
      if (result.argument !== parent || result.value !== 0n) {
        this.poison();
        throw new FileError('FILE_FAILED');
      }
      return this.remember({
        id: result.id,
        parent,
        bytes: 0n,
        directory: true,
        name,
      });
    } finally {
      result?.data.fill(0);
      await this.finish(active);
    }
  }
  async remove(fileId: string, signal?: AbortSignal): Promise<void> {
    this.authorize();
    const entry = this.lookup(fileId),
      active = this.acquire('operation', signal);
    let result: FileRecord | undefined;
    try {
      result = await this.command(active, {
        operation: 'remove',
        id: entry.nativeId,
        argument: 0n,
        value: 0n,
      });
      if (result.status === 'ok' || result.status === 'missing') {
        this.cache.delete(fileId);
        this.reverse.delete(entry.nativeId);
      }
      this.ok(result);
      this.check(active);
    } finally {
      result?.data.fill(0);
      await this.finish(active);
    }
  }
  async upload(
    name: string,
    parentId?: string,
    expectedBytes?: number,
    signal?: AbortSignal,
  ): Promise<FileUpload> {
    this.authorize();
    this.name(name);
    const parent = this.parent(parentId);
    if (
      expectedBytes !== undefined &&
      (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0)
    )
      throw new FileError('FILE_INVALID');
    if (expectedBytes !== undefined && expectedBytes > this.policy.maxFileBytes)
      throw new FileError('FILE_QUOTA_EXCEEDED');
    const active = this.acquire('upload', signal);
    try {
      const result = await this.command(
        active,
        {
          operation: 'begin-upload',
          id: parent,
          argument: 0n,
          value: 0n,
          data: Buffer.from(name),
        },
        (reply) => {
          if (reply.status === 'ok') {
            if (reply.argument !== parent) throw new FileError('FILE_FAILED');
            active.nativeId = reply.id;
            active.opened = true;
          }
        },
      );
      try {
        this.ok(result);
        this.check(active);
      } finally {
        result.data.fill(0);
      }
    } catch (error) {
      await this.finish(active);
      throw error;
    }
    const fail = async (error: unknown): Promise<never> => {
      const safe =
        error instanceof FileError ? error : new FileError('FILE_FAILED');
      this.cancel(active, safe);
      await this.finish(active);
      throw safe;
    };
    return {
      signal: active.control.signal,
      write: async (bytes) => {
        try {
          this.check(active);
          if (
            !Buffer.isBuffer(bytes) ||
            !bytes.length ||
            bytes.length > FILE_CHUNK_BYTES
          )
            throw new FileError('FILE_INVALID');
          if (bytes.length > this.policy.maxFileBytes - active.offset)
            throw new FileError('FILE_QUOTA_EXCEEDED');
          if (
            expectedBytes !== undefined &&
            bytes.length > expectedBytes - active.offset
          )
            throw new FileError('FILE_SIZE_MISMATCH');
          const result = await this.command(
            active,
            {
              operation: 'write',
              id: active.nativeId!,
              argument: BigInt(active.offset),
              value: 0n,
              data: bytes,
            },
            (reply) => {
              if (reply.status === 'ok') {
                if (
                  reply.id !== active.nativeId ||
                  reply.value !== BigInt(bytes.length) ||
                  reply.argument !== BigInt(active.offset + bytes.length)
                )
                  throw new FileError('FILE_FAILED');
                active.offset += bytes.length;
              }
            },
          );
          try {
            this.ok(result);
            this.check(active);
            this.touch(active);
          } finally {
            result.data.fill(0);
          }
        } catch (error) {
          await fail(error);
        }
      },
      finish: async () => {
        try {
          this.check(active);
          if (expectedBytes !== undefined && active.offset !== expectedBytes)
            throw new FileError('FILE_SIZE_MISMATCH');
          const result = await this.command(
            active,
            {
              operation: 'commit',
              id: active.nativeId!,
              argument: BigInt(active.offset),
              value: 0n,
            },
            (reply) => {
              if (reply.status === 'ok') {
                if (
                  reply.id !== active.nativeId ||
                  reply.value !== BigInt(active.offset)
                )
                  throw new FileError('FILE_FAILED');
                active.published = true;
              }
            },
          );
          try {
            this.ok(result);
            this.check(active);
            return this.remember({
              id: active.nativeId!,
              parent,
              bytes: BigInt(active.offset),
              directory: false,
              name,
            });
          } finally {
            result.data.fill(0);
            await this.finish(active);
          }
        } catch (error) {
          return fail(error);
        }
      },
      abort: () => {
        this.cancel(active, new FileError('FILE_UNAVAILABLE'));
        return this.finish(active);
      },
    };
  }
  async download(fileId: string, signal?: AbortSignal): Promise<FileDownload> {
    this.authorize();
    const cached = this.lookup(fileId, false),
      active = this.acquire('download', signal);
    try {
      const result = await this.command(
        active,
        {
          operation: 'open-download',
          id: cached.nativeId,
          argument: 0n,
          value: 0n,
        },
        (reply) => {
          if (reply.status === 'ok') {
            if (
              reply.id !== cached.nativeId ||
              reply.value > BigInt(this.policy.maxFileBytes)
            )
              throw new FileError('FILE_FAILED');
            active.nativeId = cached.nativeId;
            active.opened = true;
            active.size = Number(reply.value);
          }
        },
      );
      try {
        this.ok(result);
        this.check(active);
      } finally {
        result.data.fill(0);
      }
    } catch (error) {
      await this.finish(active);
      throw error;
    }
    return {
      signal: active.control.signal,
      file: { ...this.public(cached), size: active.size },
      read: async () => {
        let result: FileRecord | undefined;
        try {
          this.check(active);
          result = await this.command(active, {
            operation: 'read',
            id: active.nativeId!,
            argument: BigInt(active.offset),
            value: BigInt(FILE_CHUNK_BYTES),
          });
          this.ok(result);
          this.check(active);
          if (
            result.id !== active.nativeId ||
            result.argument !== BigInt(active.offset) ||
            result.data.length > active.size - active.offset ||
            (active.offset < active.size && !result.data.length)
          ) {
            this.poison();
            throw new FileError('FILE_FAILED');
          }
          active.offset += result.data.length;
          this.touch(active);
          return Buffer.from(result.data);
        } catch (error) {
          this.cancel(
            active,
            error instanceof FileError ? error : new FileError('FILE_FAILED'),
          );
          await this.finish(active);
          throw error instanceof FileError
            ? error
            : new FileError('FILE_FAILED');
        } finally {
          result?.data.fill(0);
        }
      },
      close: () => this.finish(active),
    };
  }
}
