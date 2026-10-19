import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
export * from './session-manager.js';
export * from './native-session.js';
export * from './pcm-delivery.js';
export * from './opus-delivery.js';
export * from './session-audio.js';
export * from './microphone-ingress.js';
export * from './microphone-ownership.js';
export * from './clipboard-ownership.js';
export * from './clipboard-transfer.js';
export * from './process-resident.js';
export * from './process-cpu.js';
import { EventEmitter } from 'node:events';
import type { Writable } from 'node:stream';
import { SeqpacketOwner, loadPacketAddon } from './seqpacket-owner.js';
import { selectWorkerIpc, type WorkerIpcTransport } from './ipc-selection.js';
import { PcmSource } from './pcm-source.js';
import { OpusSource } from './opus-source.js';
import { workerResidentBytes, ProcessSampleError } from './process-resident.js';
import { workerCpuMicros } from './process-cpu.js';
import { CpuWindow } from './cpu-window.js';
import {
  windowsProcessResources,
  type ProcessResources,
} from './process-resources.js';
export type { PcmSourceEvent } from './pcm-source.js';
export type { OpusSourceEvent } from './opus-source.js';
import { mkdir, mkdtemp, rm, writeFile, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  Kind,
  PacketDecoder,
  decodeBuild,
  encodePacket,
  helloPayload,
  encodeConnectionSettings,
  decodeConnectionState,
  decodeCertificatePrompt,
  encodeCertificateDecision,
  decodeCapturedFrame,
  decodeAvcFrame,
  encodeInput,
  encodeInputText,
  decodePipelineStats,
  decodeCursorUpdate,
  decodeDisplayState,
  decodeTouchState,
  encodeTouchRequest,
  type TouchState,
  type TouchInput,
  encodeDisplayResize,
  decodeDisplayResizeResult,
  encodeAudioReset,
  decodeAudioResetResult,
  decodeMicrophoneState,
  validateMicrophoneStateProgress,
  encodeMicrophonePcm,
  encodeMicrophoneOpus,
  decodeMicrophoneResult,
  encodeMicrophoneReset,
  decodeMicrophoneResetResult,
  decodeClipboardState,
  decodeClipboardResult,
  encodeClipboardCommand,
  validateClipboardText,
  type ClipboardState,
  type ClipboardOperation,
  type ClipboardStatus,
  type ConnectionSettings,
  type MicrophoneResetResult,
  type MicrophoneState,
  type MicrophonePcmPacket,
  type MicrophoneOpusPacket,
  type MicrophoneResult,
  type AudioResetResult,
  type DisplayState,
  type DisplayResizeResult,
  type CursorState,
  type PipelineStats,
  type InputEvent,
  type CaptureOptions,
  type CapturedFrame,
  type CertificatePrompt,
  type Packet,
  type WorkerBuild,
} from '@freerdp-bridge/protocol';
export {
  validateSessionConfig,
  SessionCreateSchema,
  redactSecrets,
  type SessionCreate,
} from '@freerdp-bridge/config';
import {
  validateSessionConfig,
  resolveVideoQuality,
  resolveRdpPerformance,
  RDP_PERFORMANCE_FIELDS,
  type SessionCreate,
} from '@freerdp-bridge/config';
export type {
  SessionState,
  BridgeFailure,
  DeviceCapability,
  WorkerBuild,
  AudioResetResult,
  MicrophoneState,
  MicrophonePcmPacket,
  MicrophoneOpusPacket,
  MicrophoneResult,
  MicrophoneResetResult,
  ClipboardState,
  ClipboardStatus,
} from '@freerdp-bridge/protocol';

type ClipboardSelection = NonNullable<ConnectionSettings['clipboard']>;
export interface ClipboardReadResult {
  status: ClipboardStatus;
  text: Buffer;
}

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
  ipcTransport?: WorkerIpcTransport;
  /** Trusted host sampled RSS policy; omitted means no resident watchdog. */
  maxResidentBytes?: number;
  /** 100..60,000 ms; requires maxResidentBytes, default 1,000 ms. */
  residentPollIntervalMs?: number;
  /** Trusted host sampled CPU limit: 100% is one logical CPU. */
  maxCpuPercent?: number;
  /** 100..60,000 ms; requires maxCpuPercent, default 1,000 ms. */
  cpuPollIntervalMs?: number;
  /** 1,000..60,000 ms minimum rate window; requires maxCpuPercent. */
  cpuWindowMs?: number;
}

type Status =
  | 'created'
  | 'starting'
  | 'ready'
  | 'closing'
  | 'closed'
  | 'failed';
type DirectoryHelperResult = {
  stdout: string;
  stderr: string;
  code: number | null;
};
function directoryReceipt(result: DirectoryHelperResult) {
  if (
    typeof result.stdout !== 'string' ||
    result.stdout.length > 128 ||
    Buffer.byteLength(result.stdout) > 128
  )
    return undefined;
  try {
    const value: unknown = JSON.parse(result.stdout);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return undefined;
    const record = value as Record<string, unknown>;
    if (
      Object.keys(record).sort().join(',') !== 'created,error,v' ||
      record.v !== 1 ||
      typeof record.created !== 'boolean' ||
      !Number.isSafeInteger(record.error) ||
      (record.error as number) < 0 ||
      (record.error as number) > 0xffffffff ||
      (record.created ? record.error !== 0 : record.error === 0)
    )
      return undefined;
    return { created: record.created, error: record.error as number };
  } catch {
    return undefined;
  }
}
type Pending = {
  expected: Kind;
  resolve: (packet: Packet) => void;
  reject: (error: WorkerError) => void;
  timer: NodeJS.Timeout;
};
type ResidentProbe = {
  abort: AbortController;
  completion: Promise<void>;
};
type CombinedQuery = {
  pid: number;
  abort: AbortController;
  listeners: Map<AbortSignal, () => void>;
  completion: Promise<ProcessResources>;
};

