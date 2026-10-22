import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Writable } from 'node:stream';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Module, Controller, Get, Post, Body } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import {
  RdpBridgeModule,
  RdpBridgeService,
} from '../../packages/nestjs/dist/index.js';
import { fakeFactory, eventually } from '../fixtures/session-worker.mjs';
import { createRdpTlsFixture } from '../fixtures/rdp-tls.mjs';

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
const config = {
  target: { host: 'synthetic.invalid' },
  auth: { username: 'synthetic', password: 'private-nest-fixture-password' },
};
const authHeaders = { authorization: 'Bearer verified-host-owner' };

function waitMessage(socket, select) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('message', message);
      socket.off('close', closed);
    };
    const closed = () => {
      cleanup();
      reject(new Error('Fixture WebSocket closed before expected record'));
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
      reject(new Error('Fixture WebSocket record deadline'));
    }, 5000);
    socket.on('message', message);
    socket.once('close', closed);
  });
}

class HostController {
  health() {
    return { host: true };
  }
  echo(body) {
    return { characters: body.value.length };
  }
}
Controller()(HostController);
Get('host')(
  HostController.prototype,
  'health',
  Object.getOwnPropertyDescriptor(HostController.prototype, 'health'),
);
Post('echo')(
  HostController.prototype,
  'echo',
  Object.getOwnPropertyDescriptor(HostController.prototype, 'echo'),
);
Body()(HostController.prototype, 'echo', 0);

async function withNest(type, mode, run, native = false) {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'nest-rdp-'));
  const logs = [];
  const stream = new Writable({
    write(bytes, _encoding, done) {
      logs.push(bytes.toString());
      done();
    },
  });
  const adapter =
    type === 'fastify'
      ? new FastifyAdapter({ logger: { level: 'info', stream } })
      : new ExpressAdapter();
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
  let factoryCalls = 0;
  let rawIdentityCalls = 0;
  class HostConfigModule {}
  Module({
    providers: [{ provide: 'HOST_AUTH', useValue: authHeaders.authorization }],
    exports: ['HOST_AUTH'],
  })(HostConfigModule);
  class AppModule {}
  Module({
    controllers: [HostController],
    imports: [
      RdpBridgeModule.forRootAsync({
        imports: [HostConfigModule],
        inject: ['HOST_AUTH'],
        useFactory: async (bearer) => {
          factoryCalls++;
          return {
            prefix: '/rdp',
            worker: { workerPath, runtimeRoot },
            allowedOrigins: [origin],
            upgradeMode: mode,
            logDestination: stream,
            authenticate(request) {
              assert.equal(request.body, undefined);
              rawIdentityCalls++;
              return request.headers.authorization === bearer
                ? { id: 'owner' }
                : undefined;
            },
            ...(!native ? { sessions: factory } : {}),
          };
        },
      }),
    ],
  })(AppModule);
  const app = await NestFactory.create(AppModule, adapter, {
    logger: false,
    abortOnError: false,
  });
  const bridge = app.get(RdpBridgeService);
  const server = app.getHttpServer();
  server.maxConnections = 777;
  const baseline = server.listenerCount('upgrade');
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
  app.setGlobalPrefix('app');
  try {
    await app.listen(0, '127.0.0.1');
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
    assert.equal(factoryCalls, 1);
    await run({ app, bridge, factory, base, request, connect, logs, server });
    assert.ok(rawIdentityCalls > 0);
  } finally {
    for (const ws of sockets) ws.terminate();
    await app.close();
    server.off('upgrade', dispatch);
    for (const ws of siblings.clients) ws.terminate();
    await new Promise((done) => siblings.close(done));
    assert.ok(server.listenerCount('upgrade') <= baseline);
    assert.deepEqual(await readdir(runtimeRoot), []);
    await rm(runtimeRoot, { recursive: true, force: true });
  }
}

