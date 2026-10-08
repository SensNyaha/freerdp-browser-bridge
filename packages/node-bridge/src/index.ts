import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
export * from './session-manager.js';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  Kind,
  PacketDecoder,
  decodeBuild,
  encodePacket,
  helloPayload,
  type Packet,
  type WorkerBuild,
} from '@freerdp-bridge/protocol';
export {
  validateSessionConfig,
  SessionCreateSchema,
  redactSecrets,
  type SessionCreate,
} from '@freerdp-bridge/config';
export type {
  SessionState,
  BridgeFailure,
  DeviceCapability,
  WorkerBuild,
} from '@freerdp-bridge/protocol';

export class WorkerError extends Error {
  constructor(readonly code: string) {
    super(`Worker operation failed (${code})`);
  }
}

export interface WorkerOptions {
  workerPath: string;
  runtimeRoot: string;
  requestTimeoutMs?: number;
  startupTimeoutMs?: number;
  shutdownTimeoutMs?: number;
  heartbeatIntervalMs?: number;
  maxPendingRequests?: number;
  maxWriteBytes?: number;
}

type Status =
  | 'created'
  | 'starting'
  | 'ready'
  | 'closing'
  | 'closed'
  | 'failed';
type Pending = {
  expected: Kind;
  resolve: (packet: Packet) => void;
  reject: (error: WorkerError) => void;
  timer: NodeJS.Timeout;
};

