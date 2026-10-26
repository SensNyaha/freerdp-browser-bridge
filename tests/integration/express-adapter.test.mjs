import test from 'node:test';
import express from 'express';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Writable } from 'node:stream';
import { createServer, request as httpRequest } from 'node:http';
import { createServer as createHttp2Server } from 'node:http2';
import {
  createServer as createHttpsServer,
  request as httpsRequest,
} from 'node:https';
import { createRdpBridgeExpress } from '../../packages/express/dist/index.js';
import { fakeFactory, eventually } from '../fixtures/session-worker.mjs';
import { createRdpTlsFixture } from '../fixtures/rdp-tls.mjs';
import { listenBrowserHttp } from '../fixtures/browser-port.mjs';

const { WebSocket, WebSocketServer } = createRequire(
  new URL('../../apps/bridge-api/package.json', import.meta.url),
)('ws');
const workerPath = resolve(
  process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
  'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
);
const linked = JSON.parse(
  execFileSync(workerPath, ['--capabilities'], {
    encoding: 'utf8',
    windowsHide: true,
  }),
).capabilities.connectCore;
const origin = 'https://app.example.test';
const authHeaders = { authorization: 'Bearer verified-http-owner' };
const config = {
  target: { host: 'synthetic.invalid' },
  auth: { username: 'synthetic', password: 'private-http-fixture-password' },
};
const closeServer = (server) =>
  server.listening
    ? new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    : Promise.resolve();

function waitMessage(socket, select) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('message', message);
      socket.off('close', closed);
    };
    const closed = () => {
      cleanup();
      reject(Error('Fixture socket closed before expected record'));
    };
    const message = (bytes, binary) => {
      try {
        const result = select(bytes, binary);
        if (result !== undefined) {
          cleanup();
          resolve(result);
        }
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(Error('Fixture socket record deadline'));
    }, 5000);
    socket.on('message', message);
    socket.once('close', closed);
  });
}

async function withHost(mode, run, native = false) {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'http-rdp-'));
  const logs = [];
  const stream = new Writable({
    write(bytes, _encoding, done) {
      logs.push(bytes.toString());
      done();
    },
  });
  const factory = fakeFactory();
  const make = factory.workerFactory;
  factory.workerFactory = () => {
    const worker = make();
    worker.supportsCodec = (codec) => codec === 'jpeg';
    worker.captureFrame = async (since) => ({
      revision: 1n,
      timestampUs: 1n,
      width: 640,
      height: 480,
      jpeg: since === 1n ? undefined : Buffer.from('ffd8ffd9', 'hex'),
    });
    return worker;
  };
  let bridge;
  const app = express();
  const server = createServer(app);
  app.use((request, response, next) =>
    bridge.middleware(request, response, next),
  );
  app.use(express.json({ limit: '1mb' }));
  app.get('/host', (_request, response) => response.json({ host: true }));
  app.post('/echo', (request, response) =>
    response.json({ characters: request.body.value.length }),
  );
  server.maxConnections = 777;
  const baselineUpgrade = server.listenerCount('upgrade');
  const baselineClose = server.listenerCount('close');
  const siblings = new WebSocketServer({ noServer: true });
  const sockets = [];
  const dispatch = (request, socket, head) => {
    if (mode === 'manual' && bridge.handleUpgrade(request, socket, head))
      return;
    if (request.url === '/host-ws')
      siblings.handleUpgrade(request, socket, head, (ws) =>
        ws.send('host-alive'),
      );
  };
  server.on('upgrade', dispatch);
  try {
    bridge = await createRdpBridgeExpress(server, {
      prefix: '/rdp',
      worker: { workerPath, runtimeRoot },
      upgradeMode: mode,
      allowedOrigins: [origin],
      logDestination: stream,
      authenticate(request) {
        assert.equal(request.body, undefined);
        return request.headers.authorization === authHeaders.authorization
          ? { id: 'owner' }
          : undefined;
      },
      ...(!native ? { sessions: factory } : {}),
    });
    assert.equal(server.listening, false);
    assert.equal(server.maxConnections, 777);
    await listenBrowserHttp(server);
    const base = 'http://127.0.0.1:' + server.address().port;
    const request = (path, method = 'GET', payload, headers = {}) =>
      fetch(base + path, {
        method,
        headers: {
          ...authHeaders,
          ...(payload === undefined
            ? {}
            : { 'content-type': 'application/json' }),
          ...headers,
        },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      });
    const connect = async (path, protocols, options) => {
      const ws = new WebSocket(
        base.replace('http:', 'ws:') + path,
        protocols,
        options,
      );
      sockets.push(ws);
      ws.on('error', () => {});
      const message = once(ws, 'message');
      await once(ws, 'open');
      return { ws, message };
    };
    let deadline;
    try {
      await Promise.race([
        run({ bridge, server, factory, logs, base, request, connect }),
        new Promise((_, reject) => {
          deadline = setTimeout(
            () => reject(Error('Fixture host scenario deadline')),
            10000,
          );
        }),
      ]);
    } finally {
      clearTimeout(deadline);
    }
  } finally {
    for (const socket of sockets) socket.terminate();
    await bridge?.close();
    await closeServer(server);
    server.off('upgrade', dispatch);
    for (const socket of siblings.clients) socket.terminate();
    await new Promise((resolve) => siblings.close(resolve));
    assert.equal(server.listenerCount('upgrade'), baselineUpgrade);
    assert.equal(server.listenerCount('close'), baselineClose);
    assert.deepEqual(await readdir(runtimeRoot), []);
    await rm(runtimeRoot, { recursive: true, force: true });
  }
}

