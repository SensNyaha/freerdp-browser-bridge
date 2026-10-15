import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Writable } from 'node:stream';
import { createSessionServer } from '../apps/bridge-api/dist/session-server.js';
import { NativeSessionWorker } from '../packages/node-bridge/dist/index.js';
import { linuxWorkerResidentBytes } from './linux-process-resident.mjs';
import { soakDurationMs } from './viewer-soak.mjs';

// Disposable lab container only. Docker must publish 47999 to HOST LOOPBACK 47998.
// Private bootstrap carries an ephemeral host bearer, never RDP credentials.
if (process.platform !== 'linux' || process.argv.length !== 2)
  throw new Error('Linux lab server only');
const scratch = Buffer.alloc(1024);
let count = 0;
let bearer;
let soak = false;
try {
  for await (const chunk of process.stdin) {
    if (!Buffer.isBuffer(chunk) || chunk.length > scratch.length - count)
      throw new Error('Invalid bootstrap');
    chunk.copy(scratch, count);
    count += chunk.length;
    chunk.fill(0);
  }
  const value = JSON.parse(scratch.subarray(0, count).toString('utf8'));
  if (
    Object.keys(value).some((key) => !['bearer', 'soak'].includes(key)) ||
    (value.soak !== undefined && typeof value.soak !== 'boolean') ||
    !/^[A-Za-z0-9_-]{43}$/.test(value.bearer ?? '')
  )
    throw new Error('Invalid bootstrap');
  bearer = value.bearer;
  soak = value.soak === true;
} finally {
  scratch.fill(0);
}
const runtimeRoot = await mkdtemp(join(tmpdir(), 'rdp-linux-browser-'));
const worker = { workerPath: resolve('build/bundled/rdp-worker'), runtimeRoot };
let server;
const audioResets = { requested: 0, scheduled: 0 };
let nativeWorker, nativeState;
let finish;
const finished = new Promise((done) => {
  finish = done;
});
let closing;
const close = () =>
  (closing ??= (async () => {
    try {
      await server?.close();
      const cleanup = (await readdir(runtimeRoot)).length === 0;
      if (!cleanup) throw new Error('Runtime not empty');
      await rm(runtimeRoot, { recursive: true, force: true });
      console.log(JSON.stringify({ type: 'lab.server.closed', cleanup }));
    } catch {
      process.exitCode = 1;
      console.log(
        JSON.stringify({ type: 'lab.server.closed', cleanup: false }),
      );
    } finally {
      bearer = undefined;
      finish();
    }
  })());
const timer = setTimeout(
  () => {
    void close();
  },
  (soak ? soakDurationMs : 0) + 90000,
);
process.once('SIGTERM', () => {
  void close();
});
process.once('SIGINT', () => {
  void close();
});
try {
  server = await createSessionServer({
    worker,
    allowedOrigins: ['http://127.0.0.1:47998'],
    authenticate: (request) =>
      request.headers.authorization === 'Bearer ' + bearer
        ? { id: 'authorized-linux-lab' }
        : undefined,
    sessions: {
      maxSessions: 1,
      workerFactory: (limits) => {
        const session = new NativeSessionWorker(worker, limits);
        nativeWorker = session;
        session.onState((state) => {
          nativeState = state;
        });
        session.onFailure(() => {
          nativeState = 'failed';
        });
        const reset = session.resetAudio.bind(session);
        session.resetAudio = async (epoch) => {
          audioResets.requested++;
          const result = await reset(epoch);
          if (result === 'scheduled') audioResets.scheduled++;
          return result;
        };
        return session;
      },
    },
    logDestination: new Writable({
      write(_bytes, _encoding, done) {
        done();
      },
    }),
  });
  const directory = resolve('apps/reference-harness');
  const names = (await readdir(directory)).filter(
    (name) => name === 'index.html' || /^[a-z][a-z0-9-]*\.js$/.test(name),
  );
  if (names.length > 64) throw new Error('Harness file limit');
  for (const name of names) {
    const bytes = await readFile(join(directory, name));
    if (bytes.length > 131072) throw new Error('Harness size limit');
    server.get(
      name === 'index.html' ? '/harness/' : '/harness/' + name,
      (_request, reply) =>
        reply
          .header('Cache-Control', 'no-store')
          .header(
            'Content-Security-Policy',
            "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src blob:",
          )
          .type(name.endsWith('.js') ? 'text/javascript' : 'text/html')
          .send(bytes),
    );
  }
  server.post('/lab/stop', (request, reply) => {
    if (request.headers.authorization !== 'Bearer ' + bearer)
      return reply.code(401).send();
    setImmediate(() => {
      void close();
    });
    return reply.code(202).send({ stopping: true });
  });
  server.get('/lab/stats', (request, reply) => {
    if (request.headers.authorization !== 'Bearer ' + bearer)
      return reply.code(401).send();
    return { ...audioResets };
  });
  server.get('/lab/resources', async (request, reply) => {
    if (request.headers.authorization !== 'Bearer ' + bearer)
      return reply.code(401).send();
    const pid = nativeWorker?.pid;
    if (nativeState !== 'connected' || !pid) return reply.code(503).send();
    try {
      const workerResidentBytes = await linuxWorkerResidentBytes(pid);
      if (nativeState !== 'connected' || nativeWorker.pid !== pid)
        return reply.code(503).send();
      return {
        workerResidentBytes,
        nodeResidentBytes: process.memoryUsage().rss,
      };
    } catch {
      return reply.code(503).send();
    }
  });
  await server.listen({ host: '0.0.0.0', port: 47999 });
  console.log(JSON.stringify({ type: 'lab.server.ready' }));
  await finished;
} catch {
  process.exitCode = 1;
  await close();
} finally {
  clearTimeout(timer);
}
