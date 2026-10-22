import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Writable } from 'node:stream';
import { rdpBridgePlugin } from '../../apps/bridge-api/dist/plugin.js';
import { fakeFactory, eventually } from '../fixtures/session-worker.mjs';
import { createRdpTlsFixture } from '../fixtures/rdp-tls.mjs';

const require = createRequire(
  new URL('../../apps/bridge-api/package.json', import.meta.url),
);
const Fastify = require('fastify');
const { WebSocket, WebSocketServer } = require('ws');
const workerPath = resolve(
  process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
  'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
);
const origin = 'https://app.example.test';
const config = {
  target: { host: 'synthetic.invalid' },
  auth: { username: 'synthetic', password: 'private-test-password' },
};

async function withHost(mode, run) {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'rdp-plugin-'));
  const logs = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      logs.push(chunk.toString());
      callback();
    },
  });
  const app = Fastify({
    logger: { level: 'info', stream },
    bodyLimit: 1024 * 1024,
  });
  app.server.maxConnections = 777;
  const factory = fakeFactory();
  const siblings = new WebSocketServer({ noServer: true });
  const baseline = app.server.listenerCount('upgrade');
  let bridge;
  const dispatcher = (request, socket, head) => {
    if (mode === 'manual' && bridge?.handleUpgrade(request, socket, head))
      return;
    if (request.url === '/app-ws')
      siblings.handleUpgrade(request, socket, head, (ws) =>
        ws.send('host-alive'),
      );
  };
  app.server.on('upgrade', dispatcher);
  app.get('/host', () => ({ host: true }));
  app.get('/host-error', () => {
    throw new Error('HOST_ERROR');
  });
  app.setErrorHandler((_error, _request, reply) =>
    reply.code(418).send({ hostError: true }),
  );
  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({ hostMissing: true }),
  );
  app.register(rdpBridgePlugin, {
    prefix: '/rdp',
    worker: { workerPath, runtimeRoot },
    allowedOrigins: [origin],
    authenticate: (request) =>
      request.headers.authorization === 'Bearer host-identity'
        ? { id: 'owner' }
        : undefined,
    sessions: factory,
    logDestination: stream,
    upgradeMode: mode,
    onReady: (value) => {
      bridge = value;
    },
  });
  try {
    await app.listen({ host: '127.0.0.1', port: 0 });
    const base = 'ws://127.0.0.1:' + app.server.address().port;
    const request = (url, method = 'GET', payload) =>
      app.inject({
        url,
        method,
        headers: { authorization: 'Bearer host-identity' },
        ...(payload ? { payload } : {}),
      });
    await run({ app, bridge, factory, base, request, logs });
  } finally {
    await app.close();
    app.server.off('upgrade', dispatcher);
    for (const ws of siblings.clients) ws.terminate();
    await new Promise((done) => siblings.close(done));
    assert.equal(app.server.listenerCount('upgrade'), baseline);
    assert.deepEqual(await readdir(runtimeRoot), []);
    await rm(runtimeRoot, { recursive: true, force: true });
  }
}
async function connect(url, protocols, options) {
  const ws = new WebSocket(url, protocols, options);
  ws.on('error', () => {});
  const message = once(ws, 'message');
  await once(ws, 'open');
  return { ws, message };
}
async function close(ws) {
  const closed = once(ws, 'close');
  ws.close();
  await closed;
}

for (const mode of ['automatic', 'manual'])
  test(
    `Fastify plugin / fake RDP: ${mode} same-port HTTP/WS isolation, diagnostics and independent retirement`,
    { timeout: 20000 },
    async () => {
      await withHost(
        mode,
        async ({ app, bridge, factory, base, request, logs }) => {
          assert.equal(app.server.maxConnections, 777);
          assert.deepEqual((await app.inject('/host')).json(), { host: true });
          assert.deepEqual((await app.inject('/host-error')).json(), {
            hostError: true,
          });
          assert.deepEqual((await app.inject('/missing')).json(), {
            hostMissing: true,
          });
          assert.equal((await app.inject('/rdp/healthz')).statusCode, 200);
          assert.equal(
            (await app.inject('/rdp/v1/diagnostics')).statusCode,
            401,
          );
          assert.equal((await app.inject('/rdp/metrics')).statusCode, 401);
          const unknownSecret = 'PRIVATE-UNMAPPED-ROUTE-CANARY';
          assert.equal(
            (await app.inject('/rdp/missing?token=' + unknownSecret))
              .statusCode,
            404,
          );
          assert.equal(
            (await request('/rdp/v1/capabilities')).json().sessionDiagnostics,
            1,
          );
          for (const payload of [
            { ...config, unknown: true },
            { ...config, target: { host: 'x', port: '3389' } },
          ])
            assert.equal(
              (await request('/rdp/v1/sessions', 'POST', payload)).statusCode,
              400,
            );
          const oversized = await request('/rdp/v1/sessions', 'POST', {
            ...config,
            extra: 'x'.repeat(65536),
          });
          assert.equal(oversized.statusCode, 413);
          assert.equal(factory.workers.length, 0);
          const created = (
            await request('/rdp/v1/sessions', 'POST', config)
          ).json();
          assert.match(created.sessionId, /^[0-9a-f]{32}$/);
          await eventually(() => factory.workers[0].started === 1);
          const { ws: host, message: hostMessage } = await connect(
            base + '/app-ws',
          );
          assert.equal((await hostMessage)[0].toString(), 'host-alive');
          const url =
            base +
            '/rdp/v1/sessions/' +
            created.sessionId +
            '/control?token=' +
            created.attach.control.token;
          const { ws, message } = await connect(url, ['freerdp-bridge-v1'], {
            origin,
          });
          assert.equal(JSON.parse((await message)[0]).type, 'session.state');
          const diagnostic = new Promise((done) =>
            ws.on('message', (value) => {
              const record = JSON.parse(value);
              if (record.type === 'session.diagnostics') done(record);
            }),
          );
          ws.send(
            JSON.stringify({
              v: 1,
              type: 'session.diagnostics.request',
              seq: 1,
              ts: 1,
              data: {},
            }),
          );
          const received = await diagnostic;
          assert.equal(received.data.schema, 1);
          assert.equal(received.data.sessionId, created.sessionId);
          assert.equal(received.data.requestSeq, 1);
          assert.equal(
            JSON.stringify(received).includes(config.auth.password),
            false,
          );
          assert.equal(
            (await request('/rdp/v1/diagnostics')).json().activeSessions,
            1,
          );
          // Manual dispatch must decline a foreign upgrade without observing credentials/socket.
          const untouched = new Proxy(
            {},
            {
              get() {
                throw new Error('Foreign socket accessed');
              },
            },
          );
          assert.equal(
            bridge.handleUpgrade(
              { url: '/application?token=private' },
              untouched,
              Buffer.alloc(0),
            ),
            false,
          );
          const closed = once(ws, 'close');
          const shutdown = bridge.close();
          assert.equal(bridge.close(), shutdown);
          await shutdown;
          await closed;
          assert.equal(host.readyState, WebSocket.OPEN);
          assert.equal(factory.workers[0].closed, 1);
          assert.equal(bridge.diagnostics().activeSessions, 0);
          assert.equal(bridge.diagnostics().connections, 0);
          assert.equal((await app.inject('/host')).statusCode, 200);
          assert.equal(
            (await request('/rdp/v1/sessions', 'POST', config)).statusCode,
            503,
          );
          const second = await connect(base + '/app-ws');
          assert.equal((await second.message)[0].toString(), 'host-alive');
          await close(second.ws);
          await close(host);
          assert.equal(logs.join('').includes(config.auth.password), false);
          assert.equal(logs.join('').includes(unknownSecret), false);
          assert.equal(
            logs.join('').includes(created.attach.control.token),
            false,
          );
        },
      );
    },
  );