for (const mode of ['automatic', 'manual']) {
  test(
    `Express / fake RDP: ${mode} shared-port HTTP/WS, strict bounds, media and independent close`,
    { timeout: 20000 },
    async () => {
      await withHost(
        mode,
        async ({ bridge, server, factory, request, connect, base, logs }) => {
          assert.deepEqual(await (await request('/host')).json(), {
            host: true,
          });
          assert.equal((await request('/rdp/healthz')).status, 200);
          assert.equal((await fetch(base + '/rdp/v1/diagnostics')).status, 401);
          assert.equal((await fetch(base + '/rdp/metrics')).status, 401);
          const canary = 'PRIVATE-HTTP-URL-CANARY';
          assert.equal(
            (await request('/rdp/missing?token=' + canary)).status,
            404,
          );
          for (const payload of [
            { ...config, unknown: true },
            { ...config, target: { host: 'x', port: '3389' } },
          ])
            assert.equal(
              (await request('/rdp/v1/sessions', 'POST', payload)).status,
              400,
            );
          for (const headers of [
            { cookie: 'host=synthetic' },
            { origin: 'https://foreign.example' },
          ])
            assert.equal(
              (await request('/rdp/v1/sessions', 'POST', config, headers))
                .status,
              401,
            );
          assert.equal(
            (
              await request('/rdp/v1/sessions', 'POST', {
                ...config,
                extra: 'x'.repeat(70000),
              })
            ).status,
            413,
          );
          assert.deepEqual(
            await (
              await request('/echo', 'POST', { value: 'x'.repeat(70000) })
            ).json(),
            { characters: 70000 },
          );
          const chunked = await new Promise((resolve, reject) => {
            const request = httpRequest(
              base + '/rdp/v1/sessions',
              {
                method: 'POST',
                headers: { ...authHeaders, 'content-type': 'application/json' },
              },
              (response) => {
                response.resume();
                response.on('end', () => resolve(response.statusCode));
              },
            );
            request.on('error', reject);
            request.write('{"extra":"');
            for (let i = 0; i < 5; i++) request.write('x'.repeat(16384));
            request.end('"}');
          });
          assert.equal(chunked, 413);
          assert.equal(factory.workers.length, 0);
          const response = await request('/rdp/v1/sessions', 'POST', config);
          assert.equal(response.status, 202);
          const created = await response.json();
          await eventually(() => factory.workers[0]?.started === 1);
          const host = await connect('/host-ws');
          assert.equal((await host.message)[0].toString(), 'host-alive');
          const control = await connect(
            `/rdp/v1/sessions/${created.sessionId}/control?token=${created.attach.control.token}`,
            ['freerdp-bridge-v1'],
            { origin },
          );
          assert.equal(
            JSON.parse((await control.message)[0]).type,
            'session.state',
          );
          const diagnostics = waitMessage(control.ws, (bytes) => {
            const value = JSON.parse(bytes);
            if (value.type === 'session.diagnostics') return value;
          });
          control.ws.send(
            JSON.stringify({
              v: 1,
              type: 'session.diagnostics.request',
              seq: 1,
              ts: 1,
              data: {},
            }),
          );
          const diagnostic = await diagnostics;
          assert.equal(diagnostic.data.sessionId, created.sessionId);
          assert.equal(diagnostic.data.requestSeq, 1);
          assert.equal(
            JSON.stringify(diagnostic).includes(config.auth.password),
            false,
          );
          const media = await connect(
            `/rdp/v1/sessions/${created.sessionId}/media?token=${created.attach.media.token}`,
            ['freerdp-bridge-v1'],
            { origin },
          );
          const records = [];
          const frame = waitMessage(media.ws, (bytes, binary) => {
            if (!binary) {
              const record = JSON.parse(bytes);
              assert.equal(record.type, 'media.ready');
              assert.equal(record.data.codec, 'jpeg');
              return;
            }
            assert.equal(bytes.subarray(0, 4).toString(), 'RWB1');
            records.push(bytes.readUInt16BE(6));
            if (bytes.readUInt16BE(6) === 3) {
              assert.equal(bytes.subarray(-4).toString('hex'), 'ffd8ffd9');
              return true;
            }
          });
          media.ws.send(
            JSON.stringify({
              v: 1,
              type: 'media.hello',
              data: { codecs: ['jpeg'] },
            }),
          );
          await frame;
          assert.deepEqual(records, [2, 3]);
          assert.equal(
            (await (await request('/rdp/v1/diagnostics')).json())
              .activeSessions,
            1,
          );
          const untouched = new Proxy(
            {},
            {
              get() {
                throw Error('Foreign response/socket observed');
              },
            },
          );
          const foreign = {
            url: '/rdp-other?token=private',
            originalUrl: '/rdp-other?token=private',
            get headers() {
              throw Error('Foreign headers observed');
            },
          };
          let next = 0;
          bridge.middleware(foreign, untouched, () => next++);
          assert.equal(next, 1);
          assert.equal(
            bridge.handleUpgrade(foreign, untouched, Buffer.alloc(0)),
            false,
          );
          const closed = once(control.ws, 'close');
          const closing = bridge.close();
          assert.equal(bridge.close(), closing);
          await closing;
          await closed;
          assert.equal(factory.workers[0].closed, 1);
          assert.equal(bridge.diagnostics().activeSessions, 0);
          assert.equal(server.listening, true);
          assert.equal(host.ws.readyState, WebSocket.OPEN);
          assert.equal((await request('/host')).status, 200);
          assert.equal(
            (await request('/rdp/v1/sessions', 'POST', config)).status,
            503,
          );
          for (const secret of [
            config.auth.password,
            canary,
            created.attach.control.token,
            created.attach.media.token,
          ])
            assert.equal(logs.join('').includes(secret), false);
        },
      );
    },
  );
}

