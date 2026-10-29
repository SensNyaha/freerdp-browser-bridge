// Independent installed npm consumer. Native files/IPC are real; RDP state is synthetic.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { Writable } from 'node:stream';
import { mkdtemp, realpath, readdir, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';

const [kind, version] = process.argv.slice(2);
assert.equal(process.argv.length, 4);
assert.ok(['http', 'express', 'fastify', 'nestjs'].includes(kind));
assert.match(version, /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/);
const modules = await realpath('node_modules');
const entry = import.meta.resolve('@freerdp-bridge/' + kind);
assert.ok((await realpath(fileURLToPath(entry))).startsWith(modules + sep));
const sdk = await import(entry);

async function until(read, accept, milliseconds = 5000) {
  const deadline = performance.now() + milliseconds;
  for (;;) {
    const value = await read();
    if (accept(value)) return value;
    assert.ok(performance.now() < deadline, 'Installed file consumer deadline');
    await delay(5);
  }
}
class FileWorker extends EventEmitter {
  constructor(options, limits, transport) {
    super();
    this.policy = limits.files;
    assert.ok(this.policy);
    this.native = new sdk.WorkerProcess({
      ...options,
      maxWriteBytes: 131072,
      ipcTransport: transport,
    });
    this.writes = [];
    this.native.on('failure', () => this.emit('failure', 'WORKER_FAILED'));
  }
  onState(listener) {
    this.on('state', listener);
    return () => this.off('state', listener);
  }
  onFailure(listener) {
    this.on('failure', listener);
    return () => this.off('failure', listener);
  }
  async start(_config, signal) {
    assert.equal(signal.aborted, false);
    const build = await this.native.start();
    assert.equal(build.bridgeVersion, version);
    assert.equal(
      build.capabilities.fileService,
      true,
      'Installed file runtime is required',
    );
    const response = await this.native.nativeFileCommand({
      operation: 'initialize',
      id: BigInt(this.policy.maxTotalBytes),
      argument: BigInt(this.policy.maxFileBytes),
      value: BigInt(this.policy.maxEntries),
    });
    assert.equal(response.status, 'ok');
    this.emit('state', 'connecting');
    this.emit('state', 'connected');
  }
  fileCommand(command) {
    if (command.operation === 'write') this.writes.push(command.data.length);
    return this.native.nativeFileCommand(command);
  }
  async close() {
    await this.native.close();
    this.emit('state', 'closed');
  }
  async terminate() {
    this.native.terminate();
    await this.native.close();
  }
}

async function host(type, options) {
  let close, server, bridge;
  if (kind === 'http' || kind === 'express') {
    if (kind === 'http') {
      server = createServer((request, response) => {
        if (bridge.handleRequest(request, response)) return;
        const blocks = [];
        let size = 0;
        request.on('data', (block) => {
          size += block.length;
          if (size > 65536) {
            request.destroy();
            return;
          }
          blocks.push(block);
        });
        request.on('end', () => {
          const body = JSON.parse(Buffer.concat(blocks));
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify({ host: body.host }));
        });
      });
      bridge = await sdk.createRdpBridgeHttp(server, options);
    } else {
      const { default: express } = await import('express');
      const app = express();
      server = createServer(app);
      bridge = await sdk.createRdpBridgeExpress(server, options);
      app.use(bridge.middleware);
      app.use(express.json());
      app.post('/echo', (request, response) =>
        response.json({ host: request.body.host }),
      );
    }
    close = async () => {
      await bridge.close();
      await new Promise((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      );
    };
    await new Promise((done, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', done);
    });
  } else if (kind === 'fastify') {
    const Fastify = createRequire(entry)('fastify');
    const app = Fastify();
    server = app.server;
    close = () => app.close();
    app.post('/echo', async (request) => ({ host: request.body.host }));
    await app.register(sdk.rdpBridgePlugin, options);
    await app.listen({ host: '127.0.0.1', port: 0 });
  } else {
    await import('reflect-metadata');
    const { Module, Controller, Post, Body } = await import('@nestjs/common');
    const { NestFactory } = await import('@nestjs/core');
    const adapters = await import('@nestjs/platform-' + type);
    class Echo {
      echo(body) {
        return { host: body.host };
      }
    }
    Controller()(Echo);
    Post('echo')(
      Echo.prototype,
      'echo',
      Object.getOwnPropertyDescriptor(Echo.prototype, 'echo'),
    );
    Body()(Echo.prototype, 'echo', 0);
    class AppModule {}
    Module({
      controllers: [Echo],
      imports: [sdk.RdpBridgeModule.forRoot(options)],
    })(AppModule);
    const adapter =
      type === 'express'
        ? new adapters.ExpressAdapter()
        : new adapters.FastifyAdapter();
    const app = await NestFactory.create(AppModule, adapter, {
      logger: false,
      abortOnError: false,
    });
    close = () => app.close();
    server = app.getHttpServer();
    app.setGlobalPrefix('app');
    await app.listen(0, '127.0.0.1');
  }
  return { close, base: 'http://127.0.0.1:' + server.address().port };
}

const profiles = [];
for (const type of kind === 'nestjs' ? ['express', 'fastify'] : [kind])
  for (const transport of process.platform === 'linux'
    ? ['framed-pipes', 'unix-seqpacket-rws1']
    : ['framed-pipes']) {
    const runtimeRoot = await mkdtemp(
      join(await realpath(tmpdir()), 'installed-files-'),
    );
    let app;
    const workers = [];
    try {
      const worker = await sdk.resolveNativeRuntime({ runtimeRoot });
      assert.ok((await realpath(worker.workerPath)).startsWith(modules + sep));
      app = await host(type, {
        prefix: '/rdp',
        worker,
        authenticate: (request) => {
          return ['Bearer a', 'Bearer b'].includes(
            request.headers.authorization,
          )
            ? { id: request.headers.authorization.at(-1) }
            : undefined;
        },
        logDestination: new Writable({
          write(bytes, _encoding, done) {
            bytes.fill(0);
            done();
          },
        }),
        sessions: {
          files: {
            maxTotalBytes: 262144,
            maxFileBytes: 196608,
            maxEntries: 16,
            transferTimeoutMs: 5000,
            progressTimeoutMs: 2000,
            nativeTimeoutMs: 1000,
          },
          workerFactory: (limits) => {
            const native = new FileWorker(worker, limits, transport);
            workers.push(native);
            return native;
          },
        },
      });
      const request = (method, path, body, headers = {}, actor = 'a') =>
        fetch(app.base + path, {
          method,
          headers: { authorization: 'Bearer ' + actor, ...headers },
          ...(body === undefined ? {} : { body }),
          ...(body?.[Symbol.asyncIterator] ? { duplex: 'half' } : {}),
        });
      const capabilities = await request('GET', '/rdp/v1/capabilities');
      assert.equal(capabilities.status, 200);
      assert.equal((await capabilities.json()).clipboardFiles, false);
      const created = await request(
        'POST',
        '/rdp/v1/sessions',
        JSON.stringify({ target: { host: 'synthetic.invalid' }, auth: {} }),
        { 'content-type': 'application/json' },
      );
      assert.equal(created.status, 202);
      const session = await created.json(),
        path = '/rdp/v1/sessions/' + session.sessionId;
      await until(
        async () => (await request('GET', path)).json(),
        (value) => value.state === 'connected',
      );
      assert.equal(workers.length, 1);
      const pid = workers[0].native.pid;
      assert.ok(Number.isSafeInteger(pid) && pid > 1);
      const mkdir = await request(
        'POST',
        path + '/files/directories',
        JSON.stringify({ name: 'folder-\u0416\u65e5\u672c\u8a9e' }),
        { 'content-type': 'application/json' },
      );
      assert.equal(mkdir.status, 201);
      const parent = await mkdir.json();
      const bytes = Buffer.from(
        Array.from({ length: 131111 }, (_, index) => (index * 31 + 17) & 255),
      );
      let early = false;
      async function* chunks() {
        yield bytes.subarray(0, 16384);
        await until(() => workers[0].writes.includes(16384), Boolean);
        early = true;
        for (let offset = 16384; offset < bytes.length; offset += 16384)
          yield bytes.subarray(offset, Math.min(offset + 16384, bytes.length));
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
      assert.equal(early, true);
      const file = await upload.json();
      assert.match(file.fileId, /^[0-9a-f]{32}$/);
      assert.equal(file.size, bytes.length);
      assert.deepEqual(Object.keys(file).sort(), [
        'fileId',
        'kind',
        'name',
        'size',
      ]);
      const download = await request('GET', path + '/files/' + file.fileId);
      assert.equal(download.status, 200);
      assert.equal(
        download.headers.get('content-length'),
        String(bytes.length),
      );
      assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
      assert.match(
        download.headers.get('content-disposition'),
        /filename\*=UTF-8''/,
      );
      assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
      assert.ok(workers[0].writes.every((size) => size <= 65536));
      const foreign = await request(
        'GET',
        path + '/files/' + file.fileId,
        undefined,
        {},
        'b',
      );
      assert.equal(foreign.status, 404);
      assert.equal((await foreign.json()).code, 'SESSION_NOT_FOUND');
      const echo = await request(
        'POST',
        (kind === 'nestjs' ? '/app' : '') + '/echo',
        JSON.stringify({ host: true }),
        { 'content-type': 'application/json' },
      );
      assert.equal(echo.status, kind === 'nestjs' ? 201 : 200);
      assert.deepEqual(await echo.json(), { host: true });
      for (const id of [file.fileId, parent.fileId]) {
        const removed = await request('DELETE', path + '/files/' + id);
        assert.equal(removed.status, 204, await removed.text());
      }
      const closed = await request('DELETE', path);
      assert.equal(closed.status, 200);
      await closed.arrayBuffer();
      assert.equal(workers[0].native.state, 'closed');
      assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
      profiles.push({
        type,
        transport,
        bytes: bytes.length,
        beforeProducerEof: early,
        pidJoined: true,
      });
    } finally {
      await app?.close();
      assert.deepEqual(await readdir(runtimeRoot), []);
      await rmdir(runtimeRoot);
    }
  }
console.log(
  JSON.stringify({
    installedManagedFiles: true,
    kind,
    version,
    profiles,
    checkoutImports: false,
    actualNativeFileIo: true,
    syntheticRdpOnly: true,
  }),
);