for (const type of ['express', 'fastify'])
  for (const mode of ['automatic', 'manual']) {
    test(
      `Nest ${type} / fake RDP: ${mode} shared-port HTTP/WS, DI, bounds and independent close`,
      { timeout: 20000 },
      async () => {
        await withNest(
          type,
          mode,
          async ({ bridge, factory, request, connect, logs, base, server }) => {
            assert.equal(server.maxConnections, 777);
            assert.deepEqual(await (await request('/app/host')).json(), {
              host: true,
            });
            assert.equal((await request('/rdp/healthz')).status, 200);
            assert.equal(
              (await fetch(base + '/rdp/v1/diagnostics')).status,
              401,
            );
            assert.equal((await fetch(base + '/rdp/metrics')).status, 401);
            const canary = 'PRIVATE-NEST-UNKNOWN-URL';
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
            assert.equal(
              (
                await request('/rdp/v1/sessions', 'POST', config, {
                  cookie: 'host=synthetic',
                })
              ).status,
              401,
            );
            assert.equal(
              (
                await request('/rdp/v1/sessions', 'POST', config, {
                  origin: 'https://foreign.example',
                })
              ).status,
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
                await request('/app/echo', 'POST', { value: 'x'.repeat(70000) })
              ).json(),
              { characters: 70000 },
            );
            const chunked = await new Promise((done, reject) => {
              const req = httpRequest(
                base + '/rdp/v1/sessions',
                {
                  method: 'POST',
                  headers: {
                    ...authHeaders,
                    'content-type': 'application/json',
                  },
                },
                (response) => {
                  response.resume();
                  response.on('end', () => done(response.statusCode));
                },
              );
              req.on('error', reject);
              req.write('{"extra":"');
              for (let i = 0; i < 5; i++) req.write('x'.repeat(16384));
              req.end('"}');
            });
            assert.equal(chunked, 413);
            assert.equal(factory.workers.length, 0);
            const createdResponse = await request(
              '/rdp/v1/sessions',
              'POST',
              config,
            );
            assert.equal(createdResponse.status, 202);
            const created = await createdResponse.json();
            await eventually(() => factory.workers[0]?.started === 1);
            const host = await connect('/host-ws');
            assert.equal((await host.message)[0].toString(), 'host-alive');
            const control = await connect(
              '/rdp/v1/sessions/' +
                created.sessionId +
                '/control?token=' +
                created.attach.control.token,
              ['freerdp-bridge-v1'],
              { origin },
            );
            assert.equal(
              JSON.parse((await control.message)[0]).type,
              'session.state',
            );
            const diagnostic = waitMessage(control.ws, (bytes) => {
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
            const report = await diagnostic;
            assert.equal(report.data.requestSeq, 1);
            assert.equal(report.data.sessionId, created.sessionId);
            assert.equal(
              JSON.stringify(report).includes(config.auth.password),
              false,
            );
            const media = await connect(
              '/rdp/v1/sessions/' +
                created.sessionId +
                '/media?token=' +
                created.attach.media.token,
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
                  throw new Error('Foreign socket observed');
                },
              },
            );
            assert.equal(
              bridge.handleUpgrade(
                { url: '/foreign?token=private' },
                untouched,
                Buffer.alloc(0),
              ),
              false,
            );
            const closed = once(control.ws, 'close');
            const closing = bridge.close();
            assert.equal(bridge.close(), closing);
            await closing;
            await closed;
            assert.equal(host.ws.readyState, WebSocket.OPEN);
            assert.equal(factory.workers[0].closed, 1);
            assert.equal(bridge.diagnostics().activeSessions, 0);
            assert.equal((await request('/app/host')).status, 200);
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

for (const type of ['express', 'fastify']) {
  test(
    `Nest ${type} / fake RDP: host-owned HTTPS and WSS verify the fixture CA and join shutdown`,
    { timeout: 20000 },
    async () => {
      const runtimeRoot = await mkdtemp(join(tmpdir(), 'nest-rdp-https-'));
      const factory = fakeFactory();
      let app, socket, key;
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
            timeout: 15000,
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
        const httpsOptions = { key, cert };
        class App {}
        Module({
          controllers: [HostController],
          imports: [
            RdpBridgeModule.forRoot({
              prefix: '/rdp',
              worker: { workerPath, runtimeRoot },
              allowedOrigins: [origin],
              sessions: factory,
              authenticate: (request) =>
                request.headers.authorization === authHeaders.authorization
                  ? { id: 'owner' }
                  : undefined,
            }),
          ],
        })(App);
        app = await NestFactory.create(
          App,
          type === 'fastify'
            ? new FastifyAdapter({ https: httpsOptions })
            : new ExpressAdapter(),
          { httpsOptions, logger: false, abortOnError: false },
        );
        await app.listen(0, '127.0.0.1');
        const port = app.getHttpServer().address().port;
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
                    response.destroy(Error('Fixture response limit'));
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
        await app.close();
        await closed;
        assert.equal(factory.workers[0].closed, 1);
        assert.equal(app.get(RdpBridgeService).diagnostics().activeSessions, 0);
      } finally {
        socket?.terminate();
        await app?.close();
        key?.fill(0);
        await rm(runtimeRoot, { recursive: true, force: true });
      }
    },
  );

  test(
    `Nest ${type} / fake RDP: app.close retires a live control socket and worker`,
    { timeout: 15000 },
    async () => {
      await withNest(
        type,
        'automatic',
        async ({ app, bridge, factory, request, connect }) => {
          const response = await request('/rdp/v1/sessions', 'POST', config);
          assert.equal(response.status, 202);
          const created = await response.json();
          const control = await connect(
            '/rdp/v1/sessions/' +
              created.sessionId +
              '/control?token=' +
              created.attach.control.token,
            ['freerdp-bridge-v1'],
            { origin },
          );
          await control.message;
          assert.equal(bridge.diagnostics().activeSessions, 1);
          const closed = once(control.ws, 'close');
          await app.close();
          await closed;
          assert.equal(factory.workers[0].closed, 1);
          assert.equal(bridge.diagnostics().activeSessions, 0);
          assert.equal(bridge.diagnostics().connections, 0);
          assert.equal(app.getHttpServer().listening, false);
        },
      );
    },
  );

  test(
    `Nest ${type} / actual native worker: strict certificate refusal and Nest shutdown joins resources`,
    { skip: !linked, timeout: 20000 },
    async () => {
      const endpoint = await createRdpTlsFixture();
      try {
        await withNest(
          type,
          'automatic',
          async ({ app, bridge, request }) => {
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
              await new Promise((done) => setTimeout(done, 10));
            }
            assert.equal(state.error.code, 'RDP_CERTIFICATE_REJECTED');
            assert.equal(endpoint.applicationBytes, 0);
            await app.close();
            assert.equal(bridge.diagnostics().activeSessions, 0);
          },
          true,
        );
      } finally {
        await endpoint.close();
      }
    },
  );
}

test(
  'Nest Express refuses a custom host parser that already consumed the bridge body',
  { timeout: 15000 },
  async () => {
    const express = createRequire(
      import.meta.resolve('@nestjs/platform-express'),
    )('express');
    const instance = express();
    instance.use(express.json({ limit: '2mb' }));
    const adapter = new ExpressAdapter(instance);
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'nest-rdp-preparsed-'));
    const factory = fakeFactory();
    class App {}
    Module({
      controllers: [HostController],
      imports: [
        RdpBridgeModule.forRoot({
          prefix: '/rdp',
          worker: { workerPath, runtimeRoot },
          authenticate: () => ({ id: 'owner' }),
          sessions: factory,
        }),
      ],
    })(App);
    const app = await NestFactory.create(App, adapter, {
      logger: false,
      abortOnError: false,
    });
    try {
      await app.listen(0, '127.0.0.1');
      const base = 'http://127.0.0.1:' + app.getHttpServer().address().port;
      for (const body of [config, { ...config, extra: 'x'.repeat(70000) }]) {
        const response = await fetch(base + '/rdp/v1/sessions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        assert.equal(response.status, 400);
        assert.equal((await response.json()).code, 'BRIDGE_RAW_BODY_REQUIRED');
      }
      const response = await fetch(base + '/echo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value: 'x'.repeat(70000) }),
      });
      assert.equal((await response.json()).characters, 70000);
      assert.equal(factory.workers.length, 0);
    } finally {
      await app.close();
      assert.deepEqual(await readdir(runtimeRoot), []);
      await rm(runtimeRoot, { recursive: true, force: true });
    }
  },
);