/** Owns exactly one native lifecycle process; readiness does not imply an RDP connection. */
export class WorkerProcess extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | undefined;
  private directory: string | undefined;
  private pending = new Map<bigint, Pending>();
  private sequence = 0n;
  private heartbeat: NodeJS.Timeout | undefined;
  private residentTimer: NodeJS.Timeout | undefined;
  private residentProbe: ResidentProbe | undefined;
  private residentRetirementFailed = false;
  private cpuTimer: NodeJS.Timeout | undefined;
  private cpuProbe: ResidentProbe | undefined;
  private cpuWindow: CpuWindow | undefined;
  private cpuRetirementFailed = false;
  private combinedQuery: CombinedQuery | undefined;
  private readonly cpuQueryBrackets = new WeakMap<
    AbortSignal,
    Pick<ProcessResources, 'startedNs' | 'completedNs'>
  >();
  private closedPromise: Promise<void> | undefined;
  private closePromise: Promise<void> | undefined;
  private startCompletion: Promise<void> | undefined;
  private status: Status = 'created';
  private report: WorkerBuild | undefined;
  private connectionRequested = false;
  private certificatePrompt: CertificatePrompt | undefined;
  private cursorState: CursorState | undefined;
  private displayState: DisplayState | undefined;
  private resizing = false;
  private resizeRequest:
    | { width: number; height: number; generation: bigint }
    | undefined;
  private dynamicResolution = false;
  private touchEnabled = false;
  private touchState: TouchState | undefined;
  private audioSource: PcmSource | OpusSource | undefined;
  private audioCodec: 'pcm' | 'opus' | undefined;
  private audioResetting = false;
  private scheduledAudioEpoch: bigint | undefined;
  private microphoneEnabled = false;
  private microphoneCodec: 'pcm' | 'opus' | undefined;
  private microphoneStatus: MicrophoneState | undefined;
  private microphoneSending = false;
  private microphoneResetting = false;
  private scheduledMicrophoneEpoch: bigint | undefined;
  private rdpConnected = false;
  private clipboardProfile: ClipboardSelection | undefined;
  private clipboardStatus: ClipboardState | undefined;
  private clipboardTerminal = false;
  private clipboardRequest:
    | { operation: ClipboardOperation; generation: bigint; revision: bigint }
    | undefined;
  private clipboardLate:
    | {
        id: bigint;
        operation: ClipboardOperation;
        generation: bigint;
        revision: bigint;
      }
    | undefined;
  private capturing = false;
  private readonly options: Required<WorkerOptions>;
  private packetOwner: SeqpacketOwner | undefined;
  private ipcInput: Writable | SeqpacketOwner | undefined;
  private retirementFailed = false;

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
      ipcTransport: options.ipcTransport ?? 'auto',
      maxResidentBytes: options.maxResidentBytes ?? 0,
      residentPollIntervalMs: options.residentPollIntervalMs ?? 1000,
      maxCpuPercent: options.maxCpuPercent ?? 0,
      cpuPollIntervalMs: options.cpuPollIntervalMs ?? 1000,
      cpuWindowMs: options.cpuWindowMs ?? 1000,
    };
    if (
      (options.maxResidentBytes !== undefined &&
        (!Number.isSafeInteger(options.maxResidentBytes) ||
          options.maxResidentBytes < 1)) ||
      (options.residentPollIntervalMs !== undefined &&
        (options.maxResidentBytes === undefined ||
          !Number.isSafeInteger(options.residentPollIntervalMs) ||
          options.residentPollIntervalMs < 100 ||
          options.residentPollIntervalMs > 60000))
    )
      throw new WorkerError('INVALID_OPTIONS');
    if (
      (options.maxCpuPercent !== undefined &&
        (!Number.isSafeInteger(options.maxCpuPercent) ||
          options.maxCpuPercent < 1 ||
          options.maxCpuPercent > 65535)) ||
      (options.cpuPollIntervalMs !== undefined &&
        (options.maxCpuPercent === undefined ||
          !Number.isSafeInteger(options.cpuPollIntervalMs) ||
          options.cpuPollIntervalMs < 100 ||
          options.cpuPollIntervalMs > 60000)) ||
      (options.cpuWindowMs !== undefined &&
        (options.maxCpuPercent === undefined ||
          !Number.isSafeInteger(options.cpuWindowMs) ||
          options.cpuWindowMs < 1000 ||
          options.cpuWindowMs > 60000))
    )
      throw new WorkerError('INVALID_OPTIONS');
    if (
      options.maxCpuPercent !== undefined &&
      !['win32', 'linux'].includes(process.platform)
    )
      throw new WorkerError('RESOURCE_WATCHDOG_UNSUPPORTED');
    if (
      options.maxResidentBytes !== undefined &&
      !['win32', 'linux'].includes(process.platform)
    )
      throw new WorkerError('RESOURCE_WATCHDOG_UNSUPPORTED');
    if (
      !['auto', 'framed-pipes', 'unix-seqpacket-rws1'].includes(
        this.options.ipcTransport,
      ) ||
      (this.options.ipcTransport === 'unix-seqpacket-rws1' &&
        process.platform !== 'linux')
    )
      throw new WorkerError('IPC_TRANSPORT_UNSUPPORTED');
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

  /** Latest private source status; this does not establish browser/audible support. */
  get audioState() {
    return this.audioSource?.current;
  }

  /** Private input authority; it does not grant permission to capture a device. */
  get microphoneState(): MicrophoneState | undefined {
    return this.microphoneStatus ? { ...this.microphoneStatus } : undefined;
  }

  private setState(state: Status): void {
    if (state !== 'ready') this.clipboardStatus = undefined;
    this.status = state;
    this.emit('state', state);
  }
  private fail(code: string): void {
    if (this.status === 'closed' || this.status === 'failed') return;
    this.setState('failed');
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = undefined;
    this.stopResidentWatchdog();
    this.stopCpuWatchdog();
    const error = new WorkerError(code);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.packetOwner?.destroy();
    this.child?.kill('SIGKILL');
    this.emit('failure', error);
  }

  /** Trusted sampling seam; ordinary use reads only this owned child's RSS. */
  protected sampleResidentBytes(
    pid: number,
    signal: AbortSignal,
  ): Promise<number> {
    if (this.combinedPolicy())
      return this.combinedResources(pid, signal).then((value) => {
        if (signal.aborted)
          throw new ProcessSampleError('PROCESS_SAMPLE_CANCELLED');
        return value.bytes;
      });
    return workerResidentBytes(pid, this.options.workerPath, signal);
  }

  private combinedPolicy(): boolean {
    return (
      process.platform === 'win32' &&
      this.options.maxCpuPercent > 0 &&
      this.options.maxResidentBytes > 0 &&
      this.options.cpuPollIntervalMs === this.options.residentPollIntervalMs
    );
  }

  /** One joined Windows query for simultaneous CPU/RSS policies. */
  protected sampleResourceUsage(
    pid: number,
    signal: AbortSignal,
  ): Promise<ProcessResources> {
    return windowsProcessResources(pid, this.options.workerPath, signal);
  }

  private combinedResources(
    pid: number,
    signal: AbortSignal,
  ): Promise<ProcessResources> {
    if (signal.aborted)
      return Promise.reject(new ProcessSampleError('PROCESS_SAMPLE_CANCELLED'));
    let query = this.combinedQuery;
    if (!query) {
      const abort = new AbortController();
      const listeners = new Map<AbortSignal, () => void>();
      const entry: CombinedQuery = {
        pid,
        abort,
        listeners,
        completion: Promise.resolve()
          .then(() => this.sampleResourceUsage(pid, abort.signal))
          .finally(() => {
            for (const [owner, listener] of listeners)
              owner.removeEventListener('abort', listener);
            listeners.clear();
            if (this.combinedQuery === entry) this.combinedQuery = undefined;
          }),
      };
      this.combinedQuery = query = entry;
    }
    if (
      query.pid !== pid ||
      (query.listeners.size >= 2 && !query.listeners.has(signal))
    )
      return Promise.reject(
        new ProcessSampleError('PROCESS_SAMPLE_UNAVAILABLE'),
      );
    if (!query.listeners.has(signal)) {
      const abort = () => query.abort.abort();
      query.listeners.set(signal, abort);
      signal.addEventListener('abort', abort, { once: true });
    }
    return query.completion;
  }

  private stopResidentWatchdog(): void {
    if (this.residentTimer) clearInterval(this.residentTimer);
    this.residentTimer = undefined;
    this.residentProbe?.abort.abort();
  }

  private startResidentWatchdog(): void {
    if (!this.options.maxResidentBytes) return;
    this.residentTimer = setInterval(() => {
      this.checkResidentMemory();
      if (this.combinedPolicy()) this.checkCpuTime();
    }, this.options.residentPollIntervalMs);
    this.residentTimer.unref();
  }

  private checkResidentMemory(): void {
    if (this.status !== 'ready' || this.residentProbe) return;
    const child = this.child;
    const pid = child?.pid;
    if (!child || !Number.isInteger(pid) || !pid) {
      this.fail('WORKER_RESOURCE_UNAVAILABLE');
      return;
    }
    const current = () => this.status === 'ready' && this.child === child;
    let complete!: () => void;
    const probe: ResidentProbe = {
      abort: new AbortController(),
      completion: new Promise<void>((done) => {
        complete = done;
      }),
    };
    this.residentProbe = probe;
    const deadline = setTimeout(() => {
      probe.abort.abort();
      if (current()) this.fail('WORKER_RESOURCE_UNAVAILABLE');
    }, 3000);
    deadline.unref();
    void Promise.resolve()
      .then(() => {
        if (!current() || probe.abort.signal.aborted)
          throw new ProcessSampleError('PROCESS_SAMPLE_CANCELLED');
        return this.sampleResidentBytes(pid, probe.abort.signal);
      })
      .then((bytes) => {
        if (!current()) return;
        if (!Number.isSafeInteger(bytes) || bytes < 1)
          this.fail('WORKER_RESOURCE_UNAVAILABLE');
        else if (bytes > this.options.maxResidentBytes)
          this.fail('WORKER_MEMORY_LIMIT');
      })
      .catch((error: unknown) => {
        if (
          !(error instanceof ProcessSampleError) ||
          error.code === 'PROCESS_SAMPLE_CLOSE_FAILED'
        )
          this.residentRetirementFailed = true;
        if (current()) this.fail('WORKER_RESOURCE_UNAVAILABLE');
      })
      .finally(() => {
        clearTimeout(deadline);
        if (this.residentProbe === probe) this.residentProbe = undefined;
        complete();
      });
  }

  /** Trusted sampling seam; ordinary use queries this owned child. */
  protected sampleCpuMicros(pid: number, signal: AbortSignal): Promise<number> {
    if (this.combinedPolicy())
      return this.combinedResources(pid, signal).then((value) => {
        if (signal.aborted)
          throw new ProcessSampleError('PROCESS_SAMPLE_CANCELLED');
        this.cpuQueryBrackets.set(signal, {
          startedNs: value.startedNs,
          completedNs: value.completedNs,
        });
        return value.micros;
      });
    return workerCpuMicros(pid, this.options.workerPath, signal);
  }

  private stopCpuWatchdog(): void {
    if (this.cpuTimer) clearInterval(this.cpuTimer);
    this.cpuTimer = undefined;
    this.cpuWindow = undefined;
    this.cpuProbe?.abort.abort();
  }

  private startCpuWatchdog(): void {
    if (!this.options.maxCpuPercent) return;
    this.cpuWindow = new CpuWindow(
      this.options.maxCpuPercent,
      this.options.cpuWindowMs,
    );
    if (this.combinedPolicy()) return;
    this.cpuTimer = setInterval(
      () => this.checkCpuTime(),
      this.options.cpuPollIntervalMs,
    );
    this.cpuTimer.unref();
  }

  private checkCpuTime(): void {
    if (this.status !== 'ready' || this.cpuProbe) return;
    const child = this.child;
    const pid = child?.pid;
    const window = this.cpuWindow;
    if (!child || !Number.isInteger(pid) || !pid || !window) {
      this.fail('WORKER_RESOURCE_UNAVAILABLE');
      return;
    }
    const current = () => this.status === 'ready' && this.child === child;
    let complete!: () => void;
    const probe: ResidentProbe = {
      abort: new AbortController(),
      completion: new Promise<void>((done) => {
        complete = done;
      }),
    };
    this.cpuProbe = probe;
    const deadline = setTimeout(() => {
      probe.abort.abort();
      if (current()) this.fail('WORKER_RESOURCE_UNAVAILABLE');
    }, 3000);
    deadline.unref();
    let startedNs: bigint;
    void Promise.resolve()
      .then(() => {
        if (!current() || probe.abort.signal.aborted)
          throw new ProcessSampleError('PROCESS_SAMPLE_CANCELLED');
        startedNs = process.hrtime.bigint();
        return this.sampleCpuMicros(pid, probe.abort.signal);
      })
      .then((micros) => {
        if (!current()) return;
        const bracket = this.cpuQueryBrackets.get(probe.abort.signal);
        if (
          window.observe(
            micros,
            bracket?.startedNs ?? startedNs,
            bracket?.completedNs ?? process.hrtime.bigint(),
          )
        )
          this.fail('WORKER_CPU_LIMIT');
      })
      .catch((error: unknown) => {
        if (
          !(error instanceof ProcessSampleError) ||
          error.code === 'PROCESS_SAMPLE_CLOSE_FAILED'
        )
          this.cpuRetirementFailed = true;
        if (current()) this.fail('WORKER_RESOURCE_UNAVAILABLE');
      })
      .finally(() => {
        clearTimeout(deadline);
        this.cpuQueryBrackets.delete(probe.abort.signal);
        if (this.cpuProbe === probe) this.cpuProbe = undefined;
        complete();
      });
  }

  private requireStarting(): void {
    if (this.status !== 'starting') throw new WorkerError('WORKER_TERMINATED');
  }

  /** Process seam for explicit synthetic peers; the native default takes no argv. */
  protected spawnWorker(
    directory: string,
    env: Record<string, string>,
  ): ChildProcessWithoutNullStreams {
    return spawn(
      this.options.workerPath,
      this.packetOwner ? ['--ipc-seqpacket-fd=3'] : [],
      {
        cwd: directory,
        env,
        stdio: this.packetOwner
          ? ['pipe', 'pipe', 'pipe', this.packetOwner.childFd()]
          : ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        detached: process.platform === 'win32',
      },
    ) as ChildProcessWithoutNullStreams;
  }
  /** Private transport factory seam; failure joins native descriptor ownership. */
  protected async createPacketOwner(): Promise<SeqpacketOwner> {
    return SeqpacketOwner.open(
      loadPacketAddon(
        join(dirname(await realpath(this.options.workerPath)), 'rdp-ipc.node'),
      ),
      {
        maxRecords: this.options.maxPendingRequests,
        maxBytes: this.options.maxWriteBytes,
      },
    );
  }

  /** Trusted colocated helper only; normal cancellation waits for its ownership receipt. */
  protected async createWindowsRuntimeDirectory(
    directory: string,
  ): Promise<DirectoryHelperResult> {
    try {
      const result = await promisify(execFile)(
        join(dirname(this.options.workerPath), 'rdp-runtime-directory.exe'),
        ['--create-private-directory', directory],
        {
          windowsHide: true,
          // Process launch may exceed five seconds on managed Windows hosts.
          // Respect startup policy within a separate finite 5..15 second budget.
          timeout: Math.min(
            15000,
            Math.max(5000, this.options.startupTimeoutMs),
          ),
          maxBuffer: 128,
          encoding: 'utf8',
          env: {
            SystemRoot: process.env.SystemRoot,
            WINDIR: process.env.WINDIR,
            PATH: '',
          },
        },
      );
      return { ...result, code: 0 };
    } catch (error) {
      if (error && typeof error === 'object') {
        const value = error as {
          code?: unknown;
          stdout?: unknown;
          stderr?: unknown;
        };
        if (value.code === 'ENOENT')
          throw new WorkerError('RUNTIME_DIRECTORY_UNAVAILABLE');
        return {
          code: typeof value.code === 'number' ? value.code : null,
          stdout: typeof value.stdout === 'string' ? value.stdout : '',
          stderr: typeof value.stderr === 'string' ? value.stderr : '',
        };
      }
      return { code: null, stdout: '', stderr: '' };
    }
  }

  private async prepareRuntimeDirectory(): Promise<void> {
    await mkdir(this.options.runtimeRoot, { recursive: true, mode: 0o700 });
    this.requireStarting();
    if (process.platform !== 'win32') {
      this.directory = await mkdtemp(join(this.options.runtimeRoot, 'worker-'));
      return;
    }
    const candidate = join(
      this.options.runtimeRoot,
      'worker-' + randomBytes(16).toString('hex'),
    );
    const result = await this.createWindowsRuntimeDirectory(candidate);
    const receipt = directoryReceipt(result);
    // A valid creation receipt proves ownership even if exit/output subsequently faults.
    // A collision or uncertain result never authorizes deleting the candidate.
    if (receipt?.created) this.directory = candidate;
    if (!receipt) throw new WorkerError('RUNTIME_DIRECTORY_UNCERTAIN');
    if (!receipt.created) throw new WorkerError('RUNTIME_DIRECTORY_REFUSED');
    if (result.code !== 0 || result.stderr !== '')
      throw new WorkerError('RUNTIME_DIRECTORY_FAILED');
  }

  async start(): Promise<WorkerBuild> {
    if (this.status !== 'created') throw new WorkerError('INVALID_STATE');
    let settled!: () => void;
    this.startCompletion = new Promise<void>((done) => {
      settled = done;
    });
    try {
      this.setState('starting');
      await this.prepareRuntimeDirectory();
      this.requireStarting();
      if (!this.directory) throw new WorkerError('RUNTIME_DIRECTORY_UNCERTAIN');
      await writeFile(join(this.directory, '.rdp-worker-owned'), 'runtime-v1', {
        flag: 'wx',
        mode: 0o600,
      });
      this.requireStarting();
      const transport = await selectWorkerIpc(
        this.options.workerPath,
        this.options.ipcTransport,
      );
      this.requireStarting();
      if (transport === 'unix-seqpacket-rws1') {
        this.packetOwner = await this.createPacketOwner();
        this.packetOwner.on('error', () => this.fail('IPC_TRANSPORT_FAILED'));
        this.requireStarting();
      }
      const env = Object.fromEntries(
        [
          'SystemRoot',
          'WINDIR',
          'PATH',
          'LD_LIBRARY_PATH',
          ...(process.platform === 'linux' ? ['HOME'] : []),
        ].flatMap((key) =>
          process.env[key] === undefined ? [] : [[key, process.env[key]!]],
        ),
      );
      // Pinned Linux FreeRDP needs the existing HOME during settings creation.
      // Connection then selects private paths through the public settings API.
      const child = this.spawnWorker(this.directory, env);
      this.child = child;
      const input = this.packetOwner ?? child.stdin;
      const output = this.packetOwner ?? child.stdout;
      this.ipcInput = input;
      if (this.packetOwner) child.stdout.resume();
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
      this.packetOwner?.closeChild();
      input.on('error', () => this.fail('IPC_WRITE_FAILED'));
      if (this.packetOwner)
        child.stdin.on('error', () => this.fail('IPC_WRITE_FAILED'));
      // Drain stderr without retaining or forwarding upstream text that may contain future secrets.
      child.stderr.resume();
      const decoder = new PacketDecoder();
      output.on('data', (chunk: Buffer) => {
        try {
          decoder.push(chunk, (packet) => this.receive(packet));
        } catch {
          this.fail('IPC_PROTOCOL_ERROR');
        }
      });
      output.once('end', () => {
        try {
          decoder.finish();
        } catch {
          this.fail('IPC_PROTOCOL_ERROR');
        }
      });
      this.packetOwner?.resume();
      const hello = await this.request(
        Kind.Hello,
        Kind.HelloAck,
        helloPayload(),
      );
      this.requireStarting();
      this.report = decodeBuild(hello.payload);
      if (this.packetOwner && this.report.transport !== 'unix-seqpacket-rws1')
        throw new WorkerError('IPC_TRANSPORT_MISMATCH');
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
      this.startResidentWatchdog();
      this.startCpuWatchdog();
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
    } finally {
      settled();
    }
  }

  private receive(packet: Packet): void {
    if (packet.kind === Kind.ClipboardState) {
      const profile = this.clipboardProfile;
      if (
        packet.requestId !== 0n ||
        !profile ||
        !this.connectionRequested ||
        !this.report?.capabilities.clipboardText ||
        !['ready', 'closing'].includes(this.status)
      )
        throw new WorkerError('IPC_UNEXPECTED_EVENT');
      const next = decodeClipboardState(packet.payload);
      if (
        next.maximum !== profile.maximum ||
        next.toServer !== profile.toServer ||
        next.fromServer !== profile.fromServer
      )
        throw new WorkerError('IPC_UNEXPECTED_EVENT');
      // Control has priority over queued source state. Terminal lifecycle cannot
      // be undone by a ready state that was already accepted for writing.
      if (this.clipboardTerminal || this.status === 'closing') return;
      const old = this.clipboardStatus;
      if (
        (next.ready && !this.rdpConnected) ||
        (old &&
          (next.generation !== old.generation || next.revision < old.revision))
      )
        throw new WorkerError('IPC_UNEXPECTED_EVENT');
      this.clipboardStatus = next;
      if (old?.ready && !next.ready) this.retireClipboard();
      this.emit('clipboard', Object.freeze({ ...next }));
      return;
    }
    if (
      packet.kind === Kind.ClipboardResult &&
      this.clipboardLate?.id === packet.requestId
    ) {
      try {
        const result = decodeClipboardResult(packet.payload),
          late = this.clipboardLate;
        if (
          result.operation !== late.operation ||
          result.generation !== late.generation ||
          result.revision !== late.revision
        )
          throw new WorkerError('IPC_UNEXPECTED_REPLY');
        this.clipboardLate = undefined;
      } finally {
        packet.payload.fill(0);
      }
      return;
    }
    if (packet.kind === Kind.MicrophoneState) {
      if (
        packet.requestId !== 0n ||
        !this.connectionRequested ||
        !['ready', 'closing'].includes(this.status) ||
        !this.microphoneEnabled ||
        !(this.microphoneCodec === 'opus'
          ? this.report?.capabilities.opusInput
          : this.report?.capabilities.pcmInput)
      )
        throw new WorkerError('IPC_UNEXPECTED_EVENT');
      const state = decodeMicrophoneState(packet.payload);
      validateMicrophoneStateProgress(this.microphoneStatus, state);
      if (
        !state.enabled ||
        (this.status === 'ready' &&
          !this.rdpConnected &&
          state.availability === 'ready')
      )
        throw new WorkerError('IPC_UNEXPECTED_EVENT');
      this.microphoneStatus = state;
      if (this.status === 'ready')
        this.emit('microphone', Object.freeze({ ...state }));
      return;
    }
    if (
      packet.requestId === 0n &&
      this.connectionRequested &&
      ['ready', 'closing'].includes(this.status) &&
      [
        Kind.AudioState,
        Kind.AudioConfig,
        Kind.AudioPcm,
        Kind.AudioOpus,
      ].includes(packet.kind)
    ) {
      if (
        !this.audioSource ||
        !this.audioCodec ||
        !this.report?.capabilities[
          this.audioCodec === 'opus' ? 'opusOutput' : 'pcmOutput'
        ]
      )
        throw new WorkerError('IPC_UNEXPECTED_EVENT');
      const event = this.audioSource.accept(packet.kind, packet.payload);
      if (this.status === 'ready') {
        if (
          !this.rdpConnected &&
          (event.type !== 'state' || event.state.availability === 'ready')
        )
          throw new WorkerError('IPC_UNEXPECTED_EVENT');
        this.emit('audio', event);
      }
      return;
    }
    if (
      packet.requestId === 0n &&
      this.connectionRequested &&
      this.status === 'closing'
    ) {
      if (packet.kind === Kind.State) {
        decodeConnectionState(packet.payload);
        return;
      }
      if (packet.kind === Kind.Certificate) {
        decodeCertificatePrompt(packet.payload);
        return;
      }
      if (packet.kind === Kind.CursorUpdate) {
        decodeCursorUpdate(packet.payload);
        return;
      }
      if (packet.kind === Kind.DisplayUpdate) {
        decodeDisplayState(packet.payload);
        return;
      }
      if (packet.kind === Kind.TouchUpdate) {
        decodeTouchState(packet.payload);
        return;
      }
    }
    if (
      packet.requestId === 0n &&
      this.connectionRequested &&
      this.status === 'ready'
    ) {
      if (packet.kind === Kind.State) {
        const value = decodeConnectionState(packet.payload);
        this.rdpConnected = value.state === 'connected';
        if (['failed', 'closed'].includes(value.state)) this.retireClipboard();
        if (['failed', 'closed'].includes(value.state))
          this.displayState = undefined;
        if (['failed', 'closed'].includes(value.state))
          this.touchState = undefined;
        if (value.state !== 'awaiting-user') this.certificatePrompt = undefined;
        this.emit('rdp-state', value);
        return;
      }
      if (packet.kind === Kind.Certificate) {
        if (this.certificatePrompt)
          throw new WorkerError('IPC_UNEXPECTED_EVENT');
        this.certificatePrompt = decodeCertificatePrompt(packet.payload);
        this.emit('certificate', structuredClone(this.certificatePrompt));
        return;
      }
      if (
        packet.kind === Kind.DisplayUpdate &&
        this.report?.capabilities.displayControl &&
        this.rdpConnected
      ) {
        const update = decodeDisplayState(packet.payload);
        if (update.dynamicResolution !== this.dynamicResolution)
          throw new WorkerError('IPC_UNEXPECTED_EVENT');
        const previous = this.displayState;
        if (
          previous &&
          (update.generation < previous.generation ||
            update.dynamicResolution !== previous.dynamicResolution ||
            (update.generation === previous.generation
              ? update.width !== previous.width ||
                update.height !== previous.height ||
                update.framebufferRevision !== previous.framebufferRevision
              : update.framebufferRevision <= previous.framebufferRevision))
        )
          throw new WorkerError('IPC_UNEXPECTED_EVENT');
        this.displayState = update;
        this.emit('display', { ...update });
        return;
      }
      if (
        packet.kind === Kind.TouchUpdate &&
        this.report?.capabilities.touchInput &&
        this.rdpConnected
      ) {
        const update = decodeTouchState(packet.payload);
        const previous = this.touchState;
        if (
          update.enabled !== this.touchEnabled ||
          (previous &&
            (update.revision <= previous.revision ||
              update.generation < previous.generation ||
              (update.generation === previous.generation &&
                (update.width !== previous.width ||
                  update.height !== previous.height))))
        )
          throw new WorkerError('IPC_UNEXPECTED_EVENT');
        this.touchState = update;
        this.emit('touch', { ...update });
        return;
      }
      if (
        packet.kind === Kind.CursorUpdate &&
        this.report?.capabilities.cursor
      ) {
        const update = decodeCursorUpdate(packet.payload);
        if (this.cursorState && update.revision <= this.cursorState.revision)
          throw new WorkerError('IPC_UNEXPECTED_EVENT');
        if (!update.default && !update.rgba) {
          const old = this.cursorState;
          if (
            !old ||
            !old.rgba ||
            old.shapeId !== update.shapeId ||
            old.width !== update.width ||
            old.height !== update.height ||
            old.hotX !== update.hotX ||
            old.hotY !== update.hotY
          )
            throw new WorkerError('IPC_UNEXPECTED_EVENT');
          update.rgba = old.rgba;
        }
        this.cursorState = update;
        this.emit('cursor', update);
        return;
      }
    }
    const pending = this.pending.get(packet.requestId);
    if (pending?.expected === Kind.InputAck && packet.kind === Kind.Error) {
      const code = packet.payload.readUInt32BE(0);
      if (![5, 6, 8, 9, 10, 11].includes(code))
        throw new WorkerError('IPC_UNEXPECTED_REPLY');
      clearTimeout(pending.timer);
      this.pending.delete(packet.requestId);
      pending.reject(
        new WorkerError(
          code === 5
            ? 'INPUT_NOT_CONNECTED'
            : code === 6
              ? 'INPUT_QUEUE_FULL'
              : code === 8
                ? 'INPUT_DISPLAY_TRANSITION'
                : code === 10
                  ? 'TOUCH_UNAVAILABLE'
                  : code === 11
                    ? 'TOUCH_INVALID_TRANSITION'
                    : 'INPUT_NOT_IMPLEMENTED',
        ),
      );
      return;
    }
    if (
      pending &&
      [Kind.Frame, Kind.FrameAvc].includes(pending.expected) &&
      packet.kind === Kind.Error
    ) {
      clearTimeout(pending.timer);
      this.pending.delete(packet.requestId);
      const code = packet.payload.readUInt32BE(0);
      if (code !== 4 && code !== 5)
        throw new WorkerError('IPC_UNEXPECTED_REPLY');
      pending.reject(
        new WorkerError(
          code === 5 ? 'MEDIA_NOT_CONNECTED' : 'MEDIA_ENCODE_FAILED',
        ),
      );
      return;
    }
    if (!pending || packet.kind !== pending.expected) {
      if (packet.kind === Kind.ClipboardResult) packet.payload.fill(0);
      throw new WorkerError('IPC_UNEXPECTED_REPLY');
    }
    if (packet.kind === Kind.ClipboardResult) {
      try {
        decodeClipboardResult(packet.payload);
      } catch (error) {
        packet.payload.fill(0);
        throw error;
      }
    }
    if (packet.kind === Kind.Frame) decodeCapturedFrame(packet.payload);
    if (packet.kind === Kind.FrameAvc) decodeAvcFrame(packet.payload);
    if (packet.kind === Kind.PipelineStatsAck)
      decodePipelineStats(packet.payload);
    if (packet.kind === Kind.AudioResetResult)
      decodeAudioResetResult(packet.payload);
    if (packet.kind === Kind.MicrophoneResult)
      decodeMicrophoneResult(packet.payload);
    if (packet.kind === Kind.MicrophoneResetResult)
      decodeMicrophoneResetResult(packet.payload);
    if (packet.kind === Kind.DisplayResizeResult) {
      const result = decodeDisplayResizeResult(packet.payload);
      if (result === 'applied' || result === 'unchanged') {
        const expected = this.resizeRequest;
        const actual = this.displayState;
        if (
          !expected ||
          !actual ||
          actual.width !== expected.width ||
          actual.height !== expected.height ||
          (result === 'applied' && actual.generation <= expected.generation)
        )
          throw new WorkerError('IPC_UNEXPECTED_REPLY');
      }
    }
    clearTimeout(pending.timer);
    this.pending.delete(packet.requestId);
    pending.resolve(packet);
  }

  private request(
    kind: Kind,
    expected: Kind,
    payload: Buffer = Buffer.alloc(0),
    timeoutMs = this.options.requestTimeoutMs,
  ): Promise<Packet> {
    const child = this.child;
    const input = this.ipcInput;
    if (
      !child ||
      !input ||
      input.destroyed ||
      !['starting', 'ready', 'closing'].includes(this.status)
    )
      return Promise.reject(new WorkerError('INVALID_STATE'));
    if (this.pending.size >= this.options.maxPendingRequests)
      return Promise.reject(new WorkerError('IPC_QUEUE_FULL'));
    const requestId = ++this.sequence;
    const bytes = encodePacket({ kind, requestId, payload });
    if (input.writableLength + bytes.length > this.options.maxWriteBytes) {
      if (kind === Kind.ClipboardCommand) bytes.fill(0);
      return Promise.reject(new WorkerError('IPC_QUEUE_FULL'));
    }
    return new Promise<Packet>((done, reject) => {
      const timer = setTimeout(
        () => {
          this.pending.delete(requestId);
          reject(new WorkerError('IPC_TIMEOUT'));
          this.fail('IPC_TIMEOUT');
        },
        kind === Kind.Hello ? this.options.startupTimeoutMs : timeoutMs,
      );
      this.pending.set(requestId, { expected, resolve: done, reject, timer });
      input.write(bytes, (error: Error | null | undefined) => {
        if (
          kind === Kind.Secret ||
          kind === Kind.InputText ||
          kind === Kind.MicrophonePcm ||
          kind === Kind.MicrophoneOpus ||
          kind === Kind.ClipboardCommand
        )
          bytes.fill(0);
        if (error) this.fail('IPC_WRITE_FAILED');
      });
    });
  }

  async ping(): Promise<void> {
    if (this.status !== 'ready') throw new WorkerError('INVALID_STATE');
    await this.request(Kind.Heartbeat, Kind.HeartbeatAck);
  }

  /** Copied scalar authority only; this does not read an OS clipboard. */
  get clipboardState(): ClipboardState | undefined {
    return this.clipboardStatus ? { ...this.clipboardStatus } : undefined;
  }
  private retireClipboard(): void {
    this.clipboardTerminal = true;
    this.clipboardStatus = undefined;
    for (const [id, pending] of this.pending) {
      if (pending.expected !== Kind.ClipboardResult) continue;
      if (this.clipboardRequest)
        this.clipboardLate = { id, ...this.clipboardRequest };
      clearTimeout(pending.timer);
      this.pending.delete(id);
      pending.reject(new WorkerError('RDP_DISCONNECTED'));
    }
  }
  /** Explicit current-offer read; no polling, automatic retry or host clipboard. */
  readClipboardText(revision: bigint): Promise<ClipboardReadResult> {
    return this.clipboardTransfer('read', revision, Buffer.alloc(0));
  }
  async writeClipboardText(text: Buffer): Promise<ClipboardStatus> {
    return (await this.clipboardTransfer('set', 0n, text)).status;
  }
  /** Wipe the native offer and wait for its empty-format-list ACK. Never retries. */
  async revokeClipboardText(): Promise<ClipboardStatus> {
    if (!this.report?.capabilities.clipboardRevoke)
      throw new WorkerError('CLIPBOARD_NOT_IMPLEMENTED');
    return (await this.clipboardTransfer('revoke', 0n, Buffer.alloc(0))).status;
  }
  private async clipboardTransfer(
    operation: ClipboardOperation,
    revision: bigint,
    text: Buffer,
  ): Promise<ClipboardReadResult> {
    if (!this.report?.capabilities.clipboardText)
      throw new WorkerError('CLIPBOARD_NOT_IMPLEMENTED');
    if (
      typeof revision !== 'bigint' ||
      revision < (operation === 'read' ? 1n : 0n) ||
      revision > 0xffffffffffffffffn
    )
      throw new WorkerError('CLIPBOARD_INVALID_REQUEST');
    const negative = (status: ClipboardStatus): ClipboardReadResult => ({
      status,
      text: Buffer.alloc(0),
    });
    const source = this.clipboardStatus,
      profile = this.clipboardProfile;
    if (
      this.status !== 'ready' ||
      !this.rdpConnected ||
      !source?.ready ||
      !profile
    )
      return negative('unavailable');
    if (this.clipboardRequest) return negative('busy');
    if (operation === 'read' && revision !== source.revision)
      return negative('stale');
    if (operation === 'revoke' && source.localPending) return negative('busy');
    if (
      operation === 'read'
        ? !source.fromServer || !source.remoteText || source.remotePending
        : operation === 'set' && (!source.toServer || source.localPending)
    )
      return negative('refused');
    if (operation === 'set') {
      try {
        validateClipboardText(text, profile.maximum);
      } catch {
        throw new WorkerError('CLIPBOARD_INVALID_TEXT');
      }
    }
    const identity = { operation, generation: source.generation, revision };
    const payload = encodeClipboardCommand({ ...identity, text });
    this.clipboardRequest = identity;
    let response: Packet | undefined;
    try {
      let completion: Promise<Packet>;
      try {
        completion = this.request(
          Kind.ClipboardCommand,
          Kind.ClipboardResult,
          payload,
          7000,
        );
      } finally {
        payload.fill(0);
      }
      response = await completion;
      const result = decodeClipboardResult(response.payload);
      if (
        result.operation !== operation ||
        result.generation !== identity.generation ||
        result.revision !== revision
      ) {
        this.fail('IPC_UNEXPECTED_REPLY');
        throw new WorkerError('IPC_UNEXPECTED_REPLY');
      }
      const current = this.clipboardStatus;
      if (this.status !== 'ready' || !this.rdpConnected || !current?.ready)
        return negative('disconnected');
      if (
        current.generation !== identity.generation ||
        (operation === 'read' && current.revision !== revision)
      )
        return negative('stale');
      if (
        operation === 'revoke' &&
        result.status === 'accepted' &&
        (current.localAccepted || current.localPending)
      ) {
        this.fail('IPC_UNEXPECTED_REPLY');
        throw new WorkerError('IPC_UNEXPECTED_REPLY');
      }
      if (operation === 'read' && result.status === 'accepted') {
        try {
          validateClipboardText(result.text, profile.maximum);
        } catch {
          this.fail('IPC_UNEXPECTED_REPLY');
          throw new WorkerError('IPC_UNEXPECTED_REPLY');
        }
        return { status: 'accepted', text: Buffer.from(result.text) };
      }
      return negative(result.status);
    } catch (error) {
      if (error instanceof WorkerError && error.code === 'RDP_DISCONNECTED')
        return negative('disconnected');
      throw error;
    } finally {
      response?.payload.fill(0);
      this.clipboardRequest = undefined;
    }
  }

  /** Acceptance is source admission, not remote delivery. Neither codec is retried. */
  async sendMicrophone(packet: MicrophonePcmPacket): Promise<MicrophoneResult> {
    return this.sendMicrophonePacket({ codec: 'pcm', packet });
  }

  async sendMicrophoneOpus(
    packet: MicrophoneOpusPacket,
  ): Promise<MicrophoneResult> {
    return this.sendMicrophonePacket({ codec: 'opus', packet });
  }

  private async sendMicrophonePacket(
    input:
      | { codec: 'pcm'; packet: MicrophonePcmPacket }
      | { codec: 'opus'; packet: MicrophoneOpusPacket },
  ): Promise<MicrophoneResult> {
    const { packet } = input;
    if (
      !(input.codec === 'opus'
        ? this.report?.capabilities.opusInput
        : this.report?.capabilities.pcmInput)
    )
      throw new WorkerError('MICROPHONE_NOT_IMPLEMENTED');
    if (
      this.status !== 'ready' ||
      !this.rdpConnected ||
      !this.microphoneEnabled ||
      this.microphoneCodec !== input.codec ||
      this.microphoneStatus?.availability !== 'ready'
    )
      return 'unavailable';
    if (this.microphoneSending || this.microphoneResetting) return 'busy';
    if (this.scheduledMicrophoneEpoch === this.microphoneStatus.epoch)
      return 'unavailable';
    const bytes =
      input.codec === 'opus'
        ? encodeMicrophoneOpus(input.packet)
        : encodeMicrophonePcm(input.packet);
    if (packet.epoch !== this.microphoneStatus.epoch) {
      bytes.fill(0);
      return 'stale';
    }
    this.microphoneSending = true;
    try {
      const reply = await this.request(
        input.codec === 'opus' ? Kind.MicrophoneOpus : Kind.MicrophonePcm,
        Kind.MicrophoneResult,
        bytes,
      );
      return decodeMicrophoneResult(reply.payload);
    } finally {
      bytes.fill(0);
      this.microphoneSending = false;
    }
  }

  /** Clears input on the owner; a fresh ready epoch authorizes the selected codec. */
  async resetMicrophone(expectedEpoch: bigint): Promise<MicrophoneResetResult> {
    const payload = encodeMicrophoneReset(expectedEpoch);
    if (!this.report?.capabilities.microphoneReset)
      throw new WorkerError('MICROPHONE_RESET_NOT_IMPLEMENTED');
    if (
      this.status !== 'ready' ||
      !this.rdpConnected ||
      !this.microphoneEnabled
    )
      return 'unavailable';
    const state = this.microphoneStatus;
    if (!state?.enabled) return 'unavailable';
    if (state.epoch !== expectedEpoch) return 'stale';
    if (state.availability !== 'ready') return 'unavailable';
    if (
      this.microphoneResetting ||
      this.microphoneSending ||
      this.scheduledMicrophoneEpoch === expectedEpoch
    )
      return 'busy';
    this.microphoneResetting = true;
    try {
      const reply = await this.request(
        Kind.MicrophoneReset,
        Kind.MicrophoneResetResult,
        payload,
        Math.max(1500, this.options.requestTimeoutMs),
      );
      const result = decodeMicrophoneResetResult(reply.payload);
      if (result === 'scheduled') this.scheduledMicrophoneEpoch = expectedEpoch;
      return result;
    } finally {
      this.microphoneResetting = false;
    }
  }

  async sendInput(event: InputEvent): Promise<void> {
    if (event.type === 'touch') {
      const { action, contactId, x, y, generation } = event;
      return this.sendTouch({ action, contactId, x, y }, generation);
    }
    const text = event.type === 'text';
    const payload = text ? encodeInputText(event.text) : encodeInput(event);
    try {
      if (
        !this.report?.capabilities.basicInput ||
        (text && !this.report.capabilities.unicodeInput)
      )
        throw new WorkerError('INPUT_NOT_IMPLEMENTED');
      if (!this.rdpConnected || this.status !== 'ready')
        throw new WorkerError('INPUT_NOT_CONNECTED');
      await this.request(
        text ? Kind.InputText : Kind.Input,
        Kind.InputAck,
        payload,
        event.type === 'reset' && this.touchEnabled
          ? Math.max(3500, this.options.requestTimeoutMs)
          : this.options.requestTimeoutMs,
      );
    } finally {
      if (text) payload.fill(0);
    }
  }
  async pipelineStats(): Promise<PipelineStats> {
    if (!this.report?.capabilities.pipelineStats || this.status !== 'ready')
      throw new WorkerError('DIAGNOSTICS_NOT_IMPLEMENTED');
    const reply = await this.request(Kind.PipelineStats, Kind.PipelineStatsAck);
    return decodePipelineStats(reply.payload);
  }
  get touch(): TouchState | undefined {
    return this.touchState ? { ...this.touchState } : undefined;
  }
  async sendTouch(event: TouchInput, generation: bigint): Promise<void> {
    const payload = encodeTouchRequest(event, generation);
    if (!this.report?.capabilities.touchInput)
      throw new WorkerError('INPUT_NOT_IMPLEMENTED');
    if (!this.rdpConnected || this.status !== 'ready')
      throw new WorkerError('INPUT_NOT_CONNECTED');
    const state = this.touchState;
    if (!state?.enabled || state.availability !== 'ready')
      throw new WorkerError('TOUCH_UNAVAILABLE');
    if (generation !== state.generation)
      throw new WorkerError('INPUT_DISPLAY_TRANSITION');
    await this.request(Kind.InputTouch, Kind.InputAck, payload);
  }

  /** A copy of the last server-observed desktop. No browser attachment authority is implied. */
  get display(): DisplayState | undefined {
    return this.displayState ? { ...this.displayState } : undefined;
  }

  /** Experimental private IPC API; sent layouts resolve only after observation or a typed failure. */
  async resizeDisplay(
    width: number,
    height: number,
  ): Promise<DisplayResizeResult> {
    const payload = encodeDisplayResize(width, height);
    if (!this.report?.capabilities.displayControl)
      throw new WorkerError('DISPLAY_NOT_IMPLEMENTED');
    if (!this.rdpConnected || this.status !== 'ready') return 'disconnected';
    if (!this.displayState?.dynamicResolution) return 'unavailable';
    if (this.resizing) return 'busy';
    this.resizeRequest = {
      width,
      height,
      generation: this.displayState.generation,
    };
    this.resizing = true;
    try {
      const reply = await this.request(
        Kind.DisplayResize,
        Kind.DisplayResizeResult,
        payload,
        Math.max(6500, this.options.requestTimeoutMs),
      );
      const result = decodeDisplayResizeResult(reply.payload);
      return result;
    } finally {
      this.resizing = false;
      this.resizeRequest = undefined;
    }
  }

  /** Private recovery schedule; subsequent source status/config establishes completion. */
  async resetAudio(expectedEpoch: bigint): Promise<AudioResetResult> {
    const payload = encodeAudioReset(expectedEpoch);
    if (!this.report?.capabilities.audioReset)
      throw new WorkerError('AUDIO_RESET_NOT_IMPLEMENTED');
    if (this.status !== 'ready' || !this.rdpConnected) return 'unavailable';
    const state = this.audioSource?.current;
    if (!state?.enabled) return 'unavailable';
    if (state.epoch !== expectedEpoch) return 'stale';
    if (state.availability !== 'ready') return 'unavailable';
    if (this.audioResetting || this.scheduledAudioEpoch === expectedEpoch)
      return 'busy';
    this.audioResetting = true;
    try {
      const reply = await this.request(
        Kind.AudioReset,
        Kind.AudioResetResult,
        payload,
        Math.max(1500, this.options.requestTimeoutMs),
      );
      const result = decodeAudioResetResult(reply.payload);
      if (result === 'scheduled') this.scheduledAudioEpoch = expectedEpoch;
      return result;
    } finally {
      this.audioResetting = false;
    }
  }

  /** Pulls the latest changed desktop. At most one encoded frame request may be in flight. */
  async captureFrame(
    sinceRevision = 0n,
    options: CaptureOptions = { codec: 'jpeg' },
  ): Promise<CapturedFrame> {
    const avc = options.codec === 'h264';
    if (
      !['h264', 'jpeg'].includes(options.codec) ||
      (options.forceKeyframe !== undefined &&
        typeof options.forceKeyframe !== 'boolean')
    )
      throw new WorkerError('INVALID_MEDIA_REQUEST');
    if (
      !(avc
        ? this.report?.capabilities.h264Capture
        : this.report?.capabilities.jpegCapture)
    )
      throw new WorkerError('MEDIA_NOT_IMPLEMENTED');
    if (!this.rdpConnected || this.status !== 'ready')
      throw new WorkerError('MEDIA_NOT_CONNECTED');
    if (this.capturing) throw new WorkerError('MEDIA_BUSY');
    if (
      typeof sinceRevision !== 'bigint' ||
      sinceRevision < 0n ||
      sinceRevision > 0xffffffffffffffffn
    )
      throw new WorkerError('INVALID_MEDIA_REQUEST');
    const payload = Buffer.alloc(avc ? 12 : 8);
    payload.writeBigUInt64BE(sinceRevision);
    if (avc) payload[8] = options.forceKeyframe ? 1 : 0;
    this.capturing = true;
    try {
      const reply = await this.request(
        avc ? Kind.CaptureAvc : Kind.Capture,
        avc ? Kind.FrameAvc : Kind.Frame,
        payload,
      );
      return avc
        ? decodeAvcFrame(reply.payload)
        : decodeCapturedFrame(reply.payload);
    } finally {
      this.capturing = false;
    }
  }

  /** Experimental RDP core. Media/input support is gated separately. */
  async connect(value: unknown): Promise<void> {
    if (this.status !== 'ready' || this.connectionRequested)
      throw new WorkerError('INVALID_STATE');
    if (!this.report?.capabilities.connectCore)
      throw new WorkerError('RDP_NOT_IMPLEMENTED');
    const config = validateSessionConfig(value);
    try {
      const clipboard = clipboardSelection(
        config,
        this.report.capabilities.clipboardText,
      );
      const payload = connectionPayload(
        config,
        this.report.capabilities.videoQuality,
        this.report.capabilities.performanceSettings,
        this.report.capabilities.displayControl,
        this.report.capabilities.touchInput,
        this.report.capabilities.pcmOutput,
        this.report.capabilities.opusOutput,
        this.report.capabilities.pcmInput,
        this.report.capabilities.opusInput,
        this.report.capabilities.microphoneReset,
        this.report.capabilities.audioBuffer200,
        clipboard,
      );
      const password = Buffer.from(config.auth.password ?? '', 'utf8');
      try {
        if (
          password.length > 4096 ||
          password.includes(0) ||
          new TextDecoder('utf-8', { fatal: true }).decode(password) !==
            (config.auth.password ?? '')
        )
          throw new WorkerError('INVALID_SESSION_CONFIG');
        await this.request(Kind.Configure, Kind.ConfigureAck, payload);
        await this.request(Kind.Secret, Kind.SecretAck, password);
      } finally {
        password.fill(0);
      }
      this.connectionRequested = true;
      this.clipboardProfile = clipboard;
      this.dynamicResolution = config.display?.dynamicResolution === true;
      this.touchEnabled = config.input?.touch === true;
      this.microphoneCodec =
        config.media?.microphone === 'opus'
          ? 'opus'
          : config.media?.microphone === 'pcm'
            ? 'pcm'
            : undefined;
      this.microphoneEnabled = this.microphoneCodec !== undefined;
      this.audioCodec =
        config.media?.audioOutput === 'opus'
          ? 'opus'
          : config.media?.audioOutput === 'pcm'
            ? 'pcm'
            : undefined;
      this.audioSource =
        this.audioCodec === 'opus'
          ? new OpusSource()
          : this.audioCodec === 'pcm'
            ? new PcmSource()
            : undefined;
      await this.request(Kind.Connect, Kind.ConnectAck);
    } finally {
      delete config.auth.password;
    }
  }

  async decideCertificate(
    prompt: CertificatePrompt,
    accept: boolean,
  ): Promise<void> {
    if (
      !this.certificatePrompt ||
      this.status !== 'ready' ||
      this.certificatePrompt.challenge !== prompt.challenge ||
      this.certificatePrompt.fingerprint !== prompt.fingerprint
    )
      throw new WorkerError('CERTIFICATE_PROMPT_STALE');
    const payload = encodeCertificateDecision(prompt, accept);
    this.certificatePrompt = undefined;
    await this.request(
      Kind.CertificateDecision,
      Kind.CertificateDecisionAck,
      payload,
    );
  }

  terminate(): void {
    this.fail('WORKER_TERMINATED');
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
    this.stopResidentWatchdog();
    this.stopCpuWatchdog();
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
    } else {
      if (this.startCompletion) await this.startCompletion;
      if (this.closedPromise) await this.closedPromise;
    }
    if (this.retirementFailed) throw new WorkerError('IPC_CLOSE_FAILED');
    if (this.residentRetirementFailed || this.cpuRetirementFailed)
      throw new WorkerError('WORKER_RESOURCE_CLOSE_FAILED');
  }

  private async cleanup(): Promise<void> {
    this.stopResidentWatchdog();
    this.stopCpuWatchdog();
    if (this.packetOwner) {
      this.packetOwner.destroy();
      try {
        await this.packetOwner.retired;
      } catch {
        this.retirementFailed = true;
        throw new WorkerError('IPC_CLOSE_FAILED');
      }
      this.packetOwner = undefined;
    }
    await this.residentProbe?.completion;
    await this.cpuProbe?.completion;
    this.ipcInput = undefined;
    this.cursorState = undefined;
    this.displayState = undefined;
    this.touchState = undefined;
    this.microphoneStatus = undefined;
    this.microphoneCodec = undefined;
    this.microphoneEnabled = false;
    this.clipboardStatus = undefined;
    this.clipboardProfile = undefined;
    this.clipboardLate = undefined;
    this.clipboardTerminal = true;
    if (this.directory) {
      await rm(this.directory, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      });
      this.directory = undefined;
    }
    if (this.residentRetirementFailed || this.cpuRetirementFailed)
      throw new WorkerError('WORKER_RESOURCE_CLOSE_FAILED');
  }
}

