import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Writable } from 'node:stream';
import { createSessionServer } from '../apps/bridge-api/dist/session-server.js';
import { NativeSessionWorker } from '../packages/node-bridge/dist/index.js';
import { linuxWorkerResidentBytes } from './linux-process-resident.mjs';
import { soakDurationMs } from './viewer-soak.mjs';
import { readLinuxViewerBootstrap } from './linux-viewer-bootstrap.mjs';

// Disposable lab container only. Docker must publish 47999 to HOST LOOPBACK 47998.
// Private bootstrap carries an ephemeral host bearer, never RDP credentials.
if (process.platform !== 'linux' || process.argv.length !== 2)
  throw new Error('Linux lab server only');
let { bearer, soak, htmlClipboard, ipcTransport } =
  await readLinuxViewerBootstrap(process.stdin);
const runtimeRoot = await mkdtemp(join(tmpdir(), 'rdp-linux-browser-'));
const worker = {
  workerPath: resolve(
    process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/bundled',
    'rdp-worker',
  ),
  runtimeRoot,
  ...(htmlClipboard ? { ipcTransport } : {}),
};
let server;
const audioResets = { requested: 0, scheduled: 0 };
const clipboard = {
  writes: 0,
  htmlReads: 0,
  textReads: 0,
  revokes: 0,
  revokeAccepted: false,
};
let nativeWorker, nativeState, nativePid, source;
const clipboardSnapshot = () => ({
  ...clipboard,
  state: nativeState,
  ...(source
    ? {
        source: {
          generation: source.generation.toString(),
          revision: source.revision.toString(),
          maximum: source.maximum,
          ready: source.ready,
          html: source.html,
          remoteText: source.remoteText,
          remoteHtml: source.remoteHtml,
          localPending: source.localPending,
          localAccepted: source.localAccepted,
          localHtmlAccepted: source.localHtmlAccepted,
          remotePending: source.remotePending,
        },
      }
    : {}),
});
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
      let pidRetired = !nativePid;
      if (nativePid) {
        try {
          process.kill(nativePid, 0);
        } catch (error) {
          pidRetired = error.code === 'ESRCH';
        }
      }
      if (htmlClipboard && !pidRetired) throw new Error('Worker not retired');
      await rm(runtimeRoot, { recursive: true, force: true });
      console.log(
        JSON.stringify({
          type: 'lab.server.closed',
          cleanup,
          ...(htmlClipboard
            ? { pidRetired, clipboard: clipboardSnapshot() }
            : {}),
        }),
      );
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
  htmlClipboard ? 180000 : (soak ? soakDurationMs : 0) + 90000,
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
          if (state === 'connected') nativePid = session.pid;
        });
        session.onFailure(() => {
          nativeState = 'failed';
        });
        if (htmlClipboard) {
          session.onClipboard((value) => {
            source = { ...value };
          });
          const write = session.writeClipboardHtml.bind(session),
            htmlRead = session.readClipboardHtml.bind(session),
            textRead = session.readClipboardText.bind(session),
            revoke = session.revokeClipboardText.bind(session);
          session.writeClipboardHtml = (item) => {
            ++clipboard.writes;
            return write(item);
          };
          session.readClipboardHtml = (revision) => {
            ++clipboard.htmlReads;
            return htmlRead(revision);
          };
          session.readClipboardText = (revision) => {
            ++clipboard.textReads;
            return textRead(revision);
          };
          session.revokeClipboardText = () =>
            revoke().then((result) => {
              ++clipboard.revokes;
              if (result === 'accepted') clipboard.revokeAccepted = true;
              return result;
            });
        }
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
  if (htmlClipboard) {
    const index = await readFile(join(directory, 'index.html'), 'utf8'),
      start = index.indexOf('<section id="clipboard-html"'),
      end = index.indexOf('<section id="clipboard-text"');
    if (start < 0 || end <= start)
      throw new Error('HTML reference panel unavailable');
    const fixture = (
      await readFile('tests/fixtures/html-rdp-client.html', 'utf8')
    ).replace('<!--REFERENCE_PANEL-->', index.slice(start, end));
    server.get('/html-lab/', (_request, reply) =>
      reply.type('text/html').send(fixture),
    );
    for (const name of [
      'clipboard-client.js',
      'clipboard-html-view.js',
      'clipboard-html-normalize.js',
      'clipboard-html.js',
      'clipboard-text.js',
      'clipboard-wire.js',
    ]) {
      const bytes = await readFile(join(directory, name));
      server.get('/' + name, (_request, reply) =>
        reply.type('text/javascript').send(bytes),
      );
    }
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
    return htmlClipboard ? clipboardSnapshot() : { ...audioResets };
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
