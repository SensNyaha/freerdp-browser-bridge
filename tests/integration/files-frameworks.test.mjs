import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Writable } from 'node:stream';
import { mkdtemp, readdir, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import express from 'express';
import { Module, Controller, Post, Body } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { createRdpBridgeHttp } from '../../packages/http/dist/index.js';
import { createRdpBridgeExpress } from '../../packages/express/dist/index.js';
import { rdpBridgePlugin } from '../../packages/fastify/dist/index.js';
import {
  RdpBridgeModule,
  RdpBridgeService,
} from '../../packages/nestjs/dist/index.js';
import { NativeFileWorker } from '../fixtures/file-worker.mjs';
import { eventually } from '../fixtures/session-worker.mjs';

const Fastify = createRequire(
  new URL('../../apps/bridge-api/package.json', import.meta.url),
)('fastify');
const binaryDir = process.env.BRIDGE_FILE_TEST_BINARY_DIR;
const workerPath = resolve(
  binaryDir ?? 'build/foundation',
  'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
);
class HostController {
  echo(body) {
    return { value: body.value };
  }
}
Controller()(HostController);
Post('echo')(
  HostController.prototype,
  'echo',
  Object.getOwnPropertyDescriptor(HostController.prototype, 'echo'),
);
Body()(HostController.prototype, 'echo', 0);

async function withHost(kind, transport, run) {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'bridge-file-framework-'));
  const workers = [];
  let close, host, bridge;
  const files = {
    maxTotalBytes: 262144,
    maxFileBytes: 196608,
    maxEntries: 16,
    transferTimeoutMs: 5000,
    progressTimeoutMs: 2000,
    nativeTimeoutMs: 1000,
  };
  const options = {
    prefix: '/rdp',
    worker: { workerPath, runtimeRoot },
    authenticate: (r) =>
      ['Bearer a', 'Bearer b'].includes(r.headers.authorization)
        ? { id: r.headers.authorization.at(-1) }
        : undefined,
    logDestination: new Writable({
      write(bytes, _encoding, done) {
        bytes.fill(0);
        done();
      },
    }),
    sessions: {
      files,
      createBurst: 100,
      workerFactory: (limits) => {
        const worker = new NativeFileWorker(runtimeRoot, limits, transport);
        workers.push(worker);
        return worker;
      },
    },
  };
  try {
    if (kind === 'fastify') {
      const app = Fastify();
      host = app.server;
      app.post('/echo', async (r) => ({ value: r.body.value }));
      await app.register(rdpBridgePlugin, options);
      await app.listen({ host: '127.0.0.1', port: 0 });
      close = () => app.close();
    } else if (kind === 'http' || kind === 'express') {
      if (kind === 'http') {
        host = createServer((request, response) => {
          if (bridge.handleRequest(request, response)) return;
          if (request.url !== '/echo') {
            response.writeHead(404);
            response.end();
            return;
          }
          const blocks = [];
          let bytes = 0;
          request.on('data', (block) => {
            bytes += block.length;
            if (bytes > 65536) {
              request.destroy();
              return;
            }
            blocks.push(block);
          });
          request.on('end', () => {
            const value = JSON.parse(Buffer.concat(blocks));
            response.setHeader('content-type', 'application/json');
            response.end(JSON.stringify({ value: value.value }));
          });
        });
        bridge = await createRdpBridgeHttp(host, options);
      } else {
        const app = express();
        host = createServer(app);
        bridge = await createRdpBridgeExpress(host, options);
        app.use(bridge.middleware);
        app.use(express.json());
        app.post('/echo', (request, response) =>
          response.json({ value: request.body.value }),
        );
      }
      close = async () => {
        await bridge.close();
        await new Promise((done, reject) =>
          host.close((error) => (error ? reject(error) : done())),
        );
      };
      await new Promise((done, reject) => {
        host.once('error', reject);
        host.listen(0, '127.0.0.1', done);
      });
    } else {
      class AppModule {}
      Module({
        controllers: [HostController],
        imports: [RdpBridgeModule.forRoot(options)],
      })(AppModule);
      const adapter =
        kind === 'nestjs-express' ? new ExpressAdapter() : new FastifyAdapter();
      const app = await NestFactory.create(AppModule, adapter, {
        logger: false,
        abortOnError: false,
      });
      host = app.getHttpServer();
      bridge = app.get(RdpBridgeService);
      close = () => app.close();
      app.setGlobalPrefix('app');
      await app.listen(0, '127.0.0.1');
    }
    const base = 'http://127.0.0.1:' + host.address().port;
    const request = (method, path, body, headers = {}, actor = 'a') =>
      fetch(base + path, {
        method,
        headers: { authorization: 'Bearer ' + actor, ...headers },
        ...(body === undefined ? {} : { body }),
        ...(body?.[Symbol.asyncIterator] ? { duplex: 'half' } : {}),
      });
    await run({
      base,
      request,
      workers,
      echo: (kind.startsWith('nestjs') ? '/app' : '') + '/echo',
    });
  } finally {
    await close?.();
    assert.deepEqual(await readdir(runtimeRoot), []);
    await rmdir(runtimeRoot);
  }
}