test(
  'Express / fake RDP: coordinated bridge/host close joins a live control socket and worker',
  { timeout: 15000 },
  async () => {
    await withHost(
      'automatic',
      async ({ bridge, server, factory, request, connect }) => {
        const created = await (
          await request('/rdp/v1/sessions', 'POST', config)
        ).json();
        const control = await connect(
          `/rdp/v1/sessions/${created.sessionId}/control?token=${created.attach.control.token}`,
          ['freerdp-bridge-v1'],
          { origin },
        );
        await control.message;
        const closed = once(control.ws, 'close');
        const hostClosed = closeServer(server);
        await bridge.close();
        await hostClosed;
        await closed;
        assert.equal(factory.workers[0].closed, 1);
        assert.equal(bridge.diagnostics().connections, 0);
      },
    );
  },
);

test(
  'Express / actual native worker: strict certificate rejection and joined shutdown',
  { skip: !linked, timeout: 20000 },
  async () => {
    const endpoint = await createRdpTlsFixture();
    try {
      await withHost(
        'automatic',
        async ({ bridge, request }) => {
          const response = await request('/rdp/v1/sessions', 'POST', {
            target: { host: '127.0.0.1', port: endpoint.port },
            auth: {
              username: 'synthetic',
              password: 'private synthetic TLS fixture',
            },
            security: { protocol: 'tls', certificatePolicy: 'strict' },
            timeouts: { connectMs: 5000 },
          });
          assert.equal(response.status, 202);
          const created = await response.json();
          let state;
          for (let attempt = 0; attempt < 700; attempt++) {
            state = await (
              await request('/rdp/v1/sessions/' + created.sessionId)
            ).json();
            if (state.state === 'failed') break;
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
          assert.equal(state.error.code, 'RDP_CERTIFICATE_REJECTED');
          assert.equal(endpoint.applicationBytes, 0);
          await bridge.close();
          assert.equal(bridge.diagnostics().activeSessions, 0);
        },
        true,
      );
    } finally {
      await endpoint.close();
    }
  },
);

test(
  'Express refuses express.json before bridge without creating sessions',
  { timeout: 15000 },
  async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'express-rdp-consumed-'));
    const factory = fakeFactory();
    const app = express();
    const server = createServer(app);
    let bridge;
    try {
      bridge = await createRdpBridgeExpress(server, {
        prefix: '/rdp',
        worker: { workerPath, runtimeRoot },
        authenticate: () => ({ id: 'owner' }),
        sessions: factory,
      });
      app.use(express.json());
      app.use(bridge.middleware);
      await listenBrowserHttp(server);
      const response = await fetch(
        'http://127.0.0.1:' + server.address().port + '/rdp/v1/sessions',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(config),
        },
      );
      assert.equal(response.status, 400);
      assert.equal((await response.json()).code, 'BRIDGE_RAW_BODY_REQUIRED');
      assert.equal(factory.workers.length, 0);
    } finally {
      await bridge?.close();
      await closeServer(server);
      assert.deepEqual(await readdir(runtimeRoot), []);
      await rm(runtimeRoot, { recursive: true, force: true });
    }
  },
);

