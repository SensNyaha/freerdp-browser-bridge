import Fastify, { LogController } from 'fastify';
import {
  rdpBridgePlugin,
  resolveManagedFilesPolicy,
  type WorkerOptions,
  type SessionCreate,
} from '@freerdp-bridge/api/fastify';
import { createStandaloneAuthenticator } from './auth.js';
import { validateStandaloneConfig, type StandaloneConfig } from './config.js';
import { standaloneTargetAllowed } from './policy.js';
import { installStandaloneBrowser } from './browser.js';

export async function createStandaloneServer(
  input: StandaloneConfig,
  worker: WorkerOptions,
) {
  const config = validateStandaloneConfig(input);
  const filePolicy =
    config.files === undefined
      ? undefined
      : resolveManagedFilesPolicy(config.files);
  const server = Fastify({
    logger: false,
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 65536,
    connectionTimeout: filePolicy
      ? filePolicy.progressTimeoutMs + filePolicy.nativeTimeoutMs + 1000
      : 10000,
    requestTimeout: filePolicy
      ? filePolicy.transferTimeoutMs + filePolicy.nativeTimeoutMs + 1000
      : 10000,
    routerOptions: { maxParamLength: 128 },
  });
  server.server.maxConnections = 128;
  server.setErrorHandler((_error, _request, reply) =>
    reply.code(400).send({ code: 'STANDALONE_REQUEST_REFUSED' }),
  );
  server.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({ code: 'STANDALONE_ROUTE_NOT_FOUND' }),
  );
  server.addHook('preHandler', async (request, reply) => {
    if (
      request.method === 'POST' &&
      request.routeOptions.url === '/rdp/v1/sessions' &&
      !standaloneTargetAllowed(config, request.body as SessionCreate)
    )
      return reply.code(403).send({ code: 'STANDALONE_TARGET_REFUSED' });
  });
  try {
    await installStandaloneBrowser(server);
    await server.register(rdpBridgePlugin, {
      prefix: '/rdp',
      worker,
      authenticate: createStandaloneAuthenticator(config),
      allowedOrigins: config.allowedOrigins,
      sessions: {
        ...config.limits,
        ...(filePolicy ? { files: filePolicy } : {}),
      },
    });
    await server.ready();
    return server;
  } catch {
    await server.close();
    throw new Error('STANDALONE_START_FAILED');
  }
}
