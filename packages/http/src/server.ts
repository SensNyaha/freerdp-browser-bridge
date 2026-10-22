import Fastify, { type FastifyInstance } from 'fastify';
import {
  Server as HttpServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { Server as HttpsServer } from 'node:https';
import type { Duplex } from 'node:stream';
import {
  rdpBridgePlugin,
  type RdpBridgePluginOptions,
  type BridgeHandle,
} from '@freerdp-bridge/api/fastify';

export type BridgeHttpServer = HttpServer | HttpsServer;
export interface RdpBridgeHttpOptions
  extends Omit<RdpBridgePluginOptions, 'onReady'> {
  prefix: string;
  authenticate: NonNullable<RdpBridgePluginOptions['authenticate']>;
}
export interface RdpBridgeHttpHandle {
  /** True transfers this request/response exclusively to the bridge. */
  handleRequest(request: IncomingMessage, response: ServerResponse): boolean;
  /** False leaves foreign socket/head and credentials untouched. */
  handleUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): boolean;
  diagnostics(): ReturnType<BridgeHandle['diagnostics']>;
  /** Joins bridge resources without closing the host listener. */
  close(): Promise<void>;
}

type UpgradeHandler = (
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
) => boolean;
interface HostMounts {
  prefixes: Set<string>;
  closers: Set<() => void>;
  upgrades: Set<UpgradeHandler>;
  onClose: () => void;
  onUpgrade: (request: IncomingMessage, socket: Duplex, head: Buffer) => void;
}
const mounts = new WeakMap<BridgeHttpServer, HostMounts>();
const fail = (code: string) => Object.assign(new Error(code), { code });

class HttpBridge implements RdpBridgeHttpHandle {
  private bridge: BridgeHandle | undefined;
  private readonly router: FastifyInstance;
  private initialization: Promise<void> | undefined;
  private retirement: Promise<void> | undefined;
  private closing: Promise<void> | undefined;
  private removeAutomatic: () => void = () => undefined;
  private removeHostObserver: () => void = () => undefined;
  private addAutomatic: (handler: UpgradeHandler) => () => void = () => {
    throw fail('HTTP_BRIDGE_NOT_READY');
  };
  private observedClosed = false;
  private release: () => void = () => undefined;
  private readonly onHostClose = () => {
    this.observedClosed = true;
    // EventEmitter cannot await a listener. The host must also await close();
    // it receives this same promise, including a sanitized cleanup failure.
    void this.close().catch(() => undefined);
  };

  private constructor(private readonly options: RdpBridgeHttpOptions) {
    this.router = Fastify({ logger: false, bodyLimit: 65536 });
  }

  static async create(
    host: BridgeHttpServer,
    options: RdpBridgeHttpOptions,
  ): Promise<RdpBridgeHttpHandle> {
    if (process.versions.node.split('.')[0] !== '24')
      throw fail('HTTP_BRIDGE_NODE_VERSION');
    const candidate: unknown = host;
    if (
      !(candidate instanceof HttpServer) &&
      !(candidate instanceof HttpsServer)
    )
      throw fail('HTTP_BRIDGE_HTTP1_REQUIRED');
    if (!options || typeof options.authenticate !== 'function')
      throw fail('HTTP_BRIDGE_IDENTITY_REQUIRED');
    if (
      typeof options.prefix !== 'string' ||
      options.prefix.length > 128 ||
      !/^(?:\/[A-Za-z0-9_-]+){1,16}$/.test(options.prefix)
    )
      throw fail('BRIDGE_PREFIX_INVALID');
    if (
      options.upgradeMode !== undefined &&
      !['automatic', 'manual'].includes(options.upgradeMode)
    )
      throw fail('BRIDGE_UPGRADE_MODE_INVALID');
    const existing = mounts.get(host);
    const prefixes = existing?.prefixes ?? new Set<string>();
    if (
      prefixes.size >= 16 ||
      [...prefixes].some(
        (prefix) =>
          prefix === options.prefix ||
          prefix.startsWith(options.prefix + '/') ||
          options.prefix.startsWith(prefix + '/'),
      )
    )
      throw fail('BRIDGE_PREFIX_CONFLICT');
    const value = new HttpBridge({ ...options });
    const closers = existing?.closers ?? new Set<() => void>();
    const upgrades = existing?.upgrades ?? new Set<UpgradeHandler>();
    const state: HostMounts = existing ?? {
      prefixes,
      closers,
      upgrades,
      onClose: () => {
        for (const close of [...closers]) close();
      },
      onUpgrade: (request, socket, head) => {
        for (const upgrade of upgrades)
          if (upgrade(request, socket, head)) return;
      },
    };
    if (!existing) {
      mounts.set(host, state);
      host.once('close', state.onClose);
    }
    prefixes.add(options.prefix);
    closers.add(value.onHostClose);
    value.removeHostObserver = () => {
      closers.delete(value.onHostClose);
    };
    value.addAutomatic = (handler) => {
      upgrades.add(handler);
      if (upgrades.size === 1) host.on('upgrade', state.onUpgrade);
      return () => {
        upgrades.delete(handler);
        if (!upgrades.size) host.off('upgrade', state.onUpgrade);
      };
    };
    let released = false;
    value.release = () => {
      if (released) return;
      released = true;
      value.removeHostObserver();
      prefixes.delete(options.prefix);
      if (!prefixes.size && mounts.get(host) === state) {
        host.off('close', state.onClose);
        host.off('upgrade', state.onUpgrade);
        mounts.delete(host);
      }
    };
    value.initialization = value.install();
    try {
      await value.initialization;
      if (value.observedClosed) {
        await value.close();
        throw fail('HTTP_BRIDGE_HOST_CLOSED');
      }
      return value;
    } catch {
      value.removeHostObserver();
      try {
        await value.retire();
      } finally {
        value.release();
      }
      throw fail('HTTP_BRIDGE_INSTALL_FAILED');
    }
  }