function clipboardSelection(
  config: SessionCreate,
  available: boolean,
): ClipboardSelection | undefined {
  const c = config.clipboard;
  if (!c || c.mode === 'off') return undefined;
  if (
    !available ||
    !c.mode ||
    c.text === false ||
    c.html ||
    c.images ||
    c.files
  )
    throw new WorkerError('RDP_SETTING_NOT_IMPLEMENTED');
  return {
    toServer: c.mode !== 'server-to-browser',
    fromServer: c.mode !== 'browser-to-server',
    maximum: c.maxItemBytes ?? 1048576,
  };
}
function connectionPayload(
  config: SessionCreate,
  videoQuality: boolean,
  performanceSettings: boolean,
  displayControl: boolean,
  touchInput: boolean,
  pcmOutput: boolean,
  opusOutput: boolean,
  pcmInput: boolean,
  opusInput: boolean,
  microphoneReset: boolean,
  audioBuffer200: boolean,
  clipboard: ClipboardSelection | undefined,
): Buffer {
  const allowed = (value: object | undefined, names: string[]) => {
    if (value && Object.keys(value).some((key) => !names.includes(key)))
      throw new WorkerError('RDP_SETTING_NOT_IMPLEMENTED');
  };
  allowed(config, [
    'target',
    'auth',
    'security',
    'display',
    'timeouts',
    'quality',
    'input',
    'media',
    'clipboard',
  ]);
  allowed(config.target, ['host', 'port']);
  allowed(config.auth, ['username', 'domain', 'password', 'mode']);
  allowed(config.security, ['protocol', 'certificatePolicy', 'minimumTls']);
  allowed(config.display, [
    'width',
    'height',
    'colorDepth',
    'dynamicResolution',
  ]);
  allowed(config.input, ['touch']);
  allowed(config.media, [
    'audioOutput',
    'microphone',
    'audioLatencyMs',
    'audioOutputBufferMs',
  ]);
  if (
    (config.media?.audioOutput &&
      !['off', 'pcm', 'opus'].includes(config.media.audioOutput)) ||
    (config.media?.audioOutput === 'pcm' && !pcmOutput) ||
    (config.media?.audioOutput === 'opus' && !opusOutput) ||
    (config.media?.microphone &&
      config.media.microphone !== 'off' &&
      !['pcm', 'opus'].includes(config.media.microphone)) ||
    (config.media?.microphone === 'pcm' && !pcmInput) ||
    (config.media?.microphone === 'opus' && (!opusInput || !microphoneReset)) ||
    config.media?.audioLatencyMs !== undefined ||
    (config.media?.audioOutputBufferMs === 200 &&
      (!audioBuffer200 ||
        !['pcm', 'opus'].includes(config.media?.audioOutput ?? 'off')))
  )
    throw new WorkerError('RDP_SETTING_NOT_IMPLEMENTED');
  if (config.input?.touch && !touchInput)
    throw new WorkerError('RDP_SETTING_NOT_IMPLEMENTED');
  if (config.display?.dynamicResolution && !displayControl)
    throw new WorkerError('RDP_SETTING_NOT_IMPLEMENTED');
  allowed(config.timeouts, ['connectMs', 'tcpAckMs']);
  allowed(config.quality, [
    'profile',
    'maxFps',
    'targetBitrateKbps',
    'maxBitrateKbps',
    ...RDP_PERFORMANCE_FIELDS,
  ]);
  if (
    !performanceSettings &&
    RDP_PERFORMANCE_FIELDS.some(
      (field) => config.quality?.[field] !== undefined,
    )
  )
    throw new WorkerError('RDP_SETTING_NOT_IMPLEMENTED');
  const performance = performanceSettings
    ? resolveRdpPerformance(config.quality)
    : undefined;
  const quality = config.quality
    ? resolveVideoQuality(config.quality)
    : undefined;
  if (
    quality &&
    (!videoQuality ||
      quality.targetBitrate < 100000 ||
      quality.maxBitrate > 20000000)
  )
    throw new WorkerError('RDP_SETTING_NOT_IMPLEMENTED');
  if (
    (config.auth.mode && !['auto', 'password'].includes(config.auth.mode)) ||
    (config.security?.protocol &&
      !['auto', 'nla', 'tls'].includes(config.security.protocol)) ||
    config.security?.certificatePolicy === 'tofu'
  )
    throw new WorkerError('RDP_SETTING_NOT_IMPLEMENTED');
  return encodeConnectionSettings({
    host: config.target.host,
    port: config.target.port ?? 3389,
    username: config.auth.username ?? '',
    domain: config.auth.domain ?? '',
    width: config.display?.width ?? 1024,
    height: config.display?.height ?? 768,
    colorDepth: config.display?.colorDepth ?? 32,
    security:
      config.security?.protocol === 'nla'
        ? 1
        : config.security?.protocol === 'tls'
          ? 2
          : 0,
    certificatePolicy: config.security?.certificatePolicy === 'prompt' ? 1 : 0,
    minimumTls: config.security?.minimumTls === '1.3' ? 3 : 2,
    connectMs: config.timeouts?.connectMs ?? 10000,
    tcpAckMs: config.timeouts?.tcpAckMs ?? 10000,
    ...(config.display?.dynamicResolution ? { dynamicResolution: true } : {}),
    ...(config.input?.touch ? { touch: true } : {}),
    ...(config.media?.audioOutput === 'pcm' ? { pcmOutput: true } : {}),
    ...(config.media?.audioOutput === 'opus' ? { opusOutput: true } : {}),
    ...(config.media?.audioOutputBufferMs === 200
      ? { audioBuffer200: true }
      : {}),
    ...(config.media?.microphone === 'pcm' ? { pcmInput: true } : {}),
    ...(config.media?.microphone === 'opus' ? { opusInput: true } : {}),
    ...(quality ? { videoQuality: quality } : {}),
    ...(clipboard ? { clipboard } : {}),
    ...(performance ? { performance } : {}),
  });
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
          ['SystemRoot', 'WINDIR', 'PATH', 'LD_LIBRARY_PATH'].flatMap((key) =>
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
