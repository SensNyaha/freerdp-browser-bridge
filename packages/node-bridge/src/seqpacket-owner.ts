import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { HEADER_BYTES, decodeHeader } from '@freerdp-bridge/protocol';

export interface PacketAddon {
  readonly schemaVersion: 1;
  create(): number;
  childFd(id: number): number;
  closeChild(id: number): boolean;
  close(id: number): boolean;
  closed(id: number): boolean;
  watch(
    id: number,
    callback: (status: number, events: number) => void,
  ): boolean;
  interest(id: number, mask: number): boolean;
  write(id: number, bytes: Buffer): boolean;
  flush(id: number): boolean;
  read(id: number): Buffer | null | undefined;
}
export function loadPacketAddon(path: string): PacketAddon {
  let value: unknown;
  try {
    value = createRequire(import.meta.url)(path);
  } catch {
    throw new PacketOwnerError('IPC_ADAPTER_PROFILE');
  }
  if (!value || typeof value !== 'object')
    throw new PacketOwnerError('IPC_ADAPTER_PROFILE');
  const record = value as Record<string, unknown>;
  if (
    record.schemaVersion !== 1 ||
    [
      'create',
      'childFd',
      'closeChild',
      'close',
      'closed',
      'watch',
      'interest',
      'write',
      'flush',
      'read',
    ].some((name) => typeof record[name] !== 'function')
  )
    throw new PacketOwnerError('IPC_ADAPTER_PROFILE');
  return value as PacketAddon;
}
export class PacketOwnerError extends Error {
  constructor(readonly code: string) {
    super(`Private packet IPC failed (${code})`);
  }
}
interface RecordOwner {
  bytes: Buffer;
  done: (error?: Error) => void;
}
export interface PacketOwnerOptions {
  maxRecords?: number;
  maxBytes?: number;
  recordTimeoutMs?: number;
  closeTimeoutMs?: number;
}
/** Prepared private owner; evented reads and one nonblocking native send. */
export class SeqpacketOwner extends EventEmitter {
  readonly retired: Promise<void>;
  private resolveRetired!: () => void;
  private rejectRetired!: (error: Error) => void;
  private readonly id: number;
  private readonly options: Required<PacketOwnerOptions>;
  private queue: RecordOwner[] = [];
  private active: RecordOwner | undefined;
  private ownedBytes = 0;
  private paused = true;
  private servicing = false;
  private disposed = false;
  private joined = false;
  private readRemaining = 0;
  private readDue: number | undefined;
  private writeDue: number | undefined;
  private timer: NodeJS.Timeout | undefined;
  private closeTimer: NodeJS.Timeout | undefined;
  private immediate: NodeJS.Immediate | undefined;

