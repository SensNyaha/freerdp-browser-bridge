import Fastify, { LogController } from 'fastify';
import {
  rdpBridgePlugin,
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
  const server = Fastify({
    logger: false,
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 65536,
    connectionTimeout: 10000,
    requestTimeout: 10000,
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
      sessions: config.limits,
    });
    await server.ready();
    return server;
  } catch {
    await server.close();
    throw new Error('STANDALONE_START_FAILED');
  }
}