test(
  'Express root Router works; stripped mounts and upstream bridge URL rewrites are refused',
  { timeout: 20000 },
  async () => {
    for (const mode of [
      'root-router',
      'path-mount',
      'router-mount',
      'rewrite',
    ]) {
      const runtimeRoot = await mkdtemp(join(tmpdir(), 'express-rdp-routing-'));
      const factory = fakeFactory();
      const app = express();
      const server = createServer(app);
      let bridge;
      try {
        bridge = await createRdpBridgeExpress(server, {
          prefix: '/rdp',
          worker: { workerPath, runtimeRoot },
          authenticate: () => ({ id: 'owner' }),
          sessions: factory,
        });
        if (mode === 'path-mount') app.use('/rdp', bridge.middleware);
        else if (mode === 'router-mount' || mode === 'root-router') {
          const router = express.Router();
          router.use(bridge.middleware);
          app.use(mode === 'root-router' ? '/' : '/rdp', router);
        } else {
          app.use((request, _response, next) => {
            request.url = '/rdp/readyz';
            next();
          });
          app.use(bridge.middleware);
        }
        app.use((request, response) =>
          response.json({
            host: true,
            url: request.url,
            originalUrl: request.originalUrl,
          }),
        );
        await listenBrowserHttp(server);
        const base = 'http://127.0.0.1:' + server.address().port;
        const response = await fetch(
          base + '/rdp/healthz?token=PRIVATE-MOUNT-CANARY',
        );
        if (mode === 'root-router') assert.equal(response.status, 200);
        else {
          assert.equal(response.status, 500);
          const error = await response.json();
          assert.equal(error.code, 'EXPRESS_BRIDGE_ROOT_REQUIRED');
          assert.equal(
            JSON.stringify(error).includes('PRIVATE-MOUNT-CANARY'),
            false,
          );
        }
        const foreign = await fetch(base + '/host');
        assert.equal(foreign.status, 200);
        const body = await foreign.json();
        assert.equal(body.host, true);
        assert.equal(body.originalUrl, '/host');
        assert.equal(body.url, mode === 'rewrite' ? '/rdp/readyz' : '/host');
        assert.equal(factory.workers.length, 0);
      } finally {
        await bridge?.close();
        await closeServer(server);
        assert.deepEqual(await readdir(runtimeRoot), []);
        await rm(runtimeRoot, { recursive: true, force: true });
      }
    }
  },
);

