import type { FastifyInstance } from 'fastify';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { Type } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import {
  publicSessionError,
  type SessionManager,
  type SessionEvent,
} from '@freerdp-bridge/node';

const envelope = TypeCompiler.Compile(
  Type.Object(
    {
      v: Type.Literal(1),
      type: Type.String({ minLength: 1, maxLength: 64 }),
      seq: Type.Integer({ minimum: 0, maximum: 0xffffffff }),
      ts: Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
      data: Type.Record(Type.String(), Type.Unknown()),
    },
    { additionalProperties: false },
  ),
);
const knownCommands = new Set([
  'input.key',
  'input.text',
  'input.pointer',
  'input.wheel',
  'input.touch',
  'display.resize.request',
  'clipboard.set',
  'clipboard.request',
  'auth.response',
  'certificate.response',
  'media.request-keyframe',
  'session.detach',
]);
const certificateResponse = TypeCompiler.Compile(
  Type.Object(
    {
      challenge: Type.String({ pattern: '^[1-9][0-9]{0,19}$' }),
      fingerprint: Type.String({ pattern: '^sha256:[0-9a-f]{64}$' }),
      accept: Type.Boolean(),
    },
    { additionalProperties: false },
  ),
);

export function installSessionWebSockets(
  server: FastifyInstance,
  manager: SessionManager,
  origins: ReadonlySet<string>,
) {
  const config = {
    noServer: true as const,
    maxPayload: 4096,
    maxFragments: 64,
    maxBufferedChunks: 128,
    perMessageDeflate: false,
    closeTimeout: 1000,
    handleProtocols: (protocols: Set<string>) =>
      protocols.has('freerdp-bridge-v1') ? 'freerdp-bridge-v1' : false,
  };
  const wss = new WebSocketServer(config);
  const pending = new Set<Duplex>();
  const connections = new Map<
    WebSocket,
    { id: string; release: () => void; sequence: number; alive: boolean }
  >();
  let stopping = false;
  function reject(socket: Duplex, status: number): void {
    socket.end(
      'HTTP/1.1 ' +
        status +
        ' Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n',
    );
    const timer = setTimeout(() => socket.destroy(), 1000);
    timer.unref();
    socket.once('close', () => clearTimeout(timer));
  }
  function send(ws: WebSocket, type: string, data: unknown): void {
    const entry = connections.get(ws);
    if (!entry || ws.readyState !== WebSocket.OPEN) return;
    const payload = JSON.stringify({
      v: 1,
      type,
      seq: entry.sequence++ >>> 0,
      ts: Date.now(),
      data,
    });
    if (ws.bufferedAmount + Buffer.byteLength(payload) > 65536) {
      ws.terminate();
      return;
    }
    ws.send(payload, (error) => {
      if (error) ws.terminate();
    });
  }
  const event = (value: SessionEvent) => {
    for (const [ws, entry] of connections) {
      if (entry.id !== value.session.sessionId) continue;
      send(
        ws,
        value.type,
        value.type === 'session.error'
          ? value.session.error
          : value.type === 'certificate.prompt'
            ? value.certificate
            : value.session,
      );
      if (
        value.session.state === 'closing' ||
        value.session.state === 'closed' ||
        (value.session.state === 'failed' && value.type === 'session.error')
      )
        ws.close(1000, 'session terminal');
    }
  };
  manager.on('event', event);
  server.server.on('upgrade', (request, socket, head) => {
    socket.on('error', () => socket.destroy());
    if (
      stopping ||
      pending.size >= 64 ||
      connections.size >= 64 ||
      head.length > 4096
    ) {
      reject(socket, 503);
      return;
    }
    let url: URL;
    try {
      url = new URL(request.url ?? '', 'http://bridge.invalid');
    } catch {
      reject(socket, 400);
      return;
    }
    const match = /^\/v1\/sessions\/([0-9a-f]{32})\/(control|media)$/.exec(
      url.pathname,
    );
    if (!match || request.method !== 'GET') {
      reject(socket, 404);
      return;
    }
    const origin = request.headers.origin;
    if (!origin || !origins.has(origin) || request.headers.cookie) {
      reject(socket, 403);
      return;
    }
    const protocols = request.headers['sec-websocket-protocol'];
    if (
      !protocols
        ?.split(',')
        .map((item) => item.trim())
        .includes('freerdp-bridge-v1')
    ) {
      reject(socket, 400);
      return;
    }
    if (
      url.searchParams.getAll('token').length > 1 ||
      [...url.searchParams.keys()].some((key) => key !== 'token')
    ) {
      reject(socket, 400);
      return;
    }
    const authorization = request.headers.authorization;
    const query = url.searchParams.get('token');
    if (authorization && query) {
      reject(socket, 400);
      return;
    }
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : query;
    if (!token || token.length !== 43) {
      reject(socket, 401);
      return;
    }
    let lease: ReturnType<SessionManager['attach']>;
    try {
      lease = manager.attach(
        match[1]!,
        token,
        match[2] === 'control' ? 'control' : 'media',
      );
    } catch (error) {
      reject(socket, publicSessionError(error).statusCode);
      return;
    }
    pending.add(socket);
    const timer = setTimeout(() => socket.destroy(), 5000);
    timer.unref();
    socket.once('close', () => {
      clearTimeout(timer);
      pending.delete(socket);
      lease.release();
    });
    try {
      wss.handleUpgrade(request, socket, head, (ws) => {
        clearTimeout(timer);
        pending.delete(socket);
        connections.set(ws, {
          id: lease.session.sessionId,
          release: lease.release,
          sequence: 0,
          alive: true,
        });
        ws.on('error', () => ws.terminate());
        ws.once('close', () => {
          connections.delete(ws);
          lease.release();
        });
        ws.on('pong', () => {
          const value = connections.get(ws);
          if (value) value.alive = true;
        });
        if (match[2] === 'media') {
          send(ws, 'media.unavailable', { code: 'MEDIA_NOT_IMPLEMENTED' });
          ws.close(1003, 'media unavailable');
          return;
        }
        send(ws, 'session.state', lease.session);
        if (lease.certificate)
          send(ws, 'certificate.prompt', lease.certificate);
        let lastSequence = -1;
        let window = Date.now();
        let received = 0;
        ws.on('message', (buffer, binary) => {
          if (Date.now() - window >= 1000) {
            window = Date.now();
            received = 0;
          }
          if (++received > 32) {
            ws.close(1008, 'message rate limit');
            return;
          }
          if (binary || !Buffer.isBuffer(buffer)) {
            ws.close(1003, 'control text required');
            return;
          }
          let data: unknown;
          try {
            data = JSON.parse(buffer.toString('utf8'));
          } catch {
            send(ws, 'session.error', {
              code: 'CONTROL_PROTOCOL_ERROR',
              message: 'Invalid control record',
              retryable: false,
            });
            return;
          }
          if (!envelope.Check(data) || data.seq <= lastSequence) {
            send(ws, 'session.error', {
              code: 'CONTROL_PROTOCOL_ERROR',
              message: 'Invalid control record',
              retryable: false,
            });
            return;
          }
          lastSequence = data.seq;
          if (data.type === 'certificate.response') {
            if (!certificateResponse.Check(data.data)) {
              send(ws, 'session.error', {
                code: 'CONTROL_PROTOCOL_ERROR',
                message: 'Invalid certificate response',
                retryable: false,
              });
            } else {
              void lease.respondCertificate(data.data).catch(() => {
                send(ws, 'session.error', {
                  code: 'CERTIFICATE_PROMPT_STALE',
                  message: 'Certificate prompt is stale or unavailable',
                  retryable: false,
                });
              });
            }
            return;
          }
          if (
            data.type === 'session.detach' &&
            Object.keys(data.data).length === 0
          ) {
            ws.close(1000, 'detached');
            return;
          }
          send(ws, 'session.error', {
            code: knownCommands.has(data.type)
              ? 'CONTROL_NOT_IMPLEMENTED'
              : 'CONTROL_PROTOCOL_ERROR',
            message: 'Control command is unavailable',
            retryable: false,
          });
        });
      });
    } catch {
      clearTimeout(timer);
      pending.delete(socket);
      lease.release();
      socket.destroy();
    }
  });
  const heartbeat = setInterval(() => {
    for (const [ws, value] of connections) {
      if (!value.alive) ws.terminate();
      else {
        value.alive = false;
        ws.ping();
      }
    }
  }, 10000);
  heartbeat.unref();
  wss.on('error', () =>
    server.log.info({ code: 'WS_SERVER_ERROR' }, 'WebSocket server failure'),
  );
  server.addHook('preClose', async () => {
    stopping = true;
    clearInterval(heartbeat);
    manager.off('event', event);
    for (const socket of pending) socket.destroy();
    for (const ws of connections.keys()) ws.terminate();
    await new Promise<void>((done) => wss.close(() => done()));
  });
}