/** Owns exactly one native lifecycle process; readiness does not imply an RDP connection. */
export class WorkerProcess extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | undefined;
  private directory: string | undefined;
  private pending = new Map<bigint, Pending>();
  private sequence = 0n;
  private heartbeat: NodeJS.Timeout | undefined;
  private closedPromise: Promise<void> | undefined;
  private closePromise: Promise<void> | undefined;
  private status: Status = 'created';
  private report: WorkerBuild | undefined;
  private readonly options: Required<WorkerOptions>;

  constructor(options: WorkerOptions) {
    super();
    this.options = {
      workerPath: resolve(options.workerPath),
      runtimeRoot: resolve(options.runtimeRoot),
      requestTimeoutMs: options.requestTimeoutMs ?? 2000,
      shutdownTimeoutMs: options.shutdownTimeoutMs ?? 2000,
      startupTimeoutMs: options.startupTimeoutMs ?? 10000,
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? 1000,
      maxPendingRequests: options.maxPendingRequests ?? 32,
      maxWriteBytes: options.maxWriteBytes ?? 65536,
    };
    for (const value of [
      this.options.requestTimeoutMs,
      this.options.startupTimeoutMs,
      this.options.shutdownTimeoutMs,
      this.options.heartbeatIntervalMs,
      this.options.maxPendingRequests,
      this.options.maxWriteBytes,
    ]) {
      if (!Number.isSafeInteger(value) || value < 1)
        throw new WorkerError('INVALID_OPTIONS');
    }
  }

  get state(): Status {
    return this.status;
  }
  get pid(): number | undefined {
    return this.child?.pid;
  }
  get build(): WorkerBuild | undefined {
    return this.report ? structuredClone(this.report) : undefined;
  }

  private setState(state: Status): void {
    this.status = state;
    this.emit('state', state);
  }
  private fail(code: string): void {
    if (this.status === 'closed' || this.status === 'failed') return;
    this.setState('failed');
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = undefined;
    const error = new WorkerError(code);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.child?.kill('SIGKILL');
    this.emit('failure', error);
  }

  async start(): Promise<WorkerBuild> {
    if (this.status !== 'created') throw new WorkerError('INVALID_STATE');
    this.setState('starting');
    try {
      await mkdir(this.options.runtimeRoot, { recursive: true, mode: 0o700 });
      this.directory = await mkdtemp(join(this.options.runtimeRoot, 'worker-'));
      await writeFile(join(this.directory, '.rdp-worker-owned'), 'runtime-v1', {
        flag: 'wx',
        mode: 0o600,
      });
      const env = Object.fromEntries(
        ['SystemRoot', 'WINDIR', 'PATH', 'LD_LIBRARY_PATH'].flatMap((key) =>
          process.env[key] === undefined ? [] : [[key, process.env[key]!]],
        ),
      );
      const child = spawn(this.options.workerPath, [], {
        cwd: this.directory,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        detached: process.platform === 'win32',
      });
      this.child = child;
      this.closedPromise = new Promise<void>((done) =>
        child.once('close', () => {
          if (this.status !== 'closing' && this.status !== 'failed')
            this.fail('WORKER_EXITED');
          if (this.heartbeat) clearInterval(this.heartbeat);
          for (const pending of this.pending.values()) {
            clearTimeout(pending.timer);
            pending.reject(new WorkerError('WORKER_EXITED'));
          }
          this.pending.clear();
          void this.cleanup().then(
            () => {
              if (this.status === 'closing') this.setState('closed');
              done();
            },
            () => {
              this.fail('CLEANUP_FAILED');
              done();
            },
          );
        }),
      );
      child.once('error', () => this.fail('WORKER_SPAWN_FAILED'));
      child.stdin.on('error', () => this.fail('IPC_WRITE_FAILED'));
      // Drain stderr without retaining or forwarding upstream text that may contain future secrets.
      child.stderr.resume();
      const decoder = new PacketDecoder();
      child.stdout.on('data', (chunk: Buffer) => {
        try {
          decoder.push(chunk, (packet) => this.receive(packet));
        } catch {
          this.fail('IPC_PROTOCOL_ERROR');
        }
      });
      child.stdout.once('end', () => {
        try {
          decoder.finish();
        } catch {
          this.fail('IPC_PROTOCOL_ERROR');
        }
      });
      const hello = await this.request(
        Kind.Hello,
        Kind.HelloAck,
        helloPayload(),
      );
      this.report = decodeBuild(hello.payload);
      this.setState('ready');
      let busy = false;
      this.heartbeat = setInterval(() => {
        if (busy || this.status !== 'ready') return;
        busy = true;
        void this.ping()
          .catch(() => this.fail('WORKER_UNRESPONSIVE'))
          .finally(() => {
            busy = false;
          });
      }, this.options.heartbeatIntervalMs);
      this.heartbeat.unref();
      return structuredClone(this.report);
    } catch (error) {
      this.fail(
        error instanceof WorkerError ? error.code : 'WORKER_START_FAILED',
      );
      if (this.closedPromise) await this.closedPromise;
      else await this.cleanup();
      throw error instanceof WorkerError
        ? error
        : new WorkerError('WORKER_START_FAILED');
    }
  }

  private receive(packet: Packet): void {
    const pending = this.pending.get(packet.requestId);
    if (!pending || packet.kind !== pending.expected)
      throw new WorkerError('IPC_UNEXPECTED_REPLY');
    clearTimeout(pending.timer);
    this.pending.delete(packet.requestId);
    pending.resolve(packet);
  }

  private request(
    kind: Kind,
    expected: Kind,
    payload: Buffer = Buffer.alloc(0),
  ): Promise<Packet> {
    const child = this.child;
    if (
      !child ||
      child.stdin.destroyed ||
      !['starting', 'ready', 'closing'].includes(this.status)
    )
      return Promise.reject(new WorkerError('INVALID_STATE'));
    if (this.pending.size >= this.options.maxPendingRequests)
      return Promise.reject(new WorkerError('IPC_QUEUE_FULL'));
    const requestId = ++this.sequence;
    const bytes = encodePacket({ kind, requestId, payload });
    if (child.stdin.writableLength + bytes.length > this.options.maxWriteBytes)
      return Promise.reject(new WorkerError('IPC_QUEUE_FULL'));
    return new Promise<Packet>((done, reject) => {
      const timer = setTimeout(
        () => {
          this.pending.delete(requestId);
          reject(new WorkerError('IPC_TIMEOUT'));
          this.fail('IPC_TIMEOUT');
        },
        kind === Kind.Hello
          ? this.options.startupTimeoutMs
          : this.options.requestTimeoutMs,
      );
      this.pending.set(requestId, { expected, resolve: done, reject, timer });
      child.stdin.write(bytes, (error) => {
        if (error) this.fail('IPC_WRITE_FAILED');
      });
    });
  }

  async ping(): Promise<void> {
    if (this.status !== 'ready') throw new WorkerError('INVALID_STATE');
    await this.request(Kind.Heartbeat, Kind.HeartbeatAck);
  }

  close(): Promise<void> {
    if (this.status === 'starting')
      return Promise.reject(new WorkerError('INVALID_STATE'));
    this.closePromise ??= this.closeInternal();
    return this.closePromise;
  }

  private async closeInternal(): Promise<void> {
    if (this.status === 'starting') throw new WorkerError('INVALID_STATE');
    if (this.status === 'created') {
      this.setState('closed');
      return;
    }
    if (this.status === 'closed') return;
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.status === 'ready') {
      this.setState('closing');
      const force = setTimeout(
        () => this.child?.kill('SIGKILL'),
        this.options.shutdownTimeoutMs,
      );
      try {
        await this.request(Kind.Shutdown, Kind.ShutdownAck);
        this.child?.stdin.end();
      } catch {
        this.child?.kill('SIGKILL');
      } finally {
        if (this.closedPromise) await this.closedPromise;
        clearTimeout(force);
      }
    } else if (this.closedPromise) await this.closedPromise;
  }

  private async cleanup(): Promise<void> {
    if (this.directory) {
      await rm(this.directory, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      });
      this.directory = undefined;
    }
  }
}