test(
  'Fastify plugin refuses invalid/overlapping prefixes and failed ready callback retires resources',
  { timeout: 15000 },
  async () => {
    for (const prefix of ['', '/', '/rdp/', '/a/../b', '/r%64p']) {
      const app = Fastify();
      app.register(rdpBridgePlugin, {
        prefix,
        worker: { workerPath: 'unused', runtimeRoot: 'unused' },
      });
      await assert.rejects(app.ready(), { code: 'BRIDGE_PREFIX_INVALID' });
      await app.close();
    }
    await withHost('manual', async ({ app }) => {
      assert.equal((await app.inject('/rdp/not-found')).statusCode, 404);
    });
    for (const failCallback of [false, true]) {
      const runtimeRoot = await mkdtemp(join(tmpdir(), 'rdp-plugin-refusal-'));
      const app = Fastify();
      app.register(rdpBridgePlugin, {
        prefix: '/rdp',
        worker: { workerPath, runtimeRoot },
        ...(failCallback
          ? {
              onReady() {
                throw new Error('secret-untrusted-diagnostic');
              },
            }
          : {}),
      });
      if (!failCallback)
        app.register(rdpBridgePlugin, {
          prefix: '/rdp/nested',
          worker: { workerPath, runtimeRoot },
        });
      await assert.rejects(app.ready(), {
        code: failCallback ? 'BRIDGE_INSTALL_FAILED' : 'BRIDGE_PREFIX_CONFLICT',
      });
      await app.close();
      assert.equal(app.server.listenerCount('upgrade'), 0);
      assert.deepEqual(await readdir(runtimeRoot), []);
      await rm(runtimeRoot, { recursive: true, force: true });
    }
  },
);

test(
  'Fastify plugin / actual native worker: default factory, strict TLS rejection and joined retirement on the host port',
  { timeout: 20000 },
  async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'rdp-plugin-native-'));
    const endpoint = await createRdpTlsFixture();
    const app = Fastify();
    let bridge;
    app.register(rdpBridgePlugin, {
      prefix: '/rdp',
      worker: { workerPath, runtimeRoot },
      authenticate: () => ({ id: 'synthetic-native-owner' }),
      onReady: (value) => {
        bridge = value;
      },
    });
    try {
      await app.listen({ host: '127.0.0.1', port: 0 });
      const result = await app.inject({
        method: 'POST',
        url: '/rdp/v1/sessions',
        payload: {
          target: { host: '127.0.0.1', port: endpoint.port },
          auth: {
            username: 'synthetic',
            password: 'private synthetic fixture',
          },
          security: { protocol: 'tls', certificatePolicy: 'strict' },
          timeouts: { connectMs: 5000 },
        },
      });
      assert.equal(result.statusCode, 202, result.body);
      const { sessionId } = result.json();
      let final;
      const deadline = performance.now() + 7000;
      do {
        final = (await app.inject('/rdp/v1/sessions/' + sessionId)).json();
        if (final.state === 'failed') break;
        if (performance.now() > deadline)
          throw new Error('Native plugin outcome deadline');
        await new Promise((done) => setTimeout(done, 10));
      } while (true);
      assert.equal(final.error.code, 'RDP_CERTIFICATE_REJECTED');
      assert.equal(endpoint.applicationBytes, 0);
      await bridge.close();
      assert.equal(bridge.diagnostics().activeSessions, 0);
      assert.deepEqual(await readdir(runtimeRoot), []);
    } finally {
      await app.close();
      await endpoint.close();
      await rm(runtimeRoot, { recursive: true, force: true });
    }
  },
);
