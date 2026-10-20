import { EventEmitter } from 'node:events';
import { MicrophoneOwnership } from './microphone-ownership.js';
import {
  ClipboardOwnership,
  type ClipboardGrant,
} from './clipboard-ownership.js';
import type { ClipboardReadResult } from './index.js';
import type {
  MicrophoneIngress,
  MicrophoneAdmission,
} from './microphone-ingress.js';
import { createHash, randomBytes } from 'node:crypto';
import {
  SessionAudioSource,
  type SessionAudioEvent,
  type SessionAudioSnapshot,
} from './session-audio.js';
import type { AudioResetResult } from '@freerdp-bridge/protocol';
import {
  validateCursorState,
  validateDisplayState,
  validInputText,
  validTouchInput,
  validateTouchState,
  encodeAudioReset,
  encodeMicrophoneState,
  validateMicrophoneStateProgress,
  validateClipboardState,
} from '@freerdp-bridge/protocol';
import {
  ConfigError,
  validateSessionConfig,
  resolveVideoQuality,
  type VideoQuality,
  type SessionCreate,
} from '@freerdp-bridge/config';
import type {
  BridgeFailure,
  SessionState,
  CertificatePrompt,
  CapturedFrame,
  CaptureOptions,
  MediaCodec,
  InputEvent,
  CursorState,
  DisplayState,
  DisplayResizeResult,
  TouchState,
  MicrophoneState,
  MicrophonePcmPacket,
  MicrophoneOpusPacket,
  MicrophoneResult,
  MicrophoneResetResult,
  ClipboardState,
  ClipboardStatus,
} from '@freerdp-bridge/protocol';

const failures = {
  CLIPBOARD_NOT_IMPLEMENTED: [
    501,
    'Clipboard is unavailable in this backend',
    false,
  ],
  CLIPBOARD_FAILED: [502, 'Clipboard ownership failed', false],
  INPUT_TOUCH_UNAVAILABLE: [409, 'Touch input is unavailable or paused', true],
  INPUT_TOUCH_INVALID_TRANSITION: [
    409,
    'Touch contact transition is invalid',
    false,
  ],
  INPUT_INVALID: [400, 'Input record is invalid', false],
  DISPLAY_NOT_IMPLEMENTED: [
    501,
    'Display Control is unavailable in this build',
    false,
  ],
  DISPLAY_NOT_CONNECTED: [
    409,
    'Display Control requires a connected session',
    true,
  ],
  DISPLAY_INVALID_REQUEST: [
    400,
    'Display layout is invalid or unsupported',
    false,
  ],
  DISPLAY_FAILED: [502, 'Display Control operation failed', true],
  INPUT_DISPLAY_TRANSITION: [
    409,
    'Input is paused during a display transition',
    true,
  ],
  INPUT_NOT_IMPLEMENTED: [501, 'Input is unavailable in this build', false],
  INPUT_NOT_CONNECTED: [409, 'Remote input requires a connected session', true],
  INPUT_FAILED: [502, 'Remote input delivery failed', false],
  INPUT_QUEUE_FULL: [429, 'Remote input queue is full', false],
  MEDIA_NOT_IMPLEMENTED: [501, 'Requested media codec is unavailable', false],
  MEDIA_FAILED: [502, 'Media frame is unavailable', true],
  RDP_CONNECT_FAILED: [502, 'Remote connection failed', true],
  RDP_AUTHENTICATION_FAILED: [502, 'Remote authentication failed', false],
  RDP_CERTIFICATE_REJECTED: [502, 'Remote certificate was rejected', false],
  RDP_CONNECT_TIMEOUT: [504, 'Remote connection deadline exceeded', true],
  RDP_PROTOCOL_ERROR: [502, 'Remote protocol operation failed', false],
  RDP_CONNECT_CANCELLED: [502, 'Remote connection was cancelled', true],
  RDP_DISCONNECTED: [502, 'Remote session disconnected', true],
  RDP_SERVER_TIMEOUT: [504, 'Remote server ended the session on timeout', true],
  RDP_SERVER_LOGOFF: [502, 'Remote server logged off the session', true],
  RDP_SETTING_NOT_IMPLEMENTED: [
    501,
    'Requested connection setting is not implemented',
    false,
  ],
  CERTIFICATE_PROMPT_STALE: [
    409,
    'Certificate prompt is stale or unavailable',
    false,
  ],
  AUTH_REQUIRED: [401, 'Authentication is required', false],
  INVALID_SESSION_CONFIG: [
    400,
    'Session configuration is invalid or disallowed by policy',
    false,
  ],
  SESSION_NOT_FOUND: [404, 'Session was not found', false],
  SESSION_LIMIT: [429, 'Session admission limit reached', true],
  CREATE_RATE_LIMIT: [429, 'Session creation rate limit reached', true],
  TOKEN_LIMIT: [429, 'Outstanding attach token limit reached', true],
  ATTACH_INVALID: [401, 'Attach credential is invalid or expired', false],
  ATTACHMENT_CONFLICT: [409, 'This session channel is already attached', true],
  SESSION_NOT_ATTACHABLE: [409, 'Session is closing or terminal', false],
  RDP_NOT_IMPLEMENTED: [
    501,
    'Native RDP connection is not implemented in this build',
    false,
  ],
  SERVER_CLOSING: [503, 'Bridge is shutting down', true],
  WORKER_START_FAILED: [500, 'Session worker failed to start', true],
  WORKER_START_TIMEOUT: [504, 'Session worker startup deadline exceeded', true],
  WORKER_FAILED: [500, 'Session worker failed', true],
  WORKER_MEMORY_LIMIT: [503, 'Session worker memory policy exceeded', false],
  WORKER_CPU_LIMIT: [503, 'Session worker CPU policy exceeded', false],
  WORKER_RESOURCE_UNAVAILABLE: [
    503,
    'Session worker resource measurement is unavailable',
    true,
  ],
  WORKER_INVALID_STATE: [
    500,
    'Session worker emitted an invalid state transition',
    false,
  ],
  INTERNAL_ERROR: [500, 'Bridge operation failed', true],
} as const;
export type SessionErrorCode = keyof typeof failures;
export class SessionError extends Error {
  readonly statusCode: number;
  readonly failure: BridgeFailure;
  constructor(readonly code: SessionErrorCode) {
    const [status, message, retryable] = failures[code];
    super(message);
    this.statusCode = status;
    this.failure = { code, message, retryable };
  }
}
export function publicSessionError(error: unknown): SessionError {
  if (error instanceof SessionError) return error;
  if (error instanceof ConfigError)
    return new SessionError('INVALID_SESSION_CONFIG');
  return new SessionError('INTERNAL_ERROR');
}
export interface Principal {
  id: string;
}
export type SessionChannel = 'control' | 'media';
/** Scalar server admission authority; never a physical capture/permission assertion. */
export interface SessionMicrophoneSnapshot {
  state?: MicrophoneState;
  granted: boolean;
  retiring: boolean;
}
export interface SessionClipboardSnapshot {
  state?: ClipboardState;
  granted: boolean;
  retiring: boolean;
}
export interface SessionSnapshot {
  sessionId: string;
  state: SessionState;
  createdAt: number;
  updatedAt: number;
  error?: BridgeFailure;
}
export interface SessionEvent {
  type:
    | 'session.state'
    | 'session.error'
    | 'certificate.prompt'
    | 'display.info'
    | 'display.resize'
    | 'touch.info'
    | 'cursor.state';
  session: SessionSnapshot;
  certificate?: CertificatePrompt;
  cursor?: CursorState;
  display?: DisplayState;
  touch?: TouchState;
  resizing?: boolean;
}
export interface DisplayResizeRequest {
  width: number;
  height: number;
  deviceScale: number;
}
export interface CertificateResponse {
  challenge: string;
  fingerprint: string;
  accept: boolean;
}
/** Trusted backend boundary. Stage 3 supplies native config/state IPC; tests use explicit fakes. */
export interface SessionWorker {
  start(config: SessionCreate, signal: AbortSignal): Promise<void>;
  close(): Promise<void>;
  /** A returned promise resolves after forced termination/resource retirement. */
  terminate(): void | Promise<void>;
  onState(listener: (state: SessionState) => void): () => void;
  onFailure(listener: (code?: SessionErrorCode) => void): () => void;
  onCertificate?(listener: (prompt: CertificatePrompt) => void): () => void;
  onCursor?(listener: (cursor: CursorState) => void): () => void;
  onDisplay?(listener: (display: DisplayState) => void): () => void;
  onTouch?(listener: (touch: TouchState) => void): () => void;
  onAudio?(listener: (event: SessionAudioEvent) => void): () => void;
  resetAudio?(expectedEpoch: bigint): Promise<AudioResetResult>;
  onMicrophone?(listener: (state: MicrophoneState) => void): () => void;
  onClipboard?(listener: (state: ClipboardState) => void): () => void;
  readClipboardText?(revision: bigint): Promise<ClipboardReadResult>;
  writeClipboardText?(text: Buffer): Promise<ClipboardStatus>;
  revokeClipboardText?(): Promise<ClipboardStatus>;
  sendMicrophone?(packet: MicrophonePcmPacket): Promise<MicrophoneResult>;
  sendMicrophoneOpus?(packet: MicrophoneOpusPacket): Promise<MicrophoneResult>;
  resetMicrophone?(epoch: bigint): Promise<MicrophoneResetResult>;
  resizeDisplay?(width: number, height: number): Promise<DisplayResizeResult>;
  decideCertificate?(prompt: CertificatePrompt, accept: boolean): Promise<void>;
  captureFrame?(
    sinceRevision: bigint,
    options?: CaptureOptions,
  ): Promise<CapturedFrame | undefined>;
  supportsCodec?(codec: MediaCodec): boolean | undefined;
  sendInput?(event: InputEvent): Promise<void>;
}
export interface SessionManagerOptions {
  workerFactory?: (limits: Readonly<SessionWorkerLimits>) => SessionWorker;
  maxSessions?: number;
  maxPerPrincipal?: number;
  maxRetained?: number;
  retentionMs?: number;
  startupTimeoutMs?: number;
  shutdownTimeoutMs?: number;
  terminationTimeoutMs?: number;
  tokenTtlMs?: number;
  maxTokensPerSession?: number;
  createBurst?: number;
  rateWindowMs?: number;
  maxRateKeys?: number;
  now?: () => number;
}
/** Nonsecret immutable reservations supplied before backend construction. */
export interface SessionWorkerLimits {
  readonly clipboardItemBytes?: number;
}
type Token = { channel: SessionChannel; expiresAt: number };
type Entry = {
  clipboardPolicy?: { toServer: boolean; fromServer: boolean; maximum: number };
  clipboard?: ClipboardState;
  clipboardOwnership?: ClipboardOwnership;
  clipboardGrant?: { control: symbol; grant: ClipboardGrant };
  clipboardRetirement?: { control: symbol; promise: Promise<boolean> };
  clipboardListener?: {
    control: symbol;
    sink: (snapshot: SessionClipboardSnapshot) => void;
  };
  videoQuality: VideoQuality;
  dynamicResolution: boolean;
  touchEnabled: boolean;
  audioEnabled: boolean;
  audio?: SessionAudioSource;
  audioListener?: { lease: symbol; sink: (event: SessionAudioEvent) => void };
  audioReset?: symbol;
  microphoneEnabled: boolean;
  microphoneCodec?: 'pcm' | 'opus';
  microphone?: MicrophoneState;
  microphoneOwnership?: MicrophoneOwnership;
  microphoneSink?: (state: MicrophoneState) => void;
  microphoneGrant?: {
    control: symbol;
    media: symbol;
    ingress: MicrophoneIngress;
  };
  microphoneRetirement?: { media: symbol; promise: Promise<boolean> };
  microphoneListener?: {
    lease: symbol;
    sink: (snapshot: SessionMicrophoneSnapshot) => void;
  };
  touch?: TouchState;
  display?: DisplayState;
  resize?: symbol;
  cursor?: CursorState;
  certificate?: CertificatePrompt;
  owner: string;
  snapshot: SessionSnapshot;
  worker: SessionWorker;
  abort: AbortController;
  unsubscribers: Array<() => void>;
  tokens: Map<string, Token>;
  attachments: Map<SessionChannel, symbol>;
  released: boolean;
  inputTail: Promise<void>;
  inputPending: number;
  cleanup?: Promise<void>;
};
function clipboardSnapshot(
  entry: Entry,
  control: symbol,
): SessionClipboardSnapshot {
  return {
    ...(entry.clipboard ? { state: { ...entry.clipboard } } : {}),
    granted: Boolean(
      entry.clipboardGrant?.control === control &&
        entry.attachments.get('control') === control &&
        !entry.released &&
        entry.snapshot.state === 'connected' &&
        entry.clipboardOwnership?.status === 'active',
    ),
    retiring: entry.clipboardOwnership?.status === 'retiring',
  };
}
function microphoneSnapshot(
  entry: Entry,
  lease: symbol,
): SessionMicrophoneSnapshot {
  const grant = entry.microphoneGrant;
  return {
    ...(entry.microphone ? { state: { ...entry.microphone } } : {}),
    granted: Boolean(
      grant &&
        grant.media === lease &&
        entry.attachments.get('media') === lease &&
        entry.attachments.get('control') === grant.control &&
        !entry.released &&
        entry.snapshot.state === 'connected',
    ),
    retiring: entry.microphoneOwnership?.status === 'retiring',
  };
}
const transitions: Record<SessionState, readonly SessionState[]> = {
  created: ['starting', 'closing', 'failed'],
  starting: [
    'connecting',
    'awaiting-user',
    'connected',
    'closing',
    'closed',
    'failed',
  ],
  connecting: [
    'awaiting-user',
    'connected',
    'reconnecting',
    'closing',
    'closed',
    'failed',
  ],
  'awaiting-user': ['connecting', 'connected', 'closing', 'closed', 'failed'],
  connected: ['awaiting-user', 'reconnecting', 'closing', 'closed', 'failed'],
  reconnecting: [
    'connecting',
    'awaiting-user',
    'connected',
    'closing',
    'closed',
    'failed',
  ],
  closing: ['closed', 'failed'],
  closed: [],
  failed: [],
};
const terminal = (state: SessionState) =>
  state === 'closed' || state === 'failed';
