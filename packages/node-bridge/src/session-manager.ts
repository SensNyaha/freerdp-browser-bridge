import { EventEmitter } from 'node:events';
import { createHash, randomBytes } from 'node:crypto';
import {
  validateCursorState,
  validateDisplayState,
  validInputText,
  validTouchInput,
  validateTouchState,
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
} from '@freerdp-bridge/protocol';

const failures = {
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
  terminate(): void;
  onState(listener: (state: SessionState) => void): () => void;
  onFailure(listener: (code?: SessionErrorCode) => void): () => void;
  onCertificate?(listener: (prompt: CertificatePrompt) => void): () => void;
  onCursor?(listener: (cursor: CursorState) => void): () => void;
  onDisplay?(listener: (display: DisplayState) => void): () => void;
  onTouch?(listener: (touch: TouchState) => void): () => void;
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
  workerFactory?: () => SessionWorker;
  maxSessions?: number;
  maxPerPrincipal?: number;
  maxRetained?: number;
  retentionMs?: number;
  startupTimeoutMs?: number;
  shutdownTimeoutMs?: number;
  tokenTtlMs?: number;
  maxTokensPerSession?: number;
  createBurst?: number;
  rateWindowMs?: number;
  maxRateKeys?: number;
  now?: () => number;
}
type Token = { channel: SessionChannel; expiresAt: number };
type Entry = {
  videoQuality: VideoQuality;
  dynamicResolution: boolean;
  touchEnabled: boolean;
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
  private readonly factory: (() => SessionWorker) | undefined;
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
      const worker = this.factory();
      if (
        !worker ||
        typeof worker !== 'object' ||
        this.ownedWorkers.has(worker)
      )
        throw new SessionError('WORKER_START_FAILED');
      this.ownedWorkers.add(worker);
      const entry: Entry = {
        videoQuality: resolveVideoQuality(config.quality),
        dynamicResolution: config.display?.dynamicResolution === true,
        touchEnabled: config.input?.touch === true,
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
        if (terminal(entry.snapshot.state))
          throw new SessionError('WORKER_START_FAILED');
      } catch {
        this.fail(entry, 'WORKER_START_FAILED');
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
    delete entry.certificate;
    delete entry.cursor;
    delete entry.display;
    delete entry.touch;
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
          Promise.resolve().then(() => entry.worker.close()),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error()),
              this.options.shutdownTimeoutMs,
            );
          }),
        ]);
      } catch {
        try {
          entry.worker.terminate();
        } catch {
          /* Trusted backend termination must be best effort. */
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
    return {
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
      resizeDisplay: (request) =>
        this.resizeDisplay(entry, channel, lease, request),
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
