import type { IncomingMessage } from 'node:http';
import { LogController } from 'fastify';
import { Type, type Static } from '@sinclair/typebox';
import {
  SessionManager,
  SessionError,
  publicSessionError,
  type Principal,
  type SessionManagerOptions,
  type WorkerOptions,
} from '@freerdp-bridge/node';
import { createBuildServer } from './index.js';
import { createSecureLogger } from './logging.js';
import type { DestinationStream } from 'pino';
import { SessionCreateSchema } from '@freerdp-bridge/config';
import { createSessionMetrics } from './metrics.js';
import { installSessionWebSockets } from './websockets.js';

export interface SessionServerOptions {
  worker: WorkerOptions;
  /** Host-provided bearer/mTLS identity hook. Cookie authentication is not accepted in this slice. */
  authenticate?: (
    request: IncomingMessage,
  ) => Principal | undefined | Promise<Principal | undefined>;
  allowedOrigins?: string[];
  sessions?: SessionManagerOptions;
  logDestination?: DestinationStream;
}
const paramsSchema = Type.Object(
  { id: Type.String({ pattern: '^[0-9a-f]{32}$' }) },
  { additionalProperties: false },
);
const tokenSchema = Type.Object(
  {
    channel: Type.Union([Type.Literal('control'), Type.Literal('media')]),
    role: Type.Optional(Type.Literal('controller')),
  },
  { additionalProperties: false },
);
const sessionResponse = Type.Object(
  {
    sessionId: Type.String({ pattern: '^[0-9a-f]{32}$' }),
    state: Type.Union(
      [
        'created',
        'starting',
        'connecting',
        'awaiting-user',
        'connected',
        'reconnecting',
        'closing',
        'closed',
        'failed',
      ].map((state) => Type.Literal(state)),
    ),
    createdAt: Type.Integer({ minimum: 0 }),
    updatedAt: Type.Integer({ minimum: 0 }),
    error: Type.Optional(
      Type.Object(
        {
          code: Type.String(),
          message: Type.String(),
          retryable: Type.Boolean(),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);
const tokenResponse = Type.Object(
  {
    token: Type.String({ pattern: '^[A-Za-z0-9_-]{43}$', secret: true }),
    expiresAt: Type.Integer({ minimum: 0 }),
    channel: Type.Union([Type.Literal('control'), Type.Literal('media')]),
    role: Type.Literal('controller'),
  },
  { additionalProperties: false },
);
const createResponse = Type.Object(
  {
    ...sessionResponse.properties,
    attach: Type.Object(
      { control: tokenResponse, media: tokenResponse },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export async function createSessionServer(options: SessionServerOptions) {
  const allowedOrigins = new Set(options.allowedOrigins ?? []);
  for (const origin of allowedOrigins) {
    const parsed = new URL(origin);
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.origin !== origin
    )
      throw new Error('Allowed origins must be exact HTTP(S) origins');
  }
  const logger = createSecureLogger(options.logDestination);
  const server = await createBuildServer(options.worker, {
    loggerInstance: logger,
    logController: new LogController({ disableRequestLogging: true }),
    ajv: {
      customOptions: {
        keywords: ['secret'],
        removeAdditional: false,
        coerceTypes: false,
        useDefaults: false,
      },
    },
    connectionTimeout: 10000,
    requestTimeout: 10000,
    clientErrorHandler: (_error, socket) => {
      socket.end(
        'HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n',
      );
    },
  });
  server.server.maxConnections = 128;
  const manager = new SessionManager(options.sessions);
  const identities = new WeakMap<IncomingMessage, Principal>();
  const metrics = createSessionMetrics(manager);
  server.addHook('onRequest', async (request) => {
    const route = request.routeOptions.config as { requiresIdentity?: boolean };
    if (!route.requiresIdentity) return;
    if (request.headers.cookie || !options.authenticate)
      throw new SessionError('AUTH_REQUIRED');
    const origin = request.headers.origin;
    if (origin && !allowedOrigins.has(origin)) {
      const error = new SessionError('AUTH_REQUIRED');
      throw error;
    }
    let timer: NodeJS.Timeout | undefined;
    try {
      const principal = await Promise.race([
        Promise.resolve().then(() => options.authenticate!(request.raw)),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new SessionError('AUTH_REQUIRED')),
            5000,
          );
        }),
      ]);
      if (
        !principal ||
        typeof principal.id !== 'string' ||
        !principal.id ||
        principal.id.length > 256
      )
        throw new SessionError('AUTH_REQUIRED');
      identities.set(request.raw, { id: principal.id });
    } catch {
      throw new SessionError('AUTH_REQUIRED');
    } finally {
      if (timer) clearTimeout(timer);
    }
  });
  const identity = (request: IncomingMessage) => {
    const principal = identities.get(request);
    if (!principal) throw new SessionError('AUTH_REQUIRED');
    return principal;
  };
  server.setErrorHandler((error, request, reply) => {
    let safe = publicSessionError(error);
    if (typeof error === 'object' && error !== null && 'code' in error) {
      if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
        reply.code(413).send({
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Request body exceeds its limit',
          retryable: false,
        });
        return;
      }
      if (error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
        reply.code(415).send({
          code: 'UNSUPPORTED_CONTENT_TYPE',
          message: 'Request content type is unsupported',
          retryable: false,
        });
        return;
      }
      if (
        error.code === 'FST_ERR_VALIDATION' ||
        error.code === 'FST_ERR_CTP_INVALID_JSON_BODY' ||
        error.code === 'FST_ERR_CTP_EMPTY_JSON_BODY'
      )
        safe = new SessionError('INVALID_SESSION_CONFIG');
    }
    request.log.info({ code: safe.code }, 'request rejected');
    reply
      .header('Cache-Control', 'no-store')
      .code(safe.statusCode)
      .send(safe.failure);
  });
  server.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({
      code: 'NOT_FOUND',
      message: 'Endpoint was not found',
      retryable: false,
    });
  });
  server.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });
  server.post(
    '/v1/sessions',
    {
      config: { requiresIdentity: true },
      schema: { body: SessionCreateSchema, response: { 202: createResponse } },
    },
    async (request, reply) => {
      const principal = identity(request.raw);
      const session = manager.create(request.body, principal, request.ip);
      const control = manager.mintToken(
        session.sessionId,
        principal,
        'control',
      );
      const media = manager.mintToken(session.sessionId, principal, 'media');
      return reply.code(202).send({ ...session, attach: { control, media } });
    },
  );
  server.get<{ Params: Static<typeof paramsSchema> }>(
    '/v1/sessions/:id',
    {
      config: { requiresIdentity: true },
      schema: { params: paramsSchema, response: { 200: sessionResponse } },
    },
    async (request) => manager.get(request.params.id, identity(request.raw)),
  );
  server.delete<{ Params: Static<typeof paramsSchema> }>(
    '/v1/sessions/:id',
    {
      config: { requiresIdentity: true },
      schema: { params: paramsSchema, response: { 200: sessionResponse } },
    },
    async (request) => manager.close(request.params.id, identity(request.raw)),
  );
  server.post<{
    Params: Static<typeof paramsSchema>;
    Body: Static<typeof tokenSchema>;
  }>(
    '/v1/sessions/:id/attach-token',
    {
      config: { requiresIdentity: true },
      schema: {
        params: paramsSchema,
        body: tokenSchema,
        response: { 200: tokenResponse },
      },
    },
    async (request) =>
      manager.mintToken(
        request.params.id,
        identity(request.raw),
        request.body.channel,
      ),
  );
  server.get(
    '/metrics',
    { config: { requiresIdentity: true } },
    async (request, reply) => {
      identity(request.raw);
      return reply.type(metrics.contentType).send(await metrics.render());
    },
  );
  installSessionWebSockets(server, manager, allowedOrigins, metrics.media);
  server.addHook('onClose', async () => {
    await manager.shutdown();
  });
  return server;
}