test(
  'Express bounded mounts share one observer/upgrade dispatcher and preserve other mounts',
  { timeout: 30000 },
  async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'http-rdp-mounts-'));
    const handles = [];
    const app = express();
    const server = createServer(app);
    const options = (prefix) => ({
      prefix,
      worker: { workerPath, runtimeRoot },
      authenticate: () => ({ id: 'owner' }),
      sessions: fakeFactory(),
    });
    try {
      for (let index = 0; index < 16; index++) {
        const handle = await createRdpBridgeExpress(
          server,
          options('/m' + index),
        );
        handles.push(handle);
        app.use(handle.middleware);
      }
      assert.equal(server.listenerCount('upgrade'), 1);
      assert.equal(server.listenerCount('close'), 1);
      assert.equal(server.getMaxListeners(), 10);
      for (const prefix of ['/m0', '/m0/child', '/overflow'])
        await assert.rejects(
          createRdpBridgeExpress(server, options(prefix)),
          (error) => error.code === 'BRIDGE_PREFIX_CONFLICT',
        );
      await listenBrowserHttp(server);
      await handles[0].close();
      await handles[0].close();
      assert.equal(server.listenerCount('upgrade'), 1);
      assert.equal(server.listenerCount('close'), 1);
      assert.equal(
        (await fetch(`http://127.0.0.1:${server.address().port}/m0/healthz`))
          .status,
        503,
      );
      assert.equal(
        (await fetch(`http://127.0.0.1:${server.address().port}/m1/healthz`))
          .status,
        200,
      );
    } finally {
      for (const handle of handles) await handle.close();
      await closeServer(server);
      assert.equal(server.listenerCount('close'), 0);
      assert.equal(server.listenerCount('upgrade'), 0);
      assert.deepEqual(await readdir(runtimeRoot), []);
      await rm(runtimeRoot, { recursive: true, force: true });
    }
  },
);

test(
  'Express refuses invalid options/HTTP2 and retires failed admission without leaking host listeners',
  { timeout: 15000 },
  async () => {
    const server = createServer(),
      http2 = createHttp2Server();
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'http-rdp-admission-'));
    const options = {
      prefix: '/rdp',
      worker: { workerPath, runtimeRoot },
      authenticate: () => ({ id: 'owner' }),
    };
    try {
      for (const [host, value, code] of [
        [http2, options, 'HTTP_BRIDGE_HTTP1_REQUIRED'],
        [server, { ...options, prefix: '/' }, 'BRIDGE_PREFIX_INVALID'],
        [
          server,
          { ...options, authenticate: undefined },
          'HTTP_BRIDGE_IDENTITY_REQUIRED',
        ],
        [
          server,
          { ...options, upgradeMode: 'catch-all' },
          'BRIDGE_UPGRADE_MODE_INVALID',
        ],
        [
          server,
          {
            ...options,
            worker: {
              ...options.worker,
              workerPath: join(runtimeRoot, 'private-absent-worker'),
            },
          },
          'HTTP_BRIDGE_INSTALL_FAILED',
        ],
      ]) {
        await assert.rejects(
          createRdpBridgeExpress(host, value),
          (error) =>
            error.code === code &&
            !String(error).includes('private-absent-worker'),
        );
        assert.equal(server.listenerCount('upgrade'), 0);
        assert.equal(server.listenerCount('close'), 0);
      }
      const bridge = await createRdpBridgeExpress(server, {
        ...options,
        sessions: fakeFactory(),
      });
      await bridge.close();
    } finally {
      await closeServer(server);
      http2.close();
      assert.deepEqual(await readdir(runtimeRoot), []);
      await rm(runtimeRoot, { recursive: true, force: true });
    }
  },
);

test(
  'Express host close during admission joins initialization and refuses the new handle',
  { timeout: 15000 },
  async () => {
    const server = createServer();
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'http-rdp-startup-'));
    try {
      await listenBrowserHttp(server);
      const initializing = createRdpBridgeExpress(server, {
        prefix: '/rdp',
        worker: { workerPath, runtimeRoot },
        authenticate: () => ({ id: 'owner' }),
        sessions: fakeFactory(),
      });
      const rejected = assert.rejects(
        initializing,
        (error) => error.code === 'HTTP_BRIDGE_INSTALL_FAILED',
      );
      await closeServer(server);
      await rejected;
      assert.equal(server.listenerCount('upgrade'), 0);
      assert.equal(server.listenerCount('close'), 0);
      assert.deepEqual(await readdir(runtimeRoot), []);
    } finally {
      await closeServer(server);
      await rm(runtimeRoot, { recursive: true, force: true });
    }
  },
);