  private owns(url: string): boolean {
    return (
      url.startsWith(this.options.prefix) &&
      [undefined, '/', '?'].includes(url[this.options.prefix.length])
    );
  }

  handleRequest(
    request: IncomingMessage & { body?: unknown },
    response: ServerResponse,
  ): boolean {
    if (!this.owns(request.url ?? '')) return false;
    if (this.closing || !this.bridge) {
      response.writeHead(503, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      });
      response.end(
        '{"code":"SERVER_CLOSING","message":"Bridge is not accepting requests","retryable":false}',
      );
      return true;
    }
    const hasBody =
      request.headers['transfer-encoding'] !== undefined ||
      Number(request.headers['content-length'] ?? 0) > 0;
    if (request.body !== undefined || (hasBody && request.readableEnded)) {
      response.writeHead(400, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      });
      response.end(
        '{"code":"BRIDGE_RAW_BODY_REQUIRED","message":"Bridge requires the raw request body","retryable":false}',
      );
      return true;
    }
    this.router.routing(request, response);
    return true;
  }

  handleUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): boolean {
    if (!this.owns(request.url ?? '')) return false;
    if (!this.bridge) {
      socket.end(
        'HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n',
      );
      return true;
    }
    return this.bridge.handleUpgrade(request, socket, head);
  }

  diagnostics(): ReturnType<BridgeHandle['diagnostics']> {
    if (!this.bridge) throw fail('HTTP_BRIDGE_NOT_READY');
    return this.bridge.diagnostics();
  }

  private async install(): Promise<void> {
    await this.router.register(rdpBridgePlugin, {
      ...this.options,
      upgradeMode: 'manual',
      onReady: (handle) => {
        this.bridge = handle;
      },
    });
    await this.router.ready();
    if (!this.bridge) throw fail('HTTP_BRIDGE_NOT_READY');
    if (!this.closing && this.options.upgradeMode !== 'manual') {
      this.removeAutomatic = this.addAutomatic((request, socket, head) =>
        this.handleUpgrade(request, socket, head),
      );
    }
  }

  private retire(): Promise<void> {
    return (this.retirement ??= (async () => {
      this.removeAutomatic();
      let failed = false;
      try {
        await this.bridge?.close();
      } catch {
        failed = true;
      }
      try {
        await this.router.close();
      } catch {
        failed = true;
      }
      if (failed) throw fail('HTTP_BRIDGE_CLEANUP_FAILED');
    })());
  }

  close(): Promise<void> {
    return (this.closing ??= (async () => {
      this.removeHostObserver();
      try {
        await this.initialization?.catch(() => undefined);
        await this.retire();
      } finally {
        this.release();
      }
    })());
  }
}

/** Prepare routing before listen; the host's one request dispatcher calls handleRequest. */
export function createRdpBridgeHttp(
  host: BridgeHttpServer,
  options: RdpBridgeHttpOptions,
): Promise<RdpBridgeHttpHandle> {
  return HttpBridge.create(host, options);
}