for (const kind of [
  'http',
  'express',
  'fastify',
  'nestjs-express',
  'nestjs-fastify',
])
  for (const transport of process.platform === 'linux'
    ? ['framed-pipes', 'unix-seqpacket-rws1']
    : ['framed-pipes'])
    test(
      `framework files / ${kind} / ${transport}: actual native streaming, scoped IDs and host body parser; synthetic RDP`,
      { skip: !binaryDir, timeout: 30000 },
      async () =>
        withHost(kind, transport, async ({ request, workers, echo }) => {
          const capability = await request('GET', '/rdp/v1/capabilities');
          assert.equal(capability.status, 200);
          assert.equal((await capability.json()).clipboardFiles, false);
          const created = await request(
            'POST',
            '/rdp/v1/sessions',
            JSON.stringify({
              target: { host: 'synthetic.invalid' },
              auth: { password: 'synthetic framework secret' },
            }),
            { 'content-type': 'application/json' },
          );
          assert.equal(created.status, 202);
          const { sessionId } = await created.json();
          const path = '/rdp/v1/sessions/' + sessionId;
          await eventually(() => workers[0]?.started === 1);
          const state = await request('GET', path);
          assert.equal((await state.json()).state, 'connected');
          const pid = workers[0].native.pid;
          assert.ok(Number.isSafeInteger(pid) && pid > 1);
          const directory = await request(
            'POST',
            path + '/files/directories',
            JSON.stringify({ name: 'folder-\u0416\u65e5\u672c\u8a9e' }),
            { 'content-type': 'application/json' },
          );
          assert.equal(directory.status, 201);
          const parent = await directory.json();
          const data = Buffer.from(
            Array.from({ length: 131111 }, (_, i) => (i * 31 + 17) & 255),
          );
          let firstChunkForwarded = false;
          async function* chunks() {
            for (let offset = 0; offset < data.length; offset += 16384) {
              yield data.subarray(
                offset,
                Math.min(offset + 16384, data.length),
              );
              if (offset === 0) {
                // Do not produce the rest until the actual native command is
                // dispatched: a host body parser cannot buffer the whole file.
                await eventually(() =>
                  workers[0].calls.some(
                    (call) =>
                      call.operation === 'write' && call.bytes === 16384,
                  ),
                );
                firstChunkForwarded = true;
              }
            }
          }
          const upload = await request(
            'POST',
            path +
              '/files?' +
              new URLSearchParams({
                name: 'file-\u0416\u65e5\u672c\u8a9e\ud83d\ude00.bin',
                parentId: parent.fileId,
              }),
            chunks(),
            { 'content-type': 'application/octet-stream' },
          );
          assert.equal(upload.status, 201);
          assert.equal(firstChunkForwarded, true);
          const file = await upload.json();
          assert.match(file.fileId, /^[0-9a-f]{32}$/);
          assert.deepEqual(Object.keys(file).sort(), [
            'fileId',
            'kind',
            'name',
            'size',
          ]);
          assert.equal(file.size, data.length);
          const download = await request('GET', path + '/files/' + file.fileId);
          assert.equal(download.status, 200);
          assert.equal(
            download.headers.get('content-length'),
            String(data.length),
          );
          assert.match(
            download.headers.get('content-disposition'),
            /filename\*=UTF-8''/,
          );
          assert.equal(
            download.headers.get('x-content-type-options'),
            'nosniff',
          );
          assert.deepEqual(Buffer.from(await download.arrayBuffer()), data);
          assert.ok(
            workers[0].calls.filter((x) => x.operation === 'write').length >= 2,
          );
          assert.ok(workers[0].calls.every((x) => x.bytes <= 65536));
          const foreign = await request(
            'GET',
            path + '/files/' + file.fileId,
            undefined,
            {},
            'b',
          );
          assert.equal(foreign.status, 404);
          assert.equal((await foreign.json()).code, 'SESSION_NOT_FOUND');
          const host = await request(
            'POST',
            echo,
            JSON.stringify({ value: 'host parser alive' }),
            { 'content-type': 'application/json' },
          );
          assert.equal(host.status, kind.startsWith('nestjs') ? 201 : 200);
          assert.deepEqual(await host.json(), { value: 'host parser alive' });
          const removedFile = await request(
            'DELETE',
            path + '/files/' + file.fileId,
          );
          assert.equal(removedFile.status, 204, await removedFile.text());
          const removedDirectory = await request(
            'DELETE',
            path + '/files/' + parent.fileId,
          );
          assert.equal(
            removedDirectory.status,
            204,
            await removedDirectory.text(),
          );
          const closed = await request('DELETE', path);
          assert.equal(closed.status, 200);
          await closed.arrayBuffer();
          assert.equal(workers[0].native.state, 'closed');
          assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
        }),
    );
