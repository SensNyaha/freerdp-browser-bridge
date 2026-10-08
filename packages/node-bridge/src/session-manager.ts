import { EventEmitter } from 'node:events';
import { createHash, randomBytes } from 'node:crypto';
import {
  ConfigError,
  validateSessionConfig,
  type SessionCreate,
} from '@freerdp-bridge/config';
import type { BridgeFailure, SessionState } from '@freerdp-bridge/protocol';

const failures = {
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
  type: 'session.state' | 'session.error';
  session: SessionSnapshot;
}
/** Trusted backend boundary. Stage 3 supplies native config/state IPC; tests use explicit fakes. */
export interface SessionWorker {
  start(config: SessionCreate, signal: AbortSignal): Promise<void>;
  close(): Promise<void>;
  terminate(): void;
  onState(listener: (state: SessionState) => void): () => void;
  onFailure(listener: () => void): () => void;
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
  owner: string;
  snapshot: SessionSnapshot;
  worker: SessionWorker;
  abort: AbortController;
  unsubscribers: Array<() => void>;
  tokens: Map<string, Token>;
  attachments: Map<SessionChannel, symbol>;
  released: boolean;
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
      };
      this.entries.set(entry.snapshot.sessionId, entry);
      this.totals.created++;
      try {
        entry.unsubscribers.push(
          worker.onState((state) => this.workerState(entry, state)),
        );
        entry.unsubscribers.push(
          worker.onFailure(() => this.fail(entry, 'WORKER_FAILED')),
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
          error instanceof SessionError && error.code === 'WORKER_START_TIMEOUT'
            ? 'WORKER_START_TIMEOUT'
            : 'WORKER_START_FAILED',
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
    for (const unsubscribe of entry.unsubscribers.splice(0)) unsubscribe();
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
  ): { release: () => void; session: SessionSnapshot } {
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
    return {
      session: structuredClone(entry.snapshot),
      release: () => {
        if (entry.attachments.get(channel) === lease)
          entry.attachments.delete(channel);
      },
    };
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