test(
  'Nest failed native admission retires installation; close remains idempotent',
  { timeout: 15000 },
  async () => {
    for (const type of ['express', 'fastify']) {
      const runtimeRoot = await mkdtemp(join(tmpdir(), 'nest-rdp-admission-'));
      const adapter =
        type === 'express' ? new ExpressAdapter() : new FastifyAdapter();
      class App {}
      Module({
        imports: [
          RdpBridgeModule.forRoot({
            prefix: '/rdp',
            worker: {
              workerPath: join(runtimeRoot, 'absent-native-worker'),
              runtimeRoot,
            },
            authenticate: () => ({ id: 'owner' }),
          }),
        ],
      })(App);
      const app = await NestFactory.create(App, adapter, {
        logger: false,
        abortOnError: false,
      });
      const bridge = app.get(RdpBridgeService);
      try {
        await assert.rejects(
          app.init(),
          (error) => error.code === 'NEST_BRIDGE_INSTALL_FAILED',
        );
        assert.equal(app.getHttpServer().listenerCount('upgrade'), 0);
        const first = bridge.close();
        assert.equal(bridge.close(), first);
        await first;
      } finally {
        await app.close();
        assert.deepEqual(await readdir(runtimeRoot), []);
        await rm(runtimeRoot, { recursive: true, force: true });
      }
    }
  },
);

