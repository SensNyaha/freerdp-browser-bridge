import { randomBytes } from 'node:crypto';
import { createConnection, createServer, type Server } from 'node:net';
import { performance } from 'node:perf_hooks';

export class RuntimeOwnerError extends Error {
  constructor(
    readonly code: 'RUNTIME_OWNER_INVALID' | 'RUNTIME_OWNER_UNAVAILABLE',
  ) {
    super(code);
  }
}

function address(id: string): string {
  if (typeof id !== 'string' || id.length !== 32 || !/^[0-9a-f]{32}$/.test(id))
    throw new RuntimeOwnerError('RUNTIME_OWNER_INVALID');
  if (process.platform === 'linux') return '\0freerdp-bridge-owner-' + id;
  if (process.platform === 'win32')
    return '\\\\.\\pipe\\freerdp-bridge-owner-' + id;
  throw new RuntimeOwnerError('RUNTIME_OWNER_UNAVAILABLE');
}

/** Internal OS-held lifetime marker; its identifier is nonsecret metadata. */
export class RuntimeOwner {
  private closing?: Promise<void>;
  private closingRequested = false;
  private unavailable = false;
  private listeners = new Set<() => void>();

  private constructor(
    readonly id: string,
    private readonly server: Server,
  ) {
    server.on('error', () => this.lost());
    server.on('close', () => {
      if (!this.closingRequested) this.lost();
    });
  }

  private lost(): void {
    if (this.unavailable || this.closingRequested) return;
    this.unavailable = true;
    for (const callback of this.listeners) callback();
    this.listeners.clear();
  }

  onLost(callback: () => void): () => void {
    if (this.listeners.size === 1)
      throw new RuntimeOwnerError('RUNTIME_OWNER_INVALID');
    if (this.unavailable) callback();
    else if (!this.closingRequested) this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  static async open(): Promise<RuntimeOwner> {
    const id = randomBytes(16).toString('hex');
    // Never consume peer input. Connection itself is conservative evidence of
    // an owner; readiness failure is not proof that a directory is abandoned.
    const server = createServer({ pauseOnConnect: true }, (socket) =>
      socket.destroy(),
    );
    server.maxConnections = 16;
    const due = performance.now() + 1000;
    try {
      await new Promise<void>((resolve, reject) => {
        const fail = () => {
          clearTimeout(timer);
          reject(new RuntimeOwnerError('RUNTIME_OWNER_UNAVAILABLE'));
        };
        const timer = setTimeout(fail, 1000);
        server.once('error', fail);
        server.listen({ path: address(id), backlog: 16 }, () => {
          clearTimeout(timer);
          server.removeListener('error', fail);
          if (performance.now() >= due) {
            reject(new RuntimeOwnerError('RUNTIME_OWNER_UNAVAILABLE'));
            return;
          }
          resolve();
        });
      });
      server.unref();
      return new RuntimeOwner(id, server);
    } catch {
      server.on('error', () => {});
      server.close();
      throw new RuntimeOwnerError('RUNTIME_OWNER_UNAVAILABLE');
    }
  }

  close(): Promise<void> {
    if (!this.closing) {
      this.closingRequested = true;
      this.listeners.clear();
      this.closing = new Promise<void>((resolve, reject) => {
        this.server.close((error) => {
          if (
            error &&
            (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING'
          )
            reject(new RuntimeOwnerError('RUNTIME_OWNER_UNAVAILABLE'));
          else resolve();
        });
      });
    }
    return this.closing;
  }
}

export type RuntimeOwnerStatus = 'live' | 'absent' | 'unknown';

/** Errors/timeouts/cancellation never authorize recovery. Join socket closure. */
export function probeRuntimeOwner(
  id: string,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<RuntimeOwnerStatus> {
  const endpoint = address(id);
  const timeoutMs = options.timeoutMs ?? 500;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5000)
    throw new RuntimeOwnerError('RUNTIME_OWNER_INVALID');
  if (options.signal?.aborted) return Promise.resolve('unknown');
  return new Promise((resolve) => {
    const due = performance.now() + timeoutMs;
    const socket = createConnection({ path: endpoint });
    let result: RuntimeOwnerStatus | undefined;
    const finish = (value: RuntimeOwnerStatus) => {
      if (options.signal?.aborted || performance.now() >= due)
        value = 'unknown';
      result ??= value;
      socket.destroy();
    };
    const cancel = () => finish('unknown');
    const timer = setTimeout(cancel, timeoutMs);
    options.signal?.addEventListener('abort', cancel, { once: true });
    socket.once('connect', () => finish('live'));
    socket.once('error', (error: NodeJS.ErrnoException) =>
      finish(
        error.code === 'ENOENT' || error.code === 'ECONNREFUSED'
          ? 'absent'
          : 'unknown',
      ),
    );
    socket.once('close', () => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
      resolve(result ?? 'unknown');
    });
  });
}
