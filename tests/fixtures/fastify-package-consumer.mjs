// Copied into an external project. All imports below must resolve from npm tarballs.
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { WebSocket, WebSocketServer } from 'ws';
import {
  rdpBridgePlugin,
  NativeSessionWorker,
  resolveNativeRuntime,
} from '@freerdp-bridge/fastify';
import { referenceBrowserDirectory } from '@freerdp-bridge/fastify/browser';
import { MAX_JPEG_BYTES } from '@freerdp-bridge/protocol';
import { createRdpTlsFixture } from './tls-fixture.mjs';

const root = await mkdtemp(join(tmpdir(), 'rdp-external-fastify-'));
const packageRuntime = process.argv[2] === '--package-runtime';
const workerPath = packageRuntime
  ? (
      await resolveNativeRuntime({
        runtimeRoot: root,
      })
    ).workerPath
  : process.argv[2];
const app = Fastify();
const tls = await createRdpTlsFixture();
let bridge;
class Fake extends EventEmitter {
  onState(listener) {
    this.on('state', listener);
    return () => this.off('state', listener);
  }
  onFailure(listener) {
    this.on('failure', listener);
    return () => this.off('failure', listener);
  }
  async start() {
    this.emit('state', 'connected');
  }
  async close() {
    this.emit('state', 'closed');
  }
  terminate() {}
  supportsCodec(codec) {
    return codec === 'jpeg';
  }
  async captureFrame(since) {
    return {
      revision: 1n,
      timestampUs: 1n,
      width: 640,
      height: 480,
      jpeg: since === 1n ? undefined : Buffer.from('ffd8ffd9', 'hex'),
    };
  }
}
const sibling = new WebSocketServer({ noServer: true });
const dispatcher = (request, socket, head) => {
  if (bridge?.handleUpgrade(request, socket, head)) return;
  if (request.url === '/host-ws')
    sibling.handleUpgrade(request, socket, head, (ws) => ws.send('host'));
};
app.server.on('upgrade', dispatcher);
app.get('/host', () => ({ host: true }));
app.register(rdpBridgePlugin, {
  prefix: '/rdp',
  worker: { workerPath, runtimeRoot: root },
  upgradeMode: 'manual',
  authenticate: () => ({ id: 'fixture' }),
  allowedOrigins: ['https://fixture.example'],
  sessions: { workerFactory: () => new Fake() },
  onReady: (value) => {
    bridge = value;
  },
});
app.register(rdpBridgePlugin, {
  prefix: '/native',
  worker: { workerPath, runtimeRoot: root },
  authenticate: () => ({ id: 'native-fixture' }),
});
const sockets = [];
try {
  assert.equal(typeof NativeSessionWorker, 'function');
  assert.match(
    await readFile(join(referenceBrowserDirectory, 'viewer.js'), 'utf8'),
    /options.basePath/,
  );
  assert.match(
    await readFile(join(referenceBrowserDirectory, 'index.html'), 'utf8'),
    /desktop/,
  );
  await app.listen({ host: '127.0.0.1', port: 0 });
  const port = app.server.address().port;
  assert.equal((await fetch(`http://127.0.0.1:${port}/host`)).status, 200);
  const response = await fetch(`http://127.0.0.1:${port}/rdp/v1/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      target: { host: 'synthetic.invalid' },
      auth: { username: 'fixture' },
    }),
  });
  assert.equal(response.status, 202);
  const created = await response.json();
  const host = new WebSocket(`ws://127.0.0.1:${port}/host-ws`);
  sockets.push(host);
  const hostMessage = once(host, 'message');
  assert.equal((await hostMessage)[0].toString(), 'host');
  const ws = new WebSocket(
    `ws://127.0.0.1:${port}/rdp/v1/sessions/${created.sessionId}/media?token=${created.attach.media.token}`,
    ['freerdp-bridge-v1'],
    { origin: 'https://fixture.example' },
  );
  sockets.push(ws);
  ws.on('error', () => {});
  const records = [];
  const frame = new Promise((done, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Media fixture deadline')),
      5000,
    );
    ws.on('message', (bytes, binary) => {
      if (binary) {
        assert.equal(bytes.subarray(0, 4).toString(), 'RWB1');
        assert.ok(bytes.length < MAX_JPEG_BYTES);
        records.push(bytes);
        if (bytes.readUInt16BE(6) === 3) {
          clearTimeout(timer);
          done();
        }
      }
    });
  });
  await once(ws, 'open');
  ws.send(
    JSON.stringify({ v: 1, type: 'media.hello', data: { codecs: ['jpeg'] } }),
  );
  await frame;
  assert.equal(records.length, 2);
  assert.equal(records[0].readUInt16BE(6), 2);
  assert.equal(records[1].subarray(-4).toString('hex'), 'ffd8ffd9');
  assert.equal(
    (await fetch(`http://127.0.0.1:${port}/rdp/v1/diagnostics`)).status,
    200,
  );
  const nativeResponse = await fetch(
    `http://127.0.0.1:${port}/native/v1/sessions`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        target: { host: '127.0.0.1', port: tls.port },
        auth: { username: 'synthetic', password: 'synthetic TLS fixture only' },
        security: { protocol: 'tls', certificatePolicy: 'strict' },
        timeouts: { connectMs: 5000 },
      }),
    },
  );
  assert.equal(nativeResponse.status, 202);
  const nativeCreated = await nativeResponse.json();
  const deadline = performance.now() + 7000;
  let nativeState;
  do {
    nativeState = await (
      await fetch(
        `http://127.0.0.1:${port}/native/v1/sessions/${nativeCreated.sessionId}`,
      )
    ).json();
    if (nativeState.state === 'failed') break;
    if (performance.now() >= deadline)
      throw new Error('External native fixture deadline');
    await new Promise((done) => setTimeout(done, 10));
  } while (true);
  assert.equal(nativeState.error.code, 'RDP_CERTIFICATE_REJECTED');
  assert.equal(tls.applicationBytes, 0);
  await bridge.close();
  assert.equal(host.readyState, WebSocket.OPEN);
  assert.equal((await fetch(`http://127.0.0.1:${port}/host`)).status, 200);
  console.log(
    JSON.stringify({
      externalFastify: true,
      fakeRdp: true,
      binaryMedia: true,
      samePort: true,
      hostWebSocketSurvives: true,
      browserAssets: true,
      nativeWorkerProbe: true,
      actualNativeStrictTls: true,
    }),
  );
} finally {
  for (const ws of sockets) ws.terminate();
  await app.close();
  await tls.close();
  app.server.off('upgrade', dispatcher);
  await new Promise((done) => sibling.close(done));
  assert.deepEqual(await readdir(root), []);
  await rm(root, { recursive: true, force: true });
}