test(
  'Nest early close refuses owned upgrades without native allocation and preserves foreign routing',
  { timeout: 15000 },
  async () => {
    const adapter = new ExpressAdapter();
    class App {}
    Module({
      controllers: [HostController],
      imports: [
        RdpBridgeModule.forRoot({
          prefix: '/rdp',
          worker: { workerPath: 'unused', runtimeRoot: 'unused' },
          authenticate: () => ({ id: 'owner' }),
          upgradeMode: 'manual',
        }),
      ],
    })(App);
    const app = await NestFactory.create(App, adapter, {
      logger: false,
      abortOnError: false,
    });
    const bridge = app.get(RdpBridgeService);
    try {
      const untouched = new Proxy(
        {},
        {
          get() {
            throw new Error('Foreign socket observed');
          },
        },
      );
      assert.equal(
        bridge.handleUpgrade({ url: '/host-ws' }, untouched, Buffer.alloc(0)),
        false,
      );
      let rejection;
      assert.equal(
        bridge.handleUpgrade(
          { url: '/rdp/late' },
          {
            end(value) {
              rejection = value;
            },
          },
          Buffer.alloc(0),
        ),
        true,
      );
      assert.match(rejection, /^HTTP\/1\.1 503 /);
      await bridge.close();
      await app.listen(0, '127.0.0.1');
      const base = 'http://127.0.0.1:' + app.getHttpServer().address().port;
      assert.equal((await fetch(base + '/host')).status, 200);
      assert.equal((await fetch(base + '/rdp/healthz')).status, 503);
    } finally {
      await app.close();
    }
  },
);

test(
  'Nest module refuses invalid options and sanitizes async factory errors before native work',
  { timeout: 15000 },
  async () => {
    for (const options of [
      { prefix: '/', authenticate: () => ({ id: 'owner' }) },
      { prefix: '/rdp' },
      {
        prefix: '/rdp',
        authenticate: () => ({ id: 'owner' }),
        upgradeMode: 'unknown',
      },
    ]) {
      class App {}
      Module({
        imports: [
          RdpBridgeModule.forRoot({
            worker: { workerPath: 'unused', runtimeRoot: 'unused' },
            ...options,
          }),
        ],
      })(App);
      const adapter = new ExpressAdapter();
      await assert.rejects(
        NestFactory.create(App, adapter, {
          logger: false,
          abortOnError: false,
        }),
        (error) =>
          /^(?:BRIDGE_PREFIX_INVALID|NEST_BRIDGE_IDENTITY_REQUIRED|BRIDGE_UPGRADE_MODE_INVALID)$/.test(
            error.code,
          ),
      );
      await adapter.close();
    }
    class App {}
    Module({
      imports: [
        RdpBridgeModule.forRootAsync({
          useFactory() {
            throw new Error('PRIVATE-OPTIONS-CANARY');
          },
        }),
      ],
    })(App);
    const adapter = new ExpressAdapter();
    await assert.rejects(
      NestFactory.create(App, adapter, { logger: false, abortOnError: false }),
      (error) =>
        error.code === 'NEST_BRIDGE_OPTIONS_FAILED' &&
        !String(error).includes('PRIVATE-OPTIONS-CANARY'),
    );
    await adapter.close();
  },
);
