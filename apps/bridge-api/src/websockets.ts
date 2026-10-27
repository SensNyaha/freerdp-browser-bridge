import type { FastifyInstance } from 'fastify';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { Type } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import { installMedia } from './media.js';
import { installClipboard } from './clipboard.js';
import { displayData } from './display.js';
import { normalizeInput } from './input.js';
import type { MediaMetrics } from './metrics.js';
import type {
  CursorState,
  DisplayState,
  TouchState,
  SessionState,
} from '@freerdp-bridge/protocol';
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
  'input.reset',
  'input.sync',
  'display.resize.request',
  'clipboard.set',
  'clipboard.request',
  'clipboard.html.set',
  'clipboard.html.request',
  'clipboard.image.set',
  'clipboard.image.request',
  'clipboard.ack',
  'auth.response',
  'certificate.response',
  'media.request-keyframe',
  'session.detach',
  'session.diagnostics.request',
]);
function touchData(state: TouchState) {
  return {
    ...state,
    revision: state.revision.toString(),
    generation: state.generation.toString(),
  };
}
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
const displayRequest = TypeCompiler.Compile(
  Type.Object(
    {
      width: Type.Integer({ minimum: 200, maximum: 3840 }),
      height: Type.Integer({ minimum: 200, maximum: 2160 }),
      deviceScale: Type.Number({ minimum: 0.1, maximum: 4 }),
    },
    { additionalProperties: false },
  ),
);

