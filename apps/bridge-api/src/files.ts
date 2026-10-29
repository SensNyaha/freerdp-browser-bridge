import type { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type, type Static } from '@sinclair/typebox';
import { discardRejectedFileBody } from './file-refusal.js';
import {
  FileError,
  type SessionManager,
  type Principal,
} from '@freerdp-bridge/node';

const token = () => Type.String({ pattern: '^[0-9a-f]{32}$' });
const params = Type.Object({ id: token() }, { additionalProperties: false });
const entryParams = Type.Object(
  { id: token(), fileId: token() },
  { additionalProperties: false },
);
const parent = { parentId: Type.Optional(token()) };
const name = Type.String({ minLength: 1, maxLength: 255 });
const uploadQuery = Type.Object(
  { name, ...parent },
  { additionalProperties: false },
);
const listQuery = Type.Object(
  {
    ...parent,
    cursor: Type.Optional(token()),
    limit: Type.Optional(
      Type.String({ pattern: '^(?:[1-9]|[1-5][0-9]|6[0-4])$' }),
    ),
  },
  { additionalProperties: false },
);
const directoryBody = Type.Object(
  { name, ...parent },
  { additionalProperties: false },
);

/** Abort on a disconnected peer, not on IncomingMessage's normal auto-destroy. */
function peer(request: FastifyRequest, reply: FastifyReply) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const close = () => {
    if (!reply.raw.writableFinished) abort();
  };
  request.raw.once('aborted', abort);
  reply.raw.once('close', close);
  if (request.raw.aborted || reply.raw.destroyed) abort();
  return {
    signal: controller.signal,
    release: () => {
      request.raw.off('aborted', abort);
      reply.raw.off('close', close);
    },
  };
}
function length(request: FastifyRequest): number | undefined {
  const value = request.headers['content-length'];
  if (value === undefined) return;
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]{0,12})$/.test(value))
    throw new FileError('FILE_INVALID');
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new FileError('FILE_INVALID');
  return result;
}
function binary(request: FastifyRequest): void {
  if (
    request.headers['content-type']?.toLowerCase() !==
      'application/octet-stream' ||
    (request.headers['content-encoding'] !== undefined &&
      request.headers['content-encoding'] !== 'identity')
  )
    throw new FileError('FILE_CONTENT_TYPE');
}
function disposition(name: string): string {
  const encoded = encodeURIComponent(name).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
  return `attachment; filename="download.bin"; filename*=UTF-8''${encoded}`;
}
async function chunk(
  stream: Readable,
  signal: AbortSignal,
): Promise<Buffer | undefined> {
  for (;;) {
    if (signal.aborted) throw signal.reason;
    const bytes: unknown = stream.read();
    if (bytes !== null) {
      if (!Buffer.isBuffer(bytes)) throw new FileError('FILE_INVALID');
      return bytes;
    }
    if (stream.readableEnded) return;
    if (stream.destroyed) throw new FileError('FILE_UNAVAILABLE');
    await new Promise<void>((resolve, reject) => {
      const release = () => {
        stream.off('readable', ready);
        stream.off('end', ready);
        stream.off('error', failed);
        stream.off('close', ready);
        signal.removeEventListener('abort', aborted);
      };
      const ready = () => {
        release();
        resolve();
      };
      const failed = () => {
        release();
        reject(new FileError('FILE_UNAVAILABLE'));
      };
      const aborted = () => {
        release();
        reject(signal.reason);
      };
      stream.once('readable', ready);
      stream.once('end', ready);
      stream.once('error', failed);
      stream.once('close', ready);
      signal.addEventListener('abort', aborted, { once: true });
      if (signal.aborted) aborted();
    });
  }
}

