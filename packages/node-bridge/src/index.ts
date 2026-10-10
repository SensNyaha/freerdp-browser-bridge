import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
export * from './session-manager.js';
export * from './native-session.js';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
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
  private rdpConnected = false;
  private capturing = false;
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

  private requireStarting(): void {
    if (this.status !== 'starting') throw new WorkerError('WORKER_TERMINATED');
  }

  async start(): Promise<WorkerBuild> {
    if (this.status !== 'created') throw new WorkerError('INVALID_STATE');
    this.setState('starting');
    try {
      await mkdir(this.options.runtimeRoot, { recursive: true, mode: 0o700 });
      this.requireStarting();
      this.directory = await mkdtemp(join(this.options.runtimeRoot, 'worker-'));
      this.requireStarting();
      await writeFile(join(this.directory, '.rdp-worker-owned'), 'runtime-v1', {
        flag: 'wx',
        mode: 0o600,
      });
      this.requireStarting();
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
      this.requireStarting();
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
    if (!pending || packet.kind !== pending.expected)
      throw new WorkerError('IPC_UNEXPECTED_REPLY');
    if (packet.kind === Kind.Frame) decodeCapturedFrame(packet.payload);
    if (packet.kind === Kind.FrameAvc) decodeAvcFrame(packet.payload);
    if (packet.kind === Kind.PipelineStatsAck)
      decodePipelineStats(packet.payload);
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
        kind === Kind.Hello ? this.options.startupTimeoutMs : timeoutMs,
      );
      this.pending.set(requestId, { expected, resolve: done, reject, timer });
      child.stdin.write(bytes, (error) => {
        if (kind === Kind.Secret || kind === Kind.InputText) bytes.fill(0);
        if (error) this.fail('IPC_WRITE_FAILED');
      });
    });
  }

  async ping(): Promise<void> {
    if (this.status !== 'ready') throw new WorkerError('INVALID_STATE');
    await this.request(Kind.Heartbeat, Kind.HeartbeatAck);
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
      const payload = connectionPayload(
        config,
        this.report.capabilities.videoQuality,
        this.report.capabilities.displayControl,
        this.report.capabilities.touchInput,
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
      this.dynamicResolution = config.display?.dynamicResolution === true;
      this.touchEnabled = config.input?.touch === true;
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
    this.cursorState = undefined;
    this.displayState = undefined;
    this.touchState = undefined;
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

function connectionPayload(
  config: SessionCreate,
  videoQuality: boolean,
  displayControl: boolean,
  touchInput: boolean,
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
  ]);
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
    ...(quality ? { videoQuality: quality } : {}),
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