test(
  'Express HTTPS / fake RDP: verified host HTTPS/WSS and independent joined close',
  { timeout: 90000 },
  async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'http-rdp-https-'));
    const factory = fakeFactory();
    let server, bridge, socket, key;
    try {
      execFileSync(
        process.platform === 'win32'
          ? 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe'
          : 'openssl',
        [
          'req',
          '-x509',
          '-newkey',
          'rsa:2048',
          '-nodes',
          '-days',
          '1',
          '-subj',
          '/CN=localhost',
          '-addext',
          'subjectAltName=DNS:localhost',
          '-keyout',
          join(runtimeRoot, 'key.pem'),
          '-out',
          join(runtimeRoot, 'cert.pem'),
        ],
        {
          windowsHide: true,
          // Hosted Windows can spend >15 seconds starting its system OpenSSL.
          // Bound certificate setup separately; HTTPS/WSS deadlines below stay fixed.
          timeout: 60000,
          stdio: 'ignore',
          env: Object.fromEntries(
            ['SystemRoot', 'WINDIR', 'PATH'].flatMap((name) =>
              process.env[name] === undefined
                ? []
                : [[name, process.env[name]]],
            ),
          ),
        },
      );
      key = await readFile(join(runtimeRoot, 'key.pem'));
      const cert = await readFile(join(runtimeRoot, 'cert.pem'));
      const app = express();
      server = createHttpsServer({ key, cert }, app);
      app.use((request, response, next) =>
        bridge.middleware(request, response, next),
      );
      app.get('/host', (_request, response) => response.json({ host: true }));
      bridge = await createRdpBridgeExpress(server, {
        prefix: '/rdp',
        worker: { workerPath, runtimeRoot },
        sessions: factory,
        allowedOrigins: [origin],
        authenticate: (request) =>
          request.headers.authorization === authHeaders.authorization
            ? { id: 'owner' }
            : undefined,
      });
      await listenBrowserHttp(server);
      const port = server.address().port;
      const request = (path, payload) =>
        new Promise((resolve, reject) => {
          const body =
            payload === undefined ? undefined : JSON.stringify(payload);
          const request = httpsRequest(
            {
              hostname: '127.0.0.1',
              servername: 'localhost',
              port,
              path,
              ca: cert,
              method: body === undefined ? 'GET' : 'POST',
              headers: {
                ...authHeaders,
                ...(body === undefined
                  ? {}
                  : {
                      'content-type': 'application/json',
                      'content-length': Buffer.byteLength(body),
                    }),
              },
            },
            (response) => {
              let text = '';
              response.on('data', (bytes) => {
                text += bytes.toString('utf8');
                if (text.length > 65536)
                  response.destroy(Error('Fixture HTTPS response limit'));
              });
              response.once('error', reject);
              response.once('end', () =>
                resolve({
                  status: response.statusCode,
                  body: JSON.parse(text),
                }),
              );
            },
          );
          request.setTimeout(5000, () =>
            request.destroy(Error('Fixture HTTPS deadline')),
          );
          request.once('error', reject);
          request.end(body);
        });
      assert.deepEqual(await request('/host'), {
        status: 200,
        body: { host: true },
      });
      const created = await request('/rdp/v1/sessions', config);
      assert.equal(created.status, 202);
      socket = new WebSocket(
        `wss://127.0.0.1:${port}/rdp/v1/sessions/${created.body.sessionId}/control?token=${created.body.attach.control.token}`,
        ['freerdp-bridge-v1'],
        { origin, ca: cert, servername: 'localhost' },
      );
      socket.on('error', () => {});
      const message = once(socket, 'message');
      await once(socket, 'open');
      await message;
      const closed = once(socket, 'close');
      await bridge.close();
      await closed;
      assert.equal(server.listening, true);
      assert.equal(factory.workers[0].closed, 1);
      assert.deepEqual(await request('/host'), {
        status: 200,
        body: { host: true },
      });
    } finally {
      socket?.terminate();
      await bridge?.close();
      if (server) await closeServer(server);
      key?.fill(0);
      await rm(join(runtimeRoot, 'key.pem'), { force: true });
      await rm(join(runtimeRoot, 'cert.pem'), { force: true });
      assert.deepEqual(await readdir(runtimeRoot), []);
      await rm(runtimeRoot, { recursive: true, force: true });
    }
  },
);