const digest = (token: string) =>
  createHash('sha256').update(token).digest('hex');

export class SessionManager extends EventEmitter<{ event: [SessionEvent] }> {
  private readonly entries = new Map<string, Entry>();
  private readonly ownedWorkers = new WeakSet<SessionWorker>();
  private readonly rates = new Map<string, { count: number; until: number }>();
  private readonly options: Required<
    Omit<SessionManagerOptions, 'workerFactory'>
  >;
  private readonly factory: SessionManagerOptions['workerFactory'];
  private readonly sweep: NodeJS.Timeout;
  private stopping = false;
  private shutdownPromise: Promise<void> | undefined;
  readonly totals = { created: 0, failed: 0, rejected: 0 };

  constructor(options: SessionManagerOptions = {}) {
    super();
    this.factory = options.workerFactory;
    this.options = {
      maxSessions: options.maxSessions ?? 32,
      maxPerPrincipal: options.maxPerPrincipal ?? 4,
      maxRetained: options.maxRetained ?? 64,
      retentionMs: options.retentionMs ?? 300000,
      startupTimeoutMs: options.startupTimeoutMs ?? 10000,
      shutdownTimeoutMs: options.shutdownTimeoutMs ?? 2000,
      terminationTimeoutMs: options.terminationTimeoutMs ?? 2000,
      tokenTtlMs: options.tokenTtlMs ?? 60000,
      maxTokensPerSession: options.maxTokensPerSession ?? 4,
      createBurst: options.createBurst ?? 5,
      rateWindowMs: options.rateWindowMs ?? 60000,
      maxRateKeys: options.maxRateKeys ?? 1024,
      now: options.now ?? Date.now,
    };
    for (const [key, value] of Object.entries(this.options)) {
      if (
        key !== 'now' &&
        (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
      )
        throw new Error('Invalid session manager options');
    }
    if (
      this.options.maxTokensPerSession < 2 ||
      this.options.tokenTtlMs > 300000
    )
      throw new Error('Invalid attach token policy');
    this.sweep = setInterval(() => this.prune(), 1000);
    this.sweep.unref();
  }

  private owner(principal: Principal): string {
    if (
      !principal ||
      typeof principal.id !== 'string' ||
      !principal.id ||
      principal.id.length > 256
    )
      throw new SessionError('AUTH_REQUIRED');
    return principal.id;
  }
  private entry(id: string, principal: Principal): Entry {
    const owner = this.owner(principal);
    const entry = this.entries.get(id);
    if (!entry || entry.owner !== owner)
      throw new SessionError('SESSION_NOT_FOUND');
    return entry;
  }
  private rate(key: string): void {
    const now = this.options.now();
    for (const [id, value] of this.rates)
      if (value.until <= now) this.rates.delete(id);
    const value = this.rates.get(key);
    if (value && value.count >= this.options.createBurst)
      throw new SessionError('CREATE_RATE_LIMIT');
    if (!value && this.rates.size >= this.options.maxRateKeys)
      throw new SessionError('CREATE_RATE_LIMIT');
    if (value) value.count++;
    else
      this.rates.set(key, { count: 1, until: now + this.options.rateWindowMs });
  }

  create(
    value: unknown,
    principal: Principal,
    remoteAddress: string,
  ): SessionSnapshot {
    try {
      if (this.stopping) throw new SessionError('SERVER_CLOSING');
      const owner = this.owner(principal);
      if (!remoteAddress || remoteAddress.length > 128)
        throw new SessionError('AUTH_REQUIRED');
      this.rate('principal:' + owner);
      this.rate('ip:' + remoteAddress);
      const config = validateSessionConfig(value);
      if (!this.factory) throw new SessionError('RDP_NOT_IMPLEMENTED');
      this.prune();
      const active = [...this.entries.values()].filter(
        (entry) => !entry.released,
      );
      if (
        active.length >= this.options.maxSessions ||
        active.filter((entry) => entry.owner === owner).length >=
          this.options.maxPerPrincipal
      )
        throw new SessionError('SESSION_LIMIT');
      const now = this.options.now();
      const worker = this.factory(
        Object.freeze({
          ...(config.clipboard && config.clipboard.mode !== 'off'
            ? { clipboardItemBytes: config.clipboard.maxItemBytes ?? 1048576 }
            : {}),
        }),
      );
      if (
        !worker ||
        typeof worker !== 'object' ||
        this.ownedWorkers.has(worker)
      )
        throw new SessionError('WORKER_START_FAILED');
      this.ownedWorkers.add(worker);
      const entry: Entry = {
        ...(config.clipboard && config.clipboard.mode !== 'off'
          ? {
              clipboardPolicy: {
                toServer: config.clipboard.mode !== 'server-to-browser',
                fromServer: config.clipboard.mode !== 'browser-to-server',
                maximum: config.clipboard.maxItemBytes ?? 1048576,
              },
            }
          : {}),
        videoQuality: resolveVideoQuality(config.quality),
        dynamicResolution: config.display?.dynamicResolution === true,
        touchEnabled: config.input?.touch === true,
        microphoneEnabled:
          config.media?.microphone === 'pcm' ||
          config.media?.microphone === 'opus',
        ...(config.media?.microphone === 'pcm' ||
        config.media?.microphone === 'opus'
          ? { microphoneCodec: config.media.microphone }
          : {}),
        audioEnabled:
          config.media?.audioOutput === 'pcm' ||
          config.media?.audioOutput === 'opus',
        ...(config.media?.audioOutput === 'pcm' ||
        config.media?.audioOutput === 'opus'
          ? { audio: new SessionAudioSource(config.media.audioOutput) }
          : {}),
        owner,
        worker,
        abort: new AbortController(),
        unsubscribers: [],
        snapshot: {
          sessionId: randomBytes(16).toString('hex'),
          state: 'created',
          createdAt: now,
          updatedAt: now,
        },
        tokens: new Map(),
        attachments: new Map(),
        released: false,
        inputTail: Promise.resolve(),
        inputPending: 0,
      };
      this.entries.set(entry.snapshot.sessionId, entry);
      this.totals.created++;
      try {
        entry.unsubscribers.push(
          worker.onState((state) => this.workerState(entry, state)),
        );
        entry.unsubscribers.push(
          worker.onFailure((code) =>
            this.fail(
              entry,
              code && Object.hasOwn(failures, code) ? code : 'WORKER_FAILED',
            ),
          ),
        );
        if (worker.onCertificate)
          entry.unsubscribers.push(
            worker.onCertificate((prompt) => {
              if (
                entry.released ||
                terminal(entry.snapshot.state) ||
                entry.snapshot.state === 'closing'
              )
                return;
              if (
                entry.snapshot.state !== 'awaiting-user' ||
                entry.certificate
              ) {
                this.fail(entry, 'WORKER_INVALID_STATE');
                return;
              }
              entry.certificate = structuredClone(prompt);
              this.emit('event', {
                type: 'certificate.prompt',
                session: structuredClone(entry.snapshot),
                certificate: structuredClone(prompt),
              });
            }),
          );
        if (worker.onCursor)
          entry.unsubscribers.push(
            worker.onCursor((cursor) => {
              if (
                entry.released ||
                terminal(entry.snapshot.state) ||
                entry.snapshot.state === 'closing'
              )
                return;
              try {
                validateCursorState(cursor);
              } catch {
                this.fail(entry, 'WORKER_INVALID_STATE');
                return;
              }
              if (
                entry.cursor &&
                (cursor.revision <= entry.cursor.revision ||
                  (cursor.shapeId !== 0n &&
                    cursor.shapeId === entry.cursor.shapeId &&
                    (cursor.width !== entry.cursor.width ||
                      cursor.height !== entry.cursor.height ||
                      cursor.hotX !== entry.cursor.hotX ||
                      cursor.hotY !== entry.cursor.hotY)))
              ) {
                this.fail(entry, 'WORKER_INVALID_STATE');
                return;
              }
              const rgba =
                cursor.rgba &&
                (entry.cursor?.shapeId === cursor.shapeId
                  ? entry.cursor.rgba
                  : Buffer.from(cursor.rgba));
              entry.cursor = {
                ...cursor,
                ...(rgba ? { rgba } : {}),
              };
              this.emit('event', {
                type: 'cursor.state',
                session: structuredClone(entry.snapshot),
                cursor: entry.cursor,
              });
            }),
          );
        if (worker.onDisplay)
          entry.unsubscribers.push(
            worker.onDisplay((display) => {
              if (
                entry.released ||
                terminal(entry.snapshot.state) ||
                entry.snapshot.state === 'closing'
              )
                return;
              const previous = entry.display;
              try {
                validateDisplayState(display);
                if (
                  entry.snapshot.state !== 'connected' ||
                  display.dynamicResolution !== entry.dynamicResolution ||
                  (previous &&
                    (display.generation < previous.generation ||
                      (display.generation === previous.generation &&
                        (display.width !== previous.width ||
                          display.height !== previous.height ||
                          display.framebufferRevision !==
                            previous.framebufferRevision)) ||
                      (display.generation > previous.generation &&
                        display.framebufferRevision <=
                          previous.framebufferRevision)))
                )
                  throw new Error('Invalid display state');
              } catch {
                this.fail(entry, 'WORKER_INVALID_STATE');
                return;
              }
              entry.display = { ...display };
              this.displayEvent(
                entry,
                previous && display.generation > previous.generation
                  ? 'display.resize'
                  : 'display.info',
              );
            }),
          );
        if (worker.onTouch)
          entry.unsubscribers.push(
            worker.onTouch((touch) => {
              if (
                entry.released ||
                terminal(entry.snapshot.state) ||
                entry.snapshot.state === 'closing'
              )
                return;
              const previous = entry.touch;
              try {
                validateTouchState(touch);
                if (
                  entry.snapshot.state !== 'connected' ||
                  touch.enabled !== entry.touchEnabled ||
                  (previous &&
                    (touch.revision <= previous.revision ||
                      touch.generation < previous.generation ||
                      (touch.generation === previous.generation &&
                        (touch.width !== previous.width ||
                          touch.height !== previous.height))))
                )
                  throw new Error('Invalid touch state');
              } catch {
                this.fail(entry, 'WORKER_INVALID_STATE');
                return;
              }
              entry.touch = { ...touch };
              this.emit('event', {
                type: 'touch.info',
                session: structuredClone(entry.snapshot),
                touch: { ...touch },
              });
            }),
          );
        if (entry.clipboardPolicy) {
          const selected = config.clipboard!;
          if (
            !selected.mode ||
            selected.text === false ||
            selected.html ||
            selected.images ||
            selected.files ||
            !worker.onClipboard ||
            !worker.readClipboardText ||
            !worker.writeClipboardText ||
            !worker.revokeClipboardText
          )
            throw new SessionError('RDP_SETTING_NOT_IMPLEMENTED');
          entry.clipboardOwnership = new ClipboardOwnership({
            source: () => entry.clipboard,
            read: (revision) => worker.readClipboardText!(revision),
            write: (text) => worker.writeClipboardText!(text),
            revoke: () => worker.revokeClipboardText!(),
            terminate: () => {
              if (
                !entry.released &&
                !terminal(entry.snapshot.state) &&
                entry.snapshot.state !== 'closing'
              )
                this.fail(entry, 'CLIPBOARD_FAILED');
            },
          });
          entry.unsubscribers.push(
            worker.onClipboard((value) => {
              if (
                entry.released ||
                terminal(entry.snapshot.state) ||
                entry.snapshot.state === 'closing'
              )
                return;
              try {
                const {
                  generation,
                  revision,
                  maximum,
                  ready,
                  toServer,
                  fromServer,
                  remoteText,
                  localAccepted,
                  localPending,
                  remotePending,
                } = value;
                const state = {
                  generation,
                  revision,
                  maximum,
                  ready,
                  toServer,
                  fromServer,
                  remoteText,
                  localAccepted,
                  localPending,
                  remotePending,
                };
                const old = entry.clipboard,
                  policy = entry.clipboardPolicy!;
                validateClipboardState(state);
                if (
                  (state.ready && entry.snapshot.state !== 'connected') ||
                  state.maximum !== policy.maximum ||
                  state.toServer !== policy.toServer ||
                  state.fromServer !== policy.fromServer ||
                  (old &&
                    (state.generation !== old.generation ||
                      state.revision < old.revision ||
                      (old.ready && !state.ready)))
                )
                  throw new Error();
                entry.clipboard = state;
                this.clipboardEvent(entry);
              } catch {
                this.fail(entry, 'WORKER_INVALID_STATE');
              }
            }),
          );
        }
        if (
          entry.microphoneEnabled &&
          (typeof worker.onMicrophone !== 'function' ||
            typeof (entry.microphoneCodec === 'opus'
              ? worker.sendMicrophoneOpus
              : worker.sendMicrophone) !== 'function' ||
            typeof worker.resetMicrophone !== 'function')
        ) {
          this.fail(entry, 'RDP_SETTING_NOT_IMPLEMENTED');
          throw new SessionError('RDP_SETTING_NOT_IMPLEMENTED');
        }
        if (entry.microphoneEnabled) {
          const backend = {
            source: () => entry.microphone,
            onSource: (sink: (state: MicrophoneState) => void) => {
              if (entry.microphoneSink)
                throw new Error('Duplicate microphone retirement listener');
              entry.microphoneSink = sink;
              return () => {
                if (entry.microphoneSink === sink) delete entry.microphoneSink;
              };
            },
            reset: (epoch: bigint) => worker.resetMicrophone!(epoch),
            terminate: () => {
              if (
                !entry.released &&
                !terminal(entry.snapshot.state) &&
                entry.snapshot.state !== 'closing'
              )
                this.fail(entry, 'WORKER_FAILED');
            },
          };
          entry.microphoneOwnership =
            entry.microphoneCodec === 'opus'
              ? new MicrophoneOwnership({
                  ...backend,
                  codec: 'opus',
                  submit: (packet) => worker.sendMicrophoneOpus!(packet),
                })
              : new MicrophoneOwnership({
                  ...backend,
                  codec: 'pcm',
                  submit: (packet) => worker.sendMicrophone!(packet),
                });
        }
        if (worker.onMicrophone)
          entry.unsubscribers.push(
            worker.onMicrophone((value) => {
              if (
                entry.released ||
                terminal(entry.snapshot.state) ||
                entry.snapshot.state === 'closing'
              )
                return;
              try {
                const { enabled, availability, revision, epoch, timestampUs } =
                  value;
                const state = {
                  enabled,
                  availability,
                  revision,
                  epoch,
                  timestampUs,
                };
                encodeMicrophoneState(state);
                validateMicrophoneStateProgress(entry.microphone, state);
                if (
                  !entry.microphoneEnabled ||
                  !enabled ||
                  (availability === 'ready' &&
                    entry.snapshot.state !== 'connected')
                )
                  throw new Error('Invalid microphone source');
                entry.microphone = state;
                entry.microphoneSink?.({ ...state });
                this.microphoneEvent(entry);
              } catch {
                this.fail(entry, 'WORKER_INVALID_STATE');
              }
            }),
          );
        if (
          entry.audioEnabled &&
          (!worker.onAudio ||
            (config.media?.audioOutput === 'opus' && !worker.resetAudio))
        ) {
          this.fail(entry, 'RDP_SETTING_NOT_IMPLEMENTED');
          throw new SessionError('RDP_SETTING_NOT_IMPLEMENTED');
        }
        if (worker.onAudio)
          entry.unsubscribers.push(
            worker.onAudio((event) => {
              if (
                entry.released ||
                terminal(entry.snapshot.state) ||
                entry.snapshot.state === 'closing'
              )
                return;
              let accepted: SessionAudioEvent;
              try {
                if (
                  !entry.audio ||
                  (entry.snapshot.state !== 'connected' &&
                    (event?.type !== 'state' ||
                      event.state?.availability === 'ready'))
                )
                  throw new Error('Invalid audio source');
                accepted = entry.audio.acceptEvent(event);
              } catch {
                this.fail(entry, 'WORKER_INVALID_STATE');
                return;
              }
              const subscriber = entry.audioListener;
              if (
                subscriber &&
                entry.attachments.get('media') === subscriber.lease
              )
                subscriber.sink(accepted);
            }),
          );
        if (terminal(entry.snapshot.state))
          throw new SessionError('WORKER_START_FAILED');
      } catch (error) {
        this.fail(entry, 'WORKER_START_FAILED');
        if (
          error instanceof SessionError &&
          error.code === 'RDP_SETTING_NOT_IMPLEMENTED'
        )
          throw error;
        throw new SessionError('WORKER_START_FAILED');
      }
      this.transition(entry, 'starting');
      void this.start(entry, config);
      return structuredClone(entry.snapshot);
    } catch (error) {
      this.totals.rejected++;
      throw publicSessionError(error);
    }
  }
  private async start(entry: Entry, config: SessionCreate): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    let aborted: (() => void) | undefined;
    try {
      await Promise.race([
        Promise.resolve().then(() => {
          if (!entry.abort.signal.aborted)
            return entry.worker.start(config, entry.abort.signal);
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new SessionError('WORKER_START_TIMEOUT')),
            this.options.startupTimeoutMs,
          );
        }),
        new Promise<never>((_, reject) => {
          aborted = () => reject(new SessionError('WORKER_START_FAILED'));
          if (entry.abort.signal.aborted) aborted();
          else
            entry.abort.signal.addEventListener('abort', aborted, {
              once: true,
            });
        }),
      ]);
    } catch (error) {
      if (!terminal(entry.snapshot.state) && entry.snapshot.state !== 'closing')
        this.fail(
          entry,
          error instanceof SessionError ? error.code : 'WORKER_START_FAILED',
        );
    } finally {
      if (timer) clearTimeout(timer);
      if (aborted) entry.abort.signal.removeEventListener('abort', aborted);
      // Remove manager-owned credential references after delivery/deadline; backend must honor abort.
      delete config.auth.password;
      delete config.auth.passwordHash;
      if (config.gateway) {
        delete config.gateway.password;
        delete config.gateway.accessToken;
      }
      if (config.proxy) delete config.proxy.password;
    }
  }
  private workerState(entry: Entry, state: SessionState): void {
    if (
      entry.released ||
      terminal(entry.snapshot.state) ||
      entry.snapshot.state === 'closing'
    )
      return;
    if (state === 'failed') {
      this.fail(entry, 'WORKER_FAILED');
      return;
    }
    if (state === entry.snapshot.state) return;
    if (
      entry.clipboardOwnership &&
      entry.snapshot.state === 'connected' &&
      !['closing', 'closed'].includes(state)
    ) {
      this.fail(entry, 'CLIPBOARD_FAILED');
      return;
    }
    if (state !== 'awaiting-user') delete entry.certificate;
    if (
      !Object.hasOwn(transitions, state) ||
      !transitions[entry.snapshot.state].includes(state)
    ) {
      this.fail(entry, 'WORKER_INVALID_STATE');
      return;
    }
    this.transition(entry, state);
    if (state === 'closed' || state === 'closing') void this.cleanup(entry);
  }
  private transition(entry: Entry, state: SessionState): void {
    entry.snapshot.state = state;
    entry.snapshot.updatedAt = this.options.now();
    this.emit('event', {
      type: 'session.state',
      session: structuredClone(entry.snapshot),
    });
  }
  private fail(entry: Entry, code: SessionErrorCode): void {
    if (terminal(entry.snapshot.state)) return;
    entry.snapshot.error = new SessionError(code).failure;
    entry.tokens.clear();
    delete entry.certificate;
    delete entry.cursor;
    delete entry.display;
    delete entry.touch;
    delete entry.audio;
    delete entry.audioListener;
    entry.abort.abort();
    this.totals.failed++;
    this.transition(entry, 'failed');
    this.emit('event', {
      type: 'session.error',
      session: structuredClone(entry.snapshot),
    });
    void this.cleanup(entry);
  }
  private cleanup(entry: Entry): Promise<void> {
    if (entry.cleanup) return entry.cleanup;
    entry.abort.abort();
    entry.tokens.clear();
    const microphoneClose = entry.microphoneOwnership?.close();
    const clipboardClose = entry.clipboardOwnership?.close();
    delete entry.clipboardGrant;
    delete entry.clipboard;
    delete entry.clipboardListener;
    delete entry.microphoneGrant;
    delete entry.microphone;
    delete entry.microphoneListener;
    delete entry.certificate;
    delete entry.cursor;
    delete entry.display;
    delete entry.touch;
    delete entry.audio;
    delete entry.audioListener;
    for (const unsubscribe of entry.unsubscribers.splice(0)) {
      try {
        unsubscribe();
      } catch {
        /* Cleanup continues after a faulty backend listener. */
      }
    }
    entry.cleanup = (async () => {
      let timer: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          Promise.all([
            Promise.resolve().then(() => entry.worker.close()),
            microphoneClose,
            clipboardClose,
          ]),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error()),
              this.options.shutdownTimeoutMs,
            );
          }),
        ]);
      } catch {
        try {
          const termination = entry.worker.terminate();
          if (termination) {
            if (timer) clearTimeout(timer);
            await Promise.race([
              termination,
              new Promise<never>((_, reject) => {
                timer = setTimeout(
                  () => reject(new Error()),
                  this.options.terminationTimeoutMs,
                );
              }),
            ]);
          }
        } catch {
          /* Forced cleanup remains bounded even for a faulty trusted backend. */
        }
      } finally {
        if (timer) clearTimeout(timer);
        entry.released = true;
        if (!terminal(entry.snapshot.state)) this.transition(entry, 'closed');
        this.prune();
      }
    })();
    return entry.cleanup;
  }
  get(id: string, principal: Principal): SessionSnapshot {
    this.prune();
    return structuredClone(this.entry(id, principal).snapshot);
  }
  async close(id: string, principal: Principal): Promise<SessionSnapshot> {
    const entry = this.entry(id, principal);
    if (!terminal(entry.snapshot.state) && entry.snapshot.state !== 'closing')
      this.transition(entry, 'closing');
    await this.cleanup(entry);
    return structuredClone(entry.snapshot);
  }
  mintToken(
    id: string,
    principal: Principal,
    channel: SessionChannel,
  ): {
    token: string;
    expiresAt: number;
    channel: SessionChannel;
    role: 'controller';
  } {
    const entry = this.entry(id, principal);
    if (
      this.stopping ||
      terminal(entry.snapshot.state) ||
      entry.snapshot.state === 'closing'
    )
      throw new SessionError('SESSION_NOT_ATTACHABLE');
    if (channel !== 'control' && channel !== 'media')
      throw new SessionError('ATTACH_INVALID');
    this.expireTokens(entry);
    if (entry.tokens.size >= this.options.maxTokensPerSession)
      throw new SessionError('TOKEN_LIMIT');
    const token = randomBytes(32).toString('base64url');
    const expiresAt = this.options.now() + this.options.tokenTtlMs;
    entry.tokens.set(digest(token), { channel, expiresAt });
    return { token, expiresAt, channel, role: 'controller' };
  }
  attach(
    id: string,
    token: string,
    channel: SessionChannel,
  ): {
    release: () => void;
    session: SessionSnapshot;
    certificate?: CertificatePrompt;
    cursor?: CursorState;
    readonly display: DisplayState | undefined;
    readonly touch: TouchState | undefined;
    readonly resizing: boolean;
    readonly audio: SessionAudioSnapshot | undefined;
    readonly audioFailed: boolean;
    onAudio: (listener: (event: SessionAudioEvent) => void) => () => void;
    resetAudio: (expectedEpoch: bigint) => Promise<AudioResetResult>;
    readonly microphone: MicrophoneState | undefined;
    readonly microphoneCodec: 'pcm' | 'opus';
    readonly microphoneSnapshot: SessionMicrophoneSnapshot;
    readonly microphoneFailed: boolean;
    onMicrophone: (
      listener: (snapshot: SessionMicrophoneSnapshot) => void,
    ) => () => void;
    startMicrophone: () => boolean;
    stopMicrophone: () => Promise<boolean>;
    readonly clipboardSnapshot: SessionClipboardSnapshot;
    onClipboard: (
      listener: (snapshot: SessionClipboardSnapshot) => void,
    ) => () => void;
    startClipboard: () => boolean;
    stopClipboard: () => Promise<boolean>;
    readClipboardText: (revision: bigint) => Promise<ClipboardReadResult>;
    writeClipboardText: (text: Buffer) => Promise<ClipboardStatus>;
    sendMicrophone: (bytes: Buffer) => Promise<MicrophoneAdmission>;
    resizeDisplay: (
      request: DisplayResizeRequest,
    ) => Promise<DisplayResizeResult>;
    respondCertificate: (response: CertificateResponse) => Promise<void>;
    captureFrame: (
      sinceRevision: bigint,
      options?: CaptureOptions,
    ) => Promise<CapturedFrame | undefined>;
    supportsCodec: (codec: MediaCodec) => boolean | undefined;
    maxFps: (codec: MediaCodec) => number;
    sendInput: (event: InputEvent) => Promise<void>;
  } {
    const entry = this.entries.get(id);
    if (!entry || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new SessionError('ATTACH_INVALID');
    this.expireTokens(entry);
    const hash = digest(token);
    const claim = entry.tokens.get(hash);
    if (!claim || claim.channel !== channel)
      throw new SessionError('ATTACH_INVALID');
    if (
      this.stopping ||
      terminal(entry.snapshot.state) ||
      entry.snapshot.state === 'closing'
    )
      throw new SessionError('SESSION_NOT_ATTACHABLE');
    if (entry.attachments.has(channel))
      throw new SessionError('ATTACHMENT_CONFLICT');
    entry.tokens.delete(hash);
    const lease = Symbol();
    entry.attachments.set(channel, lease);
    let capturing = false;
    let audioFailed = false;
    let microphoneFailed = false;
    let clipboardFailed = false;
    const requireClipboardLease = () => {
      if (
        channel !== 'control' ||
        entry.attachments.get('control') !== lease ||
        entry.released ||
        terminal(entry.snapshot.state) ||
        entry.snapshot.state === 'closing'
      )
        throw new SessionError('ATTACH_INVALID');
      if (!entry.clipboardOwnership)
        throw new SessionError('CLIPBOARD_NOT_IMPLEMENTED');
    };
    const requireAudioLease = () => {
      if (
        channel !== 'media' ||
        entry.attachments.get(channel) !== lease ||
        entry.released ||
        terminal(entry.snapshot.state) ||
        entry.snapshot.state === 'closing'
      )
        throw new SessionError('ATTACH_INVALID');
    };
    const requireMicrophoneLease = () => {
      requireAudioLease(); // Both input/output metadata use the current media attachment.
      if (!entry.microphoneEnabled || !entry.microphoneOwnership)
        throw new SessionError('MEDIA_NOT_IMPLEMENTED');
    };
    return {
      get clipboardSnapshot() {
        requireClipboardLease();
        return clipboardSnapshot(entry, lease);
      },
      onClipboard: (listener) => {
        requireClipboardLease();
        if (
          typeof listener !== 'function' ||
          clipboardFailed ||
          entry.clipboardListener
        )
          throw new SessionError('CLIPBOARD_FAILED');
        const registration = {
          control: lease,
          sink: (snapshot: SessionClipboardSnapshot) => {
            try {
              listener(snapshot);
            } catch {
              clipboardFailed = true;
              if (entry.clipboardListener === registration)
                delete entry.clipboardListener;
              const grant = entry.clipboardGrant;
              if (grant?.control === lease)
                void this.retireClipboard(entry, grant);
            }
          },
        };
        entry.clipboardListener = registration;
        return () => {
          if (entry.clipboardListener === registration) {
            delete entry.clipboardListener;
            const grant = entry.clipboardGrant;
            if (grant?.control === lease)
              void this.retireClipboard(entry, grant);
          }
        };
      },
      startClipboard: () => {
        requireClipboardLease();
        if (clipboardFailed) throw new SessionError('CLIPBOARD_FAILED');
        if (entry.snapshot.state !== 'connected' || entry.clipboardGrant)
          return false;
        const grant = entry.clipboardOwnership!.acquire(
          () =>
            entry.clipboardGrant?.grant === grant &&
            entry.attachments.get('control') === lease &&
            entry.snapshot.state === 'connected' &&
            !entry.released,
        );
        if (!grant) return false;
        entry.clipboardGrant = { control: lease, grant };
        this.clipboardEvent(entry);
        return entry.clipboardGrant?.grant === grant;
      },
      stopClipboard: () => {
        requireClipboardLease();
        if (entry.clipboardRetirement?.control === lease)
          return entry.clipboardRetirement.promise;
        const grant = entry.clipboardGrant;
        return grant?.control === lease
          ? this.retireClipboard(entry, grant)
          : Promise.resolve(false);
      },
      readClipboardText: async (revision) => {
        requireClipboardLease();
        const grant = entry.clipboardGrant;
        if (clipboardFailed || grant?.control !== lease)
          return { status: 'unavailable', text: Buffer.alloc(0) };
        const result = await grant.grant.read(revision);
        if (
          entry.attachments.get('control') !== lease ||
          entry.clipboardGrant !== grant ||
          entry.snapshot.state !== 'connected' ||
          entry.released
        ) {
          result.text.fill(0);
          return { status: 'disconnected', text: Buffer.alloc(0) };
        }
        return result;
      },
      writeClipboardText: async (text) => {
        requireClipboardLease();
        const grant = entry.clipboardGrant;
        if (clipboardFailed || grant?.control !== lease) return 'unavailable';
        const result = await grant.grant.write(text);
        return entry.attachments.get('control') === lease &&
          entry.clipboardGrant === grant &&
          entry.snapshot.state === 'connected' &&
          !entry.released
          ? result
          : 'disconnected';
      },
      get microphoneCodec() {
        requireMicrophoneLease();
        return entry.microphoneCodec!;
      },
      get microphone() {
        requireMicrophoneLease();
        return entry.microphone && { ...entry.microphone };
      },
      get microphoneSnapshot() {
        requireMicrophoneLease();
        return microphoneSnapshot(entry, lease);
      },
      get microphoneFailed() {
        requireMicrophoneLease();
        return microphoneFailed;
      },
      onMicrophone: (listener) => {
        requireMicrophoneLease();
        if (
          typeof listener !== 'function' ||
          microphoneFailed ||
          entry.microphoneListener
        )
          throw new SessionError('MEDIA_FAILED');
        const registration = {
          lease,
          sink: (snapshot: SessionMicrophoneSnapshot) => {
            try {
              listener(snapshot);
            } catch {
              microphoneFailed = true;
              if (entry.microphoneListener === registration)
                delete entry.microphoneListener;
              const grant = entry.microphoneGrant;
              if (grant?.media === lease)
                void this.retireMicrophone(entry, grant);
            }
          },
        };
        entry.microphoneListener = registration;
        return () => {
          if (entry.microphoneListener === registration) {
            delete entry.microphoneListener;
            const grant = entry.microphoneGrant;
            if (grant?.media === lease)
              void this.retireMicrophone(entry, grant);
          }
        };
      },
      startMicrophone: () => {
        requireMicrophoneLease();
        if (microphoneFailed) throw new SessionError('MEDIA_FAILED');
        if (entry.snapshot.state !== 'connected') return false;
        const control = entry.attachments.get('control');
        if (!control || entry.microphoneGrant) return false;
        const ingress = entry.microphoneOwnership!.acquire(
          () =>
            entry.microphoneGrant?.ingress === ingress &&
            entry.attachments.get('control') === control &&
            entry.attachments.get('media') === lease &&
            !entry.released &&
            entry.snapshot.state === 'connected',
        );
        if (!ingress) return false;
        entry.microphoneGrant = { control, media: lease, ingress };
        this.microphoneEvent(entry);
        return entry.microphoneGrant?.ingress === ingress;
      },
      stopMicrophone: () => {
        requireMicrophoneLease();
        if (entry.microphoneRetirement?.media === lease)
          return entry.microphoneRetirement.promise;
        const grant = entry.microphoneGrant;
        if (!grant || grant.media !== lease) return Promise.resolve(true);
        return this.retireMicrophone(entry, grant);
      },
      sendMicrophone: (bytes) => {
        try {
          requireMicrophoneLease();
          if (microphoneFailed) throw new SessionError('MEDIA_FAILED');
          const grant = entry.microphoneGrant;
          if (
            !grant ||
            grant.media !== lease ||
            entry.attachments.get('control') !== grant.control ||
            entry.snapshot.state !== 'connected'
          )
            throw new SessionError('ATTACH_INVALID');
          return grant.ingress.receive(bytes).then(
            (result) => {
              if (grant.ingress.stats.faults) this.fail(entry, 'WORKER_FAILED');
              return result;
            },
            () => {
              throw new SessionError('MEDIA_FAILED');
            },
          );
        } catch (error) {
          return Promise.reject(publicSessionError(error));
        }
      },
      session: structuredClone(entry.snapshot),
      get display() {
        return entry.display && { ...entry.display };
      },
      get touch() {
        return entry.touch && { ...entry.touch };
      },
      get resizing() {
        return Boolean(entry.resize);
      },
      get audio() {
        requireAudioLease();
        return entry.audio?.snapshot();
      },
      get audioFailed() {
        requireAudioLease();
        return audioFailed;
      },
      onAudio: (listener) => {
        requireAudioLease();
        if (!entry.audio || typeof listener !== 'function')
          throw new SessionError('MEDIA_NOT_IMPLEMENTED');
        if (entry.audioListener || audioFailed)
          throw new SessionError('MEDIA_FAILED');
        const registration = {
          lease,
          sink: (event: SessionAudioEvent) => {
            try {
              listener(event);
            } catch {
              audioFailed = true;
              if (entry.audioListener === registration)
                delete entry.audioListener;
            }
          },
        };
        entry.audioListener = registration;
        return () => {
          if (entry.audioListener === registration) delete entry.audioListener;
        };
      },
      resizeDisplay: (request) =>
        this.resizeDisplay(entry, channel, lease, request),
      resetAudio: (expectedEpoch) =>
        this.resetAudio(entry, channel, lease, expectedEpoch),
      ...(entry.cursor
        ? {
            cursor: {
              ...entry.cursor,
              ...(entry.cursor.rgba
                ? { rgba: Buffer.from(entry.cursor.rgba) }
                : {}),
            },
          }
        : {}),
      ...(entry.certificate
        ? { certificate: structuredClone(entry.certificate) }
        : {}),
      sendInput: (event) => {
        if (
          channel !== 'control' ||
          entry.attachments.get(channel) !== lease ||
          entry.released
        )
          return Promise.reject(new SessionError('ATTACH_INVALID'));
        if (!entry.worker.sendInput)
          return Promise.reject(new SessionError('INPUT_NOT_IMPLEMENTED'));
        if (entry.snapshot.state !== 'connected')
          return Promise.reject(new SessionError('INPUT_NOT_CONNECTED'));
        if (entry.resize && event.type !== 'reset')
          return Promise.reject(new SessionError('INPUT_DISPLAY_TRANSITION'));
        if (event.type === 'text' && !validInputText(event.text))
          return Promise.reject(new SessionError('INPUT_INVALID'));
        if (event.type === 'touch') {
          try {
            this.checkTouch(entry, event);
          } catch (error) {
            return Promise.reject(error);
          }
        }
        if (entry.inputPending >= 64)
          return Promise.reject(new SessionError('INPUT_QUEUE_FULL'));
        // Queued commands lose authority immediately when this lease is released.
        return this.queueInput(
          entry,
          structuredClone(event),
          () => entry.attachments.get(channel) === lease,
        );
      },
      supportsCodec: (codec) => {
        if (
          channel !== 'media' ||
          entry.attachments.get(channel) !== lease ||
          entry.released
        )
          throw new SessionError('ATTACH_INVALID');
        if (!entry.worker.captureFrame) return false;
        return entry.worker.supportsCodec
          ? entry.worker.supportsCodec(codec)
          : codec === 'jpeg';
      },
      maxFps: (codec) => {
        if (
          channel !== 'media' ||
          entry.attachments.get(channel) !== lease ||
          entry.released
        )
          throw new SessionError('ATTACH_INVALID');
        return codec === 'h264'
          ? entry.videoQuality.h264Fps
          : entry.videoQuality.jpegFps;
      },
      captureFrame: async (sinceRevision, options) => {
        if (
          channel !== 'media' ||
          entry.attachments.get(channel) !== lease ||
          entry.released
        )
          throw new SessionError('ATTACH_INVALID');
        if (!entry.worker.captureFrame)
          throw new SessionError('MEDIA_NOT_IMPLEMENTED');
        if (entry.snapshot.state !== 'connected') return undefined;
        if (capturing) throw new SessionError('MEDIA_FAILED');
        capturing = true;
        try {
          const frame = await entry.worker.captureFrame(sinceRevision, options);
          if (entry.attachments.get(channel) !== lease || entry.released)
            throw new SessionError('ATTACH_INVALID');
          if (
            frame &&
            entry.display &&
            (frame.revision < entry.display.framebufferRevision ||
              frame.width !== entry.display.width ||
              frame.height !== entry.display.height)
          )
            return undefined;
          return frame;
        } finally {
          capturing = false;
        }
      },
      respondCertificate: async (response) => {
        const prompt = entry.certificate;
        if (
          channel !== 'control' ||
          entry.attachments.get(channel) !== lease ||
          entry.snapshot.state !== 'awaiting-user' ||
          !prompt ||
          !entry.worker.decideCertificate ||
          !response ||
          typeof response.accept !== 'boolean' ||
          response.challenge !== prompt.challenge ||
          response.fingerprint !== prompt.fingerprint
        )
          throw new SessionError('CERTIFICATE_PROMPT_STALE');
        delete entry.certificate; // Consume before awaiting backend delivery.
        try {
          await entry.worker.decideCertificate(prompt, response.accept);
        } catch {
          throw new SessionError('CERTIFICATE_PROMPT_STALE');
        }
      },
      release: () => {
        if (entry.attachments.get(channel) === lease) {
          entry.attachments.delete(channel);
          if (channel === 'control') {
            if (entry.clipboardListener?.control === lease)
              delete entry.clipboardListener;
            const clipboard = entry.clipboardGrant;
            if (clipboard?.control === lease)
              void this.retireClipboard(entry, clipboard);
          }
          if (channel === 'media' && entry.microphoneListener?.lease === lease)
            delete entry.microphoneListener;
          const grant = entry.microphoneGrant;
          if (
            grant &&
            ((channel === 'control' && grant.control === lease) ||
              (channel === 'media' && grant.media === lease))
          ) {
            void this.retireMicrophone(entry, grant);
          }
          if (channel === 'media' && entry.audioListener?.lease === lease)
            delete entry.audioListener;
          if (
            channel === 'control' &&
            entry.worker.sendInput &&
            entry.snapshot.state === 'connected'
          )
            void this.queueInput(entry, { type: 'reset' }).catch(() => {});
        }
      },
    };
  }
  private retireClipboard(
    entry: Entry,
    grant: NonNullable<Entry['clipboardGrant']>,
  ): Promise<boolean> {
    if (entry.clipboardGrant === grant) delete entry.clipboardGrant;
    const reservation = {
      control: grant.control,
      promise: entry.clipboardOwnership!.release(grant.grant),
    };
    entry.clipboardRetirement = reservation;
    this.clipboardEvent(entry);
    void reservation.promise.then(() => {
      if (entry.clipboardRetirement === reservation)
        delete entry.clipboardRetirement;
      this.clipboardEvent(entry);
    });
    return reservation.promise;
  }
  private clipboardEvent(entry: Entry): void {
    const listener = entry.clipboardListener;
    if (
      listener &&
      entry.attachments.get('control') === listener.control &&
      !entry.released &&
      !terminal(entry.snapshot.state) &&
      entry.snapshot.state !== 'closing'
    )
      listener.sink(clipboardSnapshot(entry, listener.control));
  }
  private retireMicrophone(
    entry: Entry,
    grant: NonNullable<Entry['microphoneGrant']>,
  ): Promise<boolean> {
    if (entry.microphoneGrant === grant) delete entry.microphoneGrant;
    const reservation = {
      media: grant.media,
      promise: entry.microphoneOwnership!.release(grant.ingress),
    };
    entry.microphoneRetirement = reservation;
    this.microphoneEvent(entry);
    void reservation.promise.then(() => {
      if (entry.microphoneRetirement === reservation)
        delete entry.microphoneRetirement;
      this.microphoneEvent(entry);
    });
    return reservation.promise;
  }
  private microphoneEvent(entry: Entry): void {
    const subscriber = entry.microphoneListener;
    if (
      !subscriber ||
      entry.attachments.get('media') !== subscriber.lease ||
      entry.released
    )
      return;
    const snapshot = microphoneSnapshot(entry, subscriber.lease);
    if (snapshot.state) Object.freeze(snapshot.state);
    subscriber.sink(Object.freeze(snapshot));
  }
  private displayEvent(
    entry: Entry,
    type: 'display.info' | 'display.resize' = 'display.info',
  ): void {
    if (
      !entry.display ||
      entry.snapshot.state !== 'connected' ||
      entry.released
    )
      return;
    this.emit('event', {
      type,
      session: structuredClone(entry.snapshot),
      display: { ...entry.display },
      resizing: Boolean(entry.resize),
    });
  }
  private async resetAudio(
    entry: Entry,
    channel: SessionChannel,
    lease: symbol,
    expectedEpoch: bigint,
  ): Promise<AudioResetResult> {
    const authorized = () => {
      if (
        channel !== 'media' ||
        entry.attachments.get(channel) !== lease ||
        entry.released ||
        terminal(entry.snapshot.state) ||
        entry.snapshot.state === 'closing'
      )
        throw new SessionError('ATTACH_INVALID');
    };
    authorized();
    try {
      encodeAudioReset(expectedEpoch);
    } catch {
      throw new SessionError('MEDIA_FAILED');
    }
    if (!entry.audio || !entry.worker.resetAudio)
      throw new SessionError('MEDIA_NOT_IMPLEMENTED');
    if (entry.snapshot.state !== 'connected') return 'unavailable';
    const state = entry.audio.current;
    if (!state?.enabled) return 'unavailable';
    if (expectedEpoch !== state.epoch) return 'stale';
    if (state.availability !== 'ready') return 'unavailable';
    if (entry.audioReset) return 'busy';
    const reservation = Symbol();
    entry.audioReset = reservation;
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        (async () => {
          authorized();
          const result = await entry.worker.resetAudio!(expectedEpoch);
          authorized();
          if (!['scheduled', 'stale', 'unavailable', 'busy'].includes(result)) {
            this.fail(entry, 'WORKER_INVALID_STATE');
            throw new SessionError('MEDIA_FAILED');
          }
          return result;
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            // Unknown completion cannot leave a live backend able to reset a new lease.
            this.fail(entry, 'WORKER_FAILED');
            reject(new SessionError('MEDIA_FAILED'));
          }, 3000);
        }),
      ]);
    } catch (error) {
      if (error instanceof SessionError) throw error;
      this.fail(entry, 'WORKER_FAILED');
      throw new SessionError('MEDIA_FAILED');
    } finally {
      clearTimeout(timer);
      if (entry.audioReset === reservation) delete entry.audioReset;
    }
  }
  private async resizeDisplay(
    entry: Entry,
    channel: SessionChannel,
    lease: symbol,
    request: DisplayResizeRequest,
  ): Promise<DisplayResizeResult> {
    const authorized = () => {
      if (
        channel !== 'control' ||
        entry.attachments.get(channel) !== lease ||
        entry.released
      )
        throw new SessionError('ATTACH_INVALID');
      if (entry.snapshot.state !== 'connected')
        throw new SessionError('DISPLAY_NOT_CONNECTED');
    };
    authorized();
    const { width, height, deviceScale } = request;
    if (
      Object.keys(request).some(
        (key) => !['width', 'height', 'deviceScale'].includes(key),
      ) ||
      !Number.isInteger(width) ||
      width < 200 ||
      width > 3840 ||
      width % 2 !== 0 ||
      !Number.isInteger(height) ||
      height < 200 ||
      height > 2160 ||
      height % 2 !== 0 ||
      deviceScale !== 1
    )
      throw new SessionError('DISPLAY_INVALID_REQUEST');
    if (!entry.worker.resizeDisplay)
      throw new SessionError('DISPLAY_NOT_IMPLEMENTED');
    if (!entry.dynamicResolution || !entry.display?.negotiated)
      return 'unavailable';
    if (entry.resize) return 'busy';
    const reservation = Symbol();
    const generation = entry.display.generation;
    entry.resize = reservation;
    this.displayEvent(entry);
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        (async () => {
          await entry.inputTail;
          authorized();
          if (entry.worker.sendInput)
            await this.queueInput(
              entry,
              { type: 'reset' },
              () => entry.attachments.get(channel) === lease,
            );
          authorized();
          const result = await entry.worker.resizeDisplay!(width, height);
          authorized();
          if (
            ![
              'applied',
              'unchanged',
              'unavailable',
              'invalid',
              'busy',
              'send-failed',
              'timeout',
              'disconnected',
            ].includes(result) ||
            ((result === 'applied' || result === 'unchanged') &&
              (!entry.display ||
                entry.display.width !== width ||
                entry.display.height !== height ||
                (result === 'applied' &&
                  entry.display.generation <= generation)))
          ) {
            this.fail(entry, 'WORKER_INVALID_STATE');
            throw new SessionError('DISPLAY_FAILED');
          }
          return result;
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            this.fail(entry, 'WORKER_FAILED');
            reject(new SessionError('DISPLAY_FAILED'));
          }, 7000);
        }),
      ]);
    } catch (error) {
      if (error instanceof SessionError) throw error;
      throw new SessionError('DISPLAY_FAILED');
    } finally {
      clearTimeout(timer);
      if (entry.resize === reservation) delete entry.resize;
      this.displayEvent(entry);
    }
  }
  private checkTouch(
    entry: Entry,
    event: Extract<InputEvent, { type: 'touch' }>,
  ): void {
    const { action, contactId, x, y, generation } = event;
    if (
      Object.keys(event).length !== 6 ||
      !validTouchInput({ action, contactId, x, y }) ||
      typeof generation !== 'bigint' ||
      generation < 1n ||
      generation > 0xffffffffffffffffn
    )
      throw new SessionError('INPUT_INVALID');
    if (
      !entry.touchEnabled ||
      !entry.touch?.enabled ||
      entry.touch.availability !== 'ready'
    )
      throw new SessionError('INPUT_TOUCH_UNAVAILABLE');
    const state = entry.touch;
    if (
      entry.resize ||
      generation !== state.generation ||
      (entry.display &&
        (entry.display.generation !== generation ||
          entry.display.width !== state.width ||
          entry.display.height !== state.height))
    )
      throw new SessionError('INPUT_DISPLAY_TRANSITION');
  }
  private queueInput(
    entry: Entry,
    event: InputEvent,
    authorized = () => true,
  ): Promise<void> {
    if (entry.inputPending >= 65) {
      this.fail(entry, 'INPUT_QUEUE_FULL');
      return Promise.reject(new SessionError('INPUT_QUEUE_FULL'));
    }
    entry.inputPending++;
    const delivery = entry.inputTail.then(async () => {
      if (entry.released || entry.snapshot.state !== 'connected') {
        if (event.type === 'text' || event.type === 'touch')
          throw new SessionError('INPUT_NOT_CONNECTED');
        return;
      }
      if (!authorized()) throw new SessionError('ATTACH_INVALID');
      if (event.type === 'touch') this.checkTouch(entry, event);
      await entry.worker.sendInput!(event);
    });
    entry.inputTail = delivery
      .catch((error: unknown) => {
        if (
          !(
            event.type === 'touch' &&
            error instanceof SessionError &&
            error.code === 'INPUT_QUEUE_FULL'
          ) &&
          !(
            error instanceof SessionError &&
            [
              'ATTACH_INVALID',
              'INPUT_DISPLAY_TRANSITION',
              'INPUT_NOT_IMPLEMENTED',
              'INPUT_TOUCH_UNAVAILABLE',
              'INPUT_TOUCH_INVALID_TRANSITION',
            ].includes(error.code)
          )
        )
          this.fail(entry, 'INPUT_FAILED');
      })
      .finally(() => {
        entry.inputPending--;
      });
    return delivery;
  }
  private expireTokens(entry: Entry): void {
    for (const [hash, token] of entry.tokens)
      if (token.expiresAt <= this.options.now()) entry.tokens.delete(hash);
  }
  private prune(): void {
    const now = this.options.now();
    const retained: Entry[] = [];
    for (const entry of this.entries.values()) {
      this.expireTokens(entry);
      if (entry.released) {
        if (entry.snapshot.updatedAt + this.options.retentionMs <= now)
          this.entries.delete(entry.snapshot.sessionId);
        else retained.push(entry);
      }
    }
    while (retained.length > this.options.maxRetained)
      this.entries.delete(retained.shift()!.snapshot.sessionId);
    for (const [key, rate] of this.rates)
      if (rate.until <= now) this.rates.delete(key);
  }
  statistics(): {
    active: number;
    retained: number;
    tokens: number;
    attachments: number;
    rateKeys: number;
    states: Partial<Record<SessionState, number>>;
  } {
    this.prune();
    const result = {
      active: 0,
      retained: 0,
      tokens: 0,
      attachments: 0,
      rateKeys: this.rates.size,
      states: {} as Partial<Record<SessionState, number>>,
    };
    for (const entry of this.entries.values()) {
      if (entry.released) result.retained++;
      else result.active++;
      result.tokens += entry.tokens.size;
      result.attachments += entry.attachments.size;
      result.states[entry.snapshot.state] =
        (result.states[entry.snapshot.state] ?? 0) + 1;
    }
    return result;
  }
  shutdown(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.stopping = true;
    clearInterval(this.sweep);
    this.shutdownPromise = (async () => {
      await Promise.all(
        [...this.entries.values()].map(async (entry) => {
          if (
            !terminal(entry.snapshot.state) &&
            entry.snapshot.state !== 'closing'
          )
            this.transition(entry, 'closing');
          await this.cleanup(entry);
        }),
      );
      this.entries.clear();
      this.rates.clear();
      this.removeAllListeners();
    })();
    return this.shutdownPromise;
  }
}