export function installSessionWebSockets(
  server: FastifyInstance,
  manager: SessionManager,
  origins: ReadonlySet<string>,
  mediaMetrics: MediaMetrics,
  options: { prefix?: string; upgradeMode?: 'automatic' | 'manual' } = {},
) {
  const prefix = options.prefix ?? '';
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
    {
      id: string;
      release: () => void;
      sequence: number;
      alive: boolean;
      channel: 'control' | 'media';
      state: SessionState;
      cursor?: (state: CursorState) => void;
      display?: (state: DisplayState, resizing: boolean) => void;
    }
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
      entry.state = value.session.state;
      if (value.type === 'cursor.state' && value.cursor) {
        if (entry.channel === 'control') sendCursor(ws, value.cursor);
        else entry.cursor?.(value.cursor);
        continue;
      }
      if (value.display) {
        if (entry.channel === 'control')
          send(ws, value.type, displayData(value.display, value.resizing));
        else entry.display?.(value.display, value.resizing ?? false);
        continue;
      }
      if (value.touch) {
        if (entry.channel === 'control')
          send(ws, 'touch.info', touchData(value.touch));
        continue;
      }
      if (entry.channel === 'control')
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
  function sendCursor(ws: WebSocket, cursor: CursorState) {
    send(ws, 'cursor.visibility', {
      visible: cursor.visible,
      default: cursor.default,
      shapeId: cursor.shapeId.toString(),
    });
    if (cursor.positioned)
      send(ws, 'cursor.position', { x: cursor.x, y: cursor.y });
  }
  manager.on('event', event);
  const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    socket.on('error', () => socket.destroy());
    if (
      stopping ||
      pending.size >= 64 ||
      connections.size >= 64 ||
      head.length > 4096 ||
      (request.url?.length ?? 0) > 8192
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
      url.pathname.slice(prefix.length),
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
          channel: match[2] === 'control' ? 'control' : 'media',
          state: lease.session.state,
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
          const media = installMedia(
            ws,
            lease,
            (type, data) => send(ws, type, data),
            mediaMetrics,
          );
          connections.get(ws)!.cursor = media.cursor;
          connections.get(ws)!.display = media.display;
          return;
        }
        send(ws, 'session.state', lease.session);
        const clipboard = installClipboard(ws, lease, (type, data) =>
          send(ws, type, data),
        );
        if (lease.display)
          send(ws, 'display.info', displayData(lease.display, lease.resizing));
        if (lease.cursor) sendCursor(ws, lease.cursor);
        if (lease.touch) send(ws, 'touch.info', touchData(lease.touch));
        if (lease.certificate)
          send(ws, 'certificate.prompt', lease.certificate);
        let lastSequence = -1;
        let window = Date.now();
        let received = 0;
        let commands = 0;
        let binaryReceived = 0;
        ws.on('message', (buffer, binary) => {
          if (Date.now() - window >= 1000) {
            window = Date.now();
            received = 0;
            commands = 0;
            binaryReceived = 0;
          }
          if (++received > 256) {
            ws.close(1008, 'message rate limit');
            return;
          }
          if (binary && Buffer.isBuffer(buffer) && clipboard) {
            if (++binaryReceived > 128) {
              buffer.fill(0);
              clipboard.dispose();
              lease.release();
              ws.close(1008, 'clipboard message rate limit');
            } else clipboard.binary(buffer);
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
          if (data.type === 'session.diagnostics.request') {
            if (Object.keys(data.data).length !== 0 || ++commands > 32) {
              ws.close(1008, 'invalid diagnostics request');
              return;
            }
            send(ws, 'session.diagnostics', {
              schema: 1,
              requestSeq: data.seq,
              sessionId: lease.session.sessionId,
              state: connections.get(ws)?.state,
              bufferedBytes: ws.bufferedAmount,
              display: lease.display
                ? {
                    width: lease.display.width,
                    height: lease.display.height,
                  }
                : undefined,
            });
            return;
          }
          if (
            [
              'input.key',
              'input.text',
              'input.pointer',
              'input.wheel',
              'input.reset',
              'input.sync',
              'input.touch',
            ].includes(data.type)
          ) {
            if (data.type === 'input.text' && ++commands > 32) {
              ws.close(1008, 'message rate limit');
              return;
            }
            const input = normalizeInput(data.type, data.data);
            if (!input) {
              send(ws, 'session.error', {
                code: 'CONTROL_PROTOCOL_ERROR',
                message: 'Invalid input record',
                retryable: false,
              });
              ws.close(1008, 'invalid input');
            } else {
              const requestSeq = data.seq;
              void lease
                .sendInput(input)
                .then(() => {
                  if (input.type === 'text')
                    send(ws, 'input.text.result', {
                      requestSeq,
                      status: 'sent',
                    });
                })
                .catch((error: unknown) => {
                  if (ws.readyState !== WebSocket.OPEN) return;
                  const failure = publicSessionError(error).failure;
                  if (
                    input.type === 'touch' &&
                    [
                      'INPUT_DISPLAY_TRANSITION',
                      'INPUT_TOUCH_UNAVAILABLE',
                      'INPUT_TOUCH_INVALID_TRANSITION',
                      'INPUT_QUEUE_FULL',
                    ].includes(failure.code)
                  ) {
                    send(ws, 'input.touch.paused', {
                      requestSeq,
                      code: failure.code,
                    });
                    return;
                  }
                  if (input.type === 'text') {
                    send(ws, 'input.text.result', {
                      requestSeq,
                      status:
                        failure.code === 'INPUT_DISPLAY_TRANSITION'
                          ? 'paused'
                          : failure.code === 'INPUT_NOT_IMPLEMENTED'
                            ? 'unavailable'
                            : 'failed',
                    });
                    if (
                      [
                        'INPUT_DISPLAY_TRANSITION',
                        'INPUT_NOT_IMPLEMENTED',
                      ].includes(failure.code)
                    )
                      return;
                  }
                  if (failure.code === 'INPUT_DISPLAY_TRANSITION') {
                    send(ws, 'input.paused', failure);
                    return;
                  }
                  send(ws, 'session.error', failure);
                  ws.close(1008, 'input unavailable');
                });
            }
            return;
          }
          if (++commands > 32) {
            ws.close(1008, 'message rate limit');
            return;
          }
          if (clipboard?.command(data.type, data.seq, data.data)) return;
          if (data.type === 'display.resize.request') {
            const requestSeq = data.seq;
            if (!displayRequest.Check(data.data)) {
              send(ws, 'display.resize.result', {
                requestSeq,
                status: 'invalid',
                error: {
                  code: 'DISPLAY_INVALID_REQUEST',
                  message: 'Display layout is invalid or unsupported',
                  retryable: false,
                },
              });
            } else {
              void lease
                .resizeDisplay(data.data)
                .then((status) => {
                  send(ws, 'display.resize.result', { requestSeq, status });
                })
                .catch((error: unknown) => {
                  const failure = publicSessionError(error).failure;
                  const status =
                    failure.code === 'DISPLAY_INVALID_REQUEST'
                      ? 'invalid'
                      : failure.code === 'DISPLAY_NOT_IMPLEMENTED'
                        ? 'unavailable'
                        : ['ATTACH_INVALID', 'DISPLAY_NOT_CONNECTED'].includes(
                              failure.code,
                            )
                          ? 'disconnected'
                          : 'send-failed';
                  send(ws, 'display.resize.result', {
                    requestSeq,
                    status,
                    error: failure,
                  });
                });
            }
            return;
          }
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
  };
  const handleUpgrade = (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): boolean => {
    // Do not inspect tokens, install listeners or touch another application's socket.
    const target = request.url ?? '';
    if (
      prefix &&
      (!target.startsWith(prefix) ||
        ![undefined, '/', '?'].includes(target[prefix.length]))
    )
      return false;
    upgrade(request, socket, head);
    return true;
  };
  if (options.upgradeMode !== 'manual')
    server.server.on('upgrade', handleUpgrade);
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
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> =>
    (closing ??= (async () => {
      stopping = true;
      server.server.off('upgrade', handleUpgrade);
      clearInterval(heartbeat);
      manager.off('event', event);
      for (const socket of pending) socket.destroy();
      for (const ws of connections.keys()) ws.terminate();
      await new Promise<void>((done) => wss.close(() => done()));
    })());
  return {
    handleUpgrade,
    close,
    diagnostics: () => ({
      connections: connections.size,
      pendingUpgrades: pending.size,
    }),
  };
}