export async function probeWorkerBuild(
  options: WorkerOptions,
): Promise<WorkerBuild> {
  const worker = new WorkerProcess(options);
  try {
    return await worker.start();
  } finally {
    await worker.close();
  }
}

export interface BuildFeatureReport {
  enabledChannels: string[];
  codecProviders: string[];
  dependencies: Record<string, string>;
}

/** Build diagnostics only; compiled channels are not usable redirection claims. */
export async function probeWorkerFeatures(
  options: WorkerOptions,
): Promise<BuildFeatureReport> {
  try {
    const result = await promisify(execFile)(
      resolve(options.workerPath),
      ['--build-features'],
      {
        encoding: 'utf8',
        windowsHide: true,
        timeout: options.startupTimeoutMs ?? 10000,
        maxBuffer: 16384,
        env: Object.fromEntries(
          ['SystemRoot', 'WINDIR', 'PATH'].flatMap((key) =>
            process.env[key] === undefined ? [] : [[key, process.env[key]!]],
          ),
        ),
      },
    );
    const data: unknown = JSON.parse(result.stdout);
    if (!data || typeof data !== 'object') throw new Error();
    const candidate = data as Record<string, unknown>;
    const strings = (value: unknown): value is string[] =>
      Array.isArray(value) &&
      value.length <= 64 &&
      value.every(
        (item: unknown) => typeof item === 'string' && item.length <= 64,
      );
    if (
      !strings(candidate.enabledChannels) ||
      !strings(candidate.codecProviders) ||
      !candidate.dependencies ||
      typeof candidate.dependencies !== 'object' ||
      Array.isArray(candidate.dependencies)
    )
      throw new Error();
    const dependencies = candidate.dependencies as Record<string, unknown>;
    if (
      Object.entries(dependencies).length > 32 ||
      Object.entries(dependencies).some(
        ([key, value]) =>
          key.length > 64 || typeof value !== 'string' || value.length > 64,
      )
    )
      throw new Error();
    return {
      enabledChannels: candidate.enabledChannels,
      codecProviders: candidate.codecProviders,
      dependencies: dependencies as Record<string, string>,
    };
  } catch {
    throw new WorkerError('BUILD_FEATURE_REPORT_UNAVAILABLE');
  }
}
