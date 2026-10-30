import type { FastifyPluginAsync } from 'fastify';
import type { Server } from 'node:http';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import type { TSchema } from '@sinclair/typebox';
import { NativeSessionWorker } from '@freerdp-bridge/node';
import { registerBuildRoutes } from './index.js';
import { createSecureLogger } from './logging.js';
import {
  registerSessionRoutes,
  type SessionServerOptions,
} from './session-server.js';

export {
  NativeSessionWorker,
  SessionManager,
  WorkerProcess,
  SessionError,
  resolveNativeRuntime,
  NativeRuntimeError,
  recoverRuntimeSessions,
  RuntimeRecoveryError,
  resolveManagedFilesPolicy,
  discoverHostDevices,
} from '@freerdp-bridge/node';
export type {
  WorkerOptions,
  SessionCreate,
  Principal,
  NativeRuntimeOptions,
  RuntimeRecoveryOptions,
  RuntimeRecoveryReport,
  ManagedFilesOptions,
  ManagedFilesPolicy,
  HostInventoryRequest,
  HostInventoryReport,
} from '@freerdp-bridge/node';
export { createSecureLogger } from './logging.js';
export type BridgeHandle = Awaited<ReturnType<typeof registerSessionRoutes>>;
export interface RdpBridgePluginOptions extends SessionServerOptions {
  /** Manual mode delegates upgrade selection to the application's one router. */
  upgradeMode?: 'automatic' | 'manual';
  onReady?: (bridge: BridgeHandle) => void | Promise<void>;
}

const mounts = new WeakMap<Server, Set<string>>();
const invalid = (code: string) => Object.assign(new Error(code), { code });

/** Encapsulated Fastify 5 plugin. Never listens or closes the host HTTP server. */
export const rdpBridgePlugin: FastifyPluginAsync<
  RdpBridgePluginOptions
> = async (server, options) => {
  if (process.versions.node.split('.')[0] !== '24')
    throw invalid('BRIDGE_NODE_VERSION');
  if (server.version.split('.')[0] !== '5')
    throw invalid('BRIDGE_FASTIFY_VERSION');
  const prefix = server.prefix;
  if (prefix.length > 128 || !/^(?:\/[A-Za-z0-9_-]+){1,16}$/.test(prefix))
    throw invalid('BRIDGE_PREFIX_INVALID');
  if (
    options.upgradeMode !== undefined &&
    !['automatic', 'manual'].includes(options.upgradeMode)
  )
    throw invalid('BRIDGE_UPGRADE_MODE_INVALID');
  if (options.onReady !== undefined && typeof options.onReady !== 'function')
    throw invalid('BRIDGE_CALLBACK_INVALID');
  if (
    options.allowedOrigins !== undefined &&
    (!Array.isArray(options.allowedOrigins) ||
      options.allowedOrigins.length > 32 ||
      options.allowedOrigins.some((origin) => {
        if (typeof origin !== 'string' || origin.length > 2048) return true;
        try {
          const value = new URL(origin);
          return (
            !['http:', 'https:'].includes(value.protocol) ||
            value.origin !== origin
          );
        } catch {
          return true;
        }
      }))
  )
    throw invalid('BRIDGE_ORIGINS_INVALID');
  const existing = mounts.get(server.server) ?? new Set<string>();
  if (
    existing.size >= 16 ||
    [...existing].some(
      (value) =>
        value === prefix ||
        value.startsWith(prefix + '/') ||
        prefix.startsWith(value + '/'),
    )
  )
    throw invalid('BRIDGE_PREFIX_CONFLICT');
  existing.add(prefix);
  mounts.set(server.server, existing);
  let bridge: BridgeHandle | undefined;
  const release = () => {
    existing.delete(prefix);
    if (!existing.size) mounts.delete(server.server);
  };
  try {
    // Include the scoped not-found path, which has no onRoute logLevel override.
    // Never inherit host request serializers that may record bridge query tokens.
    const requestLogger = createSecureLogger(options.logDestination).child(
      {},
      { level: 'silent' },
    );
    server.setChildLoggerFactory(() => requestLogger);
    // The host's coercion/removeAdditional settings must not weaken bridge validation.
    server.setValidatorCompiler(({ schema }) => {
      const checked = TypeCompiler.Compile(schema as TSchema);
      return (value) =>
        checked.Check(value)
          ? { value }
          : { error: new Error('Invalid bridge request') };
    });
    server.addHook('onRoute', (route) => {
      route.bodyLimit = 65536;
      // Host automatic request serializers must not record bridge URLs/body/tokens.
      route.logLevel = 'silent';
    });
    await registerBuildRoutes(server, options.worker);
    bridge = await registerSessionRoutes(
      server,
      {
        ...options,
        sessions: {
          ...options.sessions,
          workerFactory:
            options.sessions?.workerFactory ??
            ((limits) => new NativeSessionWorker(options.worker, limits)),
        },
      },
      {
        prefix,
        ...(options.upgradeMode ? { upgradeMode: options.upgradeMode } : {}),
      },
    );
    const handle = bridge;
    server.get(
      '/v1/diagnostics',
      { config: { requiresIdentity: true } },
      async () => handle.diagnostics(),
    );
    server.addHook('onClose', async () => release());
    await options.onReady?.(handle);
  } catch {
    await bridge?.close();
    release();
    throw invalid('BRIDGE_INSTALL_FAILED');
  }
};