/** Register inside the bridge's Fastify scope; the host owns its socket budgets. */
export function registerFileRoutes(
  server: FastifyInstance,
  manager: SessionManager,
  identity: (request: IncomingMessage) => Principal,
  enabled: boolean,
): void {
  if (enabled) {
    // Fastify clones parser registries when it creates an encapsulated scope.
    // Return the stream itself: its rawBody parser would buffer the entire file.
    if (server.hasContentTypeParser('application/octet-stream'))
      server.removeContentTypeParser('application/octet-stream');
    server.addContentTypeParser(
      'application/octet-stream',
      (request, stream, done) => {
        if (
          !(request.routeOptions.config as { fileUpload?: boolean }).fileUpload
        )
          return done(new FileError('FILE_CONTENT_TYPE'));
        done(null, stream);
      },
    );
  }
  server.get<{
    Params: Static<typeof params>;
    Querystring: Static<typeof listQuery>;
  }>(
    '/v1/sessions/:id/files',
    {
      config: { requiresIdentity: true },
      schema: { params, querystring: listQuery },
    },
    async (request, reply) => {
      const files = manager.files(request.params.id, identity(request.raw));
      const client = peer(request, reply);
      try {
        return await files.list(
          request.query.parentId,
          request.query.cursor,
          request.query.limit === undefined ? 64 : Number(request.query.limit),
          client.signal,
        );
      } finally {
        client.release();
      }
    },
  );
  server.post<{
    Params: Static<typeof params>;
    Querystring: Static<typeof uploadQuery>;
    Body: Readable | undefined;
  }>(
    '/v1/sessions/:id/files',
    {
      config: { requiresIdentity: true, fileUpload: true },
      schema: { params, querystring: uploadQuery },
      onRequest: async (request, reply) => {
        // Ownership and admission precede the body parser and any native mutation.
        reply.header('Connection', 'close');
        try {
          const files = manager.files(request.params.id, identity(request.raw));
          binary(request);
          const size = length(request);
          if (size !== undefined && size > files.policy.maxFileBytes)
            throw new FileError('FILE_QUOTA_EXCEEDED');
        } catch (error) {
          await discardRejectedFileBody(request.raw);
          throw error;
        }
      },
    },
    async (request, reply) => {
      const files = manager.files(request.params.id, identity(request.raw));
      const client = peer(request, reply);
      let upload: Awaited<ReturnType<typeof files.upload>> | undefined;
      const observeError = () => {};
      request.body?.on('error', observeError);
      try {
        upload = await files.upload(
          request.query.name,
          request.query.parentId,
          length(request),
          client.signal,
        );
        if (upload.signal.aborted) throw new FileError('FILE_UNAVAILABLE');
        if (request.body !== undefined) {
          if (!(request.body instanceof Readable))
            throw new FileError('FILE_INVALID');
          for (;;) {
            const raw = await chunk(request.body, upload.signal);
            if (raw === undefined) break;
            for (let offset = 0; offset < raw.length; offset += 65536)
              await upload.write(raw.subarray(offset, offset + 65536));
          }
        }
        const result = await upload.finish();
        return reply.code(201).send(result);
      } catch (error) {
        await upload?.abort();
        throw error instanceof FileError
          ? error
          : new FileError('FILE_UNAVAILABLE');
      } finally {
        request.body?.off('error', observeError);
        client.release();
      }
    },
  );
  server.post<{
    Params: Static<typeof params>;
    Body: Static<typeof directoryBody>;
  }>(
    '/v1/sessions/:id/files/directories',
    {
      config: { requiresIdentity: true },
      schema: { params, body: directoryBody },
    },
    async (request, reply) => {
      const files = manager.files(request.params.id, identity(request.raw));
      const client = peer(request, reply);
      try {
        return reply
          .code(201)
          .send(
            await files.mkdir(
              request.body.name,
              request.body.parentId,
              client.signal,
            ),
          );
      } finally {
        client.release();
      }
    },
  );
  server.delete<{ Params: Static<typeof entryParams> }>(
    '/v1/sessions/:id/files/:fileId',
    {
      config: { requiresIdentity: true },
      schema: { params: entryParams },
    },
    async (request, reply) => {
      const files = manager.files(request.params.id, identity(request.raw));
      const client = peer(request, reply);
      try {
        await files.remove(request.params.fileId, client.signal);
        return reply.code(204).send();
      } finally {
        client.release();
      }
    },
  );
  server.get<{ Params: Static<typeof entryParams> }>(
    '/v1/sessions/:id/files/:fileId',
    {
      exposeHeadRoute: false,
      config: { requiresIdentity: true },
      schema: { params: entryParams },
    },
    async (request, reply) => {
      const files = manager.files(request.params.id, identity(request.raw));
      if (request.headers.range !== undefined)
        throw new FileError('FILE_INVALID');
      const client = peer(request, reply);
      let download: Awaited<ReturnType<typeof files.download>>;
      try {
        download = await files.download(request.params.fileId, client.signal);
      } catch (error) {
        client.release();
        throw error;
      }
      const stream = Readable.from(
        (async function* () {
          try {
            let remaining = download.file.size;
            while (remaining > 0) {
              const bytes = await download.read();
              remaining -= bytes.length;
              // The socket may retain this buffer after the iterator resumes.
              yield bytes;
            }
          } finally {
            await download.close();
          }
        })(),
        { objectMode: false, highWaterMark: 65536 },
      );
      const interrupted = () =>
        stream.destroy(new FileError('FILE_UNAVAILABLE'));
      download.signal.addEventListener('abort', interrupted, { once: true });
      stream.once('close', () => {
        client.release();
        download.signal.removeEventListener('abort', interrupted);
        void download.close().catch(() => {});
      });
      if (download.signal.aborted) interrupted();
      return reply
        .type('application/octet-stream')
        .header('Content-Length', download.file.size)
        .header('Content-Disposition', disposition(download.file.name))
        .header('X-Content-Type-Options', 'nosniff')
        .header('Content-Encoding', 'identity')
        .send(stream);
    },
  );
}