  private constructor(
    private readonly api: PacketAddon,
    options: PacketOwnerOptions,
  ) {
    super();
    this.options = {
      maxRecords: options.maxRecords ?? 32,
      maxBytes: options.maxBytes ?? 65536,
      recordTimeoutMs: options.recordTimeoutMs ?? 1000,
      closeTimeoutMs: options.closeTimeoutMs ?? 1000,
    };
    if (
      Object.values(this.options).some(
        (value) => !Number.isSafeInteger(value) || value < 1,
      ) ||
      this.options.recordTimeoutMs < 20 ||
      this.options.recordTimeoutMs > 1000 ||
      this.options.closeTimeoutMs < 20 ||
      this.options.closeTimeoutMs > 5000
    )
      throw new PacketOwnerError('IPC_INVALID_OPTIONS');
    this.retired = new Promise((resolve, reject) => {
      this.resolveRetired = resolve;
      this.rejectRetired = reject;
    });
    void this.retired.catch(() => {}); // Owner still exposes the original rejection.
    this.id = api.create();
  }
  static async open(
    api: PacketAddon,
    options: PacketOwnerOptions = {},
  ): Promise<SeqpacketOwner> {
    let owner: SeqpacketOwner;
    try {
      owner = new SeqpacketOwner(api, options);
    } catch (error) {
      throw error instanceof PacketOwnerError
        ? error
        : new PacketOwnerError('IPC_CREATE_FAILED');
    }
    try {
      api.watch(owner.id, (status, events) => owner.ready(status, events));
      return owner;
    } catch {
      owner.destroy();
      await owner.retired;
      throw new PacketOwnerError('IPC_BIND_FAILED');
    }
  }
  get destroyed() {
    return this.disposed;
  }
  get writableLength() {
    return this.ownedBytes;
  }
  get snapshot() {
    return {
      destroyed: this.disposed,
      retired: this.joined,
      closePending: this.closeTimer !== undefined,
      records: this.queue.length + (this.active ? 1 : 0),
      bytes: this.ownedBytes,
      readRemaining: this.readRemaining,
      paused: this.paused,
    };
  }
  childFd() {
    return this.api.childFd(this.id);
  }
  closeChild() {
    this.api.closeChild(this.id);
  }
  pause() {
    if (!this.disposed) {
      this.paused = true;
      this.interest();
    }
  }
  resume() {
    if (this.disposed) return;
    if (this.listenerCount('data') === 0)
      throw new PacketOwnerError('IPC_NO_CONSUMER');
    this.paused = false;
    this.interest();
  }
  write(bytes: Buffer, done: (error?: Error) => void): boolean {
    try {
      if (this.disposed) throw new PacketOwnerError('IPC_CLOSED');
      if (
        !Buffer.isBuffer(bytes) ||
        bytes.length < HEADER_BYTES ||
        decodeHeader(bytes.subarray(0, HEADER_BYTES)).length + HEADER_BYTES !==
          bytes.length
      )
        throw new PacketOwnerError('IPC_PROTOCOL_ERROR');
      if (
        this.queue.length + (this.active ? 1 : 0) >= this.options.maxRecords ||
        bytes.length > this.options.maxBytes - this.ownedBytes
      )
        throw new PacketOwnerError('IPC_QUEUE_FULL');
    } catch (error) {
      queueMicrotask(() =>
        done(
          error instanceof PacketOwnerError
            ? error
            : new PacketOwnerError('IPC_PROTOCOL_ERROR'),
        ),
      );
      return false;
    }
    this.ownedBytes += bytes.length;
    this.queue.push({ bytes, done });
    this.pump();
    return true;
  }
  private notify(record: RecordOwner, error?: Error) {
    try {
      record.done(error);
    } catch {
      if (!this.disposed)
        this.destroy(new PacketOwnerError('IPC_CONSUMER_FAILED'));
    }
  }
  private interest() {
    if (this.disposed) return;
    try {
      this.api.interest(this.id, (this.paused ? 0 : 1) | (this.active ? 2 : 0));
    } catch {
      this.destroy(new PacketOwnerError('IPC_ADAPTER_FAILED'));
    }
  }
  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.disposed) return;
    const due = Math.min(this.readDue ?? Infinity, this.writeDue ?? Infinity);
    if (due !== Infinity)
      this.timer = setTimeout(
        () => {
          this.timer = undefined;
          if (performance.now() >= due)
            this.destroy(new PacketOwnerError('IPC_RECORD_TIMEOUT'));
          else this.schedule();
        },
        Math.max(1, Math.ceil(due - performance.now())),
      );
  }
  private pump() {
    if (this.disposed || this.servicing) return;
    this.servicing = true;
    try {
      for (let count = 0; count < 32 && !this.disposed; ++count) {
        let sent: boolean;
        if (this.active) sent = this.api.flush(this.id);
        else {
          this.active = this.queue.shift();
          if (!this.active) break;
          this.writeDue = performance.now() + this.options.recordTimeoutMs;
          sent = this.api.write(this.id, this.active.bytes);
        }
        if (this.disposed || !sent) break;
        const record = this.active;
        this.active = undefined;
        this.writeDue = undefined;
        this.ownedBytes -= record.bytes.length;
        this.notify(record);
      }
    } catch {
      this.destroy(new PacketOwnerError('IPC_WRITE_FAILED'));
    } finally {
      this.servicing = false;
    }
    this.interest();
    this.schedule();
    if (!this.disposed && !this.active && this.queue.length && !this.immediate)
      this.immediate = setImmediate(() => {
        this.immediate = undefined;
        this.pump();
      });
  }
  private ready(status: number, events: number) {
    if (this.disposed) return;
    if (
      !Number.isInteger(status) ||
      status < 0 ||
      !Number.isInteger(events) ||
      events < 0 ||
      events > 3
    ) {
      this.destroy(new PacketOwnerError('IPC_PEER_FAILED'));
      return;
    }
    try {
      if (events & 2 && this.active) this.pump();
      if (events & 1)
        for (
          let count = 0;
          count < 32 && !this.paused && !this.disposed;
          ++count
        ) {
          const chunk = this.api.read(this.id);
          if (chunk === null) break;
          if (chunk === undefined) {
            if (this.readRemaining !== 0)
              throw new PacketOwnerError('IPC_PROTOCOL_ERROR');
            this.emit('end');
            this.destroy();
            break;
          }
          if (
            !Buffer.isBuffer(chunk) ||
            chunk.length < 1 ||
            chunk.length > 16384
          )
            throw new PacketOwnerError('IPC_PROTOCOL_ERROR');
          if (this.readRemaining === 0) {
            if (chunk.length < HEADER_BYTES)
              throw new PacketOwnerError('IPC_PROTOCOL_ERROR');
            this.readRemaining =
              HEADER_BYTES +
              decodeHeader(chunk.subarray(0, HEADER_BYTES)).length;
            this.readDue = performance.now() + this.options.recordTimeoutMs;
          }
          if (chunk.length > this.readRemaining)
            throw new PacketOwnerError('IPC_PROTOCOL_ERROR');
          this.readRemaining -= chunk.length;
          if (this.readRemaining === 0) this.readDue = undefined;
          this.emit('data', chunk);
        }
    } catch {
      this.destroy(new PacketOwnerError('IPC_READ_FAILED'));
    }
    this.interest();
    this.schedule();
  }
  destroy(error?: Error) {
    if (this.disposed) return;
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.immediate) clearImmediate(this.immediate);
    this.timer = undefined;
    this.immediate = undefined;
    const records = this.active ? [this.active, ...this.queue] : this.queue;
    this.active = undefined;
    this.queue = [];
    this.ownedBytes = 0;
    this.readRemaining = 0;
    this.readDue = undefined;
    this.writeDue = undefined;
    try {
      this.api.close(this.id);
    } catch {
      error ??= new PacketOwnerError('IPC_CLOSE_FAILED');
    }
    for (const record of records) {
      record.bytes.fill(0);
      this.notify(record, error ?? new PacketOwnerError('IPC_CLOSED'));
    }
    const due = performance.now() + this.options.closeTimeoutMs;
    const join = () => {
      this.closeTimer = undefined;
      try {
        if (this.api.closed(this.id)) {
          this.joined = true;
          this.resolveRetired();
          this.emit('close');
          return;
        }
        if (performance.now() >= due)
          throw new PacketOwnerError('IPC_CLOSE_TIMEOUT');
        this.closeTimer = setTimeout(
          join,
          Math.min(20, Math.max(1, Math.ceil(due - performance.now()))),
        );
      } catch (error) {
        this.rejectRetired(
          error instanceof PacketOwnerError
            ? error
            : new PacketOwnerError('IPC_CLOSE_FAILED'),
        );
      }
    };
    join();
    if (error) queueMicrotask(() => this.emit('error', error));
  }
}
