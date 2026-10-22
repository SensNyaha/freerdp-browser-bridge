import 'reflect-metadata';
import { Module } from '@nestjs/common';
import type {
  DynamicModule,
  FactoryProvider,
  ModuleMetadata,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
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

export interface RdpBridgeModuleOptions
  extends Omit<RdpBridgePluginOptions, 'onReady'> {
  prefix: string;
  authenticate: NonNullable<RdpBridgePluginOptions['authenticate']>;
}
export interface RdpBridgeModuleAsyncOptions {
  imports?: ModuleMetadata['imports'];
  inject?: FactoryProvider<RdpBridgeModuleOptions>['inject'];
  useFactory: FactoryProvider<RdpBridgeModuleOptions>['useFactory'];
}
type HostServer = HttpServer | HttpsServer;
type Middleware = (
  request: IncomingMessage & { body?: unknown },
  response: ServerResponse,
  next: () => void,
) => void;
interface ExpressHost {
  use(handler: Middleware): unknown;
}
const reservations = new WeakMap<object, Set<string>>();
const optionsToken = Symbol('RDP_BRIDGE_OPTIONS');
const fail = (code: string) => Object.assign(new Error(code), { code });
const server = (value: unknown): HostServer => {
  if (!(value instanceof HttpServer) && !(value instanceof HttpsServer))
    throw fail('NEST_BRIDGE_HTTP1_REQUIRED');
  return value;
};

/** Created by the factory before Nest installs its global body parsers. */
export class RdpBridgeService implements OnModuleInit, OnModuleDestroy {
  private bridge: BridgeHandle | undefined;
  private router: FastifyInstance | undefined;
  private host: HostServer | undefined;
  private automatic:
    | ((request: IncomingMessage, socket: Duplex, head: Buffer) => void)
    | undefined;
  private closing: Promise<void> | undefined;
  private initialization: Promise<void> | undefined;
  private retirement: Promise<void> | undefined;
  private failed = false;
  private release: () => void = () => undefined;
  private readonly prefix: string;
  private readonly manual: boolean;

  private constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly options: RdpBridgeModuleOptions,
  ) {
    this.prefix = options.prefix;
    this.manual = options.upgradeMode === 'manual';
  }

  static create(
    host: HttpAdapterHost,
    options: RdpBridgeModuleOptions,
  ): RdpBridgeService {
    if (process.versions.node.split('.')[0] !== '24')
      throw fail('NEST_BRIDGE_NODE_VERSION');
    if (!options || typeof options.authenticate !== 'function')
      throw fail('NEST_BRIDGE_IDENTITY_REQUIRED');
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
    const adapter = host.httpAdapter;
    if (!adapter || !['express', 'fastify'].includes(adapter.getType()))
      throw fail('NEST_BRIDGE_ADAPTER_UNSUPPORTED');
    const instance: unknown = adapter.getInstance();
    if (!instance || !['object', 'function'].includes(typeof instance))
      throw fail('NEST_BRIDGE_ADAPTER_UNSUPPORTED');
    const key = instance as object;
    const prefixes = reservations.get(key) ?? new Set<string>();
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
    prefixes.add(options.prefix);
    reservations.set(key, prefixes);
    const service = new RdpBridgeService(host, { ...options });
    service.release = () => {
      prefixes.delete(service.prefix);
      if (!prefixes.size) reservations.delete(key);
    };
    try {
      if (adapter.getType() === 'fastify') {
        const fastify = instance as FastifyInstance;
        server(fastify.server);
      } else {
        const express = instance as ExpressHost;
        if (typeof express.use !== 'function')
          throw fail('NEST_BRIDGE_ADAPTER_UNSUPPORTED');
        express.use((request, response, next) => {
          if (service.failed || !service.owns(request.url ?? '')) return next();
          if (!service.router || service.closing) {
            response.writeHead(503, {
              'content-type': 'application/json',
              'cache-control': 'no-store',
            });
            response.end(
              '{"code":"SERVER_CLOSING","message":"Bridge is not accepting requests","retryable":false}',
            );
            return;
          }
          const hasBody =
            request.headers['transfer-encoding'] !== undefined ||
            Number(request.headers['content-length'] ?? 0) > 0;
          if (
            request.body !== undefined ||
            (hasBody && request.readableEnded)
          ) {
            response.writeHead(400, {
              'content-type': 'application/json',
              'cache-control': 'no-store',
            });
            response.end(
              '{"code":"BRIDGE_RAW_BODY_REQUIRED","message":"Bridge requires the raw request body","retryable":false}',
            );
            return;
          }
          service.router.routing(request, response);
        });
      }
      return service;
    } catch {
      service.failed = true;
      service.release();
      throw fail('NEST_BRIDGE_INSTALL_FAILED');
    }
  }

  private owns(target: string): boolean {
    return (
      target.startsWith(this.prefix) &&
      [undefined, '/', '?'].includes(target[this.prefix.length])
    );
  }
  private ready(): BridgeHandle {
    if (!this.bridge) throw fail('NEST_BRIDGE_NOT_READY');
    return this.bridge;
  }
  diagnostics(): ReturnType<BridgeHandle['diagnostics']> {
    return this.ready().diagnostics();
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
  private async install(): Promise<void> {
    if (this.closing) return;
    this.host = server(this.adapterHost.httpAdapter.getHttpServer());
    const adapter = this.adapterHost.httpAdapter;
    // Allocation waits until Nest initialization, after all providers resolve.
    // The early Express middleware above still precedes its default parser.
    const router =
      adapter.getType() === 'fastify'
        ? (adapter.getInstance() as FastifyInstance)
        : Fastify({ logger: false, bodyLimit: 65536 });
    if (adapter.getType() === 'express') this.router = router;
    await router.register(rdpBridgePlugin, {
      ...this.options,
      upgradeMode: 'manual',
      onReady: (handle) => {
        this.bridge = handle;
      },
    });
    if (this.router) await this.router.ready();
    if (!this.bridge) throw fail('NEST_BRIDGE_NOT_READY');
    if (!this.manual && !this.closing) {
      this.automatic = (request, socket, head) => {
        this.handleUpgrade(request, socket, head);
      };
      this.host.on('upgrade', this.automatic);
    }
  }
  onModuleInit(): Promise<void> {
    return (this.initialization ??= this.install().catch(async () => {
      this.failed = true;
      try {
        await this.retire();
      } finally {
        this.release();
      }
      throw fail('NEST_BRIDGE_INSTALL_FAILED');
    }));
  }
  private retire(): Promise<void> {
    return (this.retirement ??= (async () => {
      if (this.automatic) this.host?.off('upgrade', this.automatic);
      try {
        await this.bridge?.close();
        await this.router?.close();
      } catch {
        throw fail('NEST_BRIDGE_CLEANUP_FAILED');
      }
    })());
  }
  close(): Promise<void> {
    return (this.closing ??= (async () => {
      await this.initialization?.catch(() => undefined);
      await this.retire();
    })());
  }
  async onModuleDestroy(): Promise<void> {
    try {
      await this.close();
    } finally {
      this.release();
    }
  }
}

const serviceProvider: FactoryProvider<RdpBridgeService> = {
  provide: RdpBridgeService,
  inject: [HttpAdapterHost, optionsToken],
  useFactory: (host: HttpAdapterHost, options: RdpBridgeModuleOptions) =>
    RdpBridgeService.create(host, options),
};

export class RdpBridgeModule {
  static forRoot(options: RdpBridgeModuleOptions): DynamicModule {
    return {
      module: RdpBridgeModule,
      providers: [
        { provide: optionsToken, useValue: options },
        serviceProvider,
      ],
      exports: [RdpBridgeService],
    };
  }
  static forRootAsync(options: RdpBridgeModuleAsyncOptions): DynamicModule {
    return {
      module: RdpBridgeModule,
      imports: options.imports ?? [],
      providers: [
        {
          provide: optionsToken,
          inject: options.inject ?? [],
          useFactory: async (...values: unknown[]) => {
            try {
              return await options.useFactory(...values);
            } catch {
              throw fail('NEST_BRIDGE_OPTIONS_FAILED');
            }
          },
        },
        serviceProvider,
      ],
      exports: [RdpBridgeService],
    };
  }
}
Module({})(RdpBridgeModule);
