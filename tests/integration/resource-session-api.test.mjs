import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { Writable } from 'node:stream';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { NativeSessionWorker } from '../../packages/node-bridge/dist/index.js';
import { createSessionServer } from '../../apps/bridge-api/dist/session-server.js';
import { createRdpTlsFixture } from '../fixtures/rdp-tls.mjs';
import { eventually } from '../fixtures/session-worker.mjs';

const { WebSocket } = createRequire(
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
const origin = 'https://ui.example.test';

async function rejectedUpgrade(url) {
  return new Promise((done, reject) => {
    const ws = new WebSocket(url, ['freerdp-bridge-v1'], { origin });
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error('Resource upgrade refusal deadline'));
    }, 3000);
    ws.on('error', () => {});
    ws.on('open', () => {
      clearTimeout(timer);
      ws.terminate();
      reject(new Error('Retired resource token upgraded'));
    });
    ws.on('unexpected-response', (_request, response) => {
      clearTimeout(timer);
      response.resume();
      ws.terminate();
      done(response.statusCode);
    });
  });
}

test(
  'actual native RSS / synthetic TLS / public HTTP and WS: exact failure reaches control, closes both channels and retires attach authority',
  {
    skip: !linked || !['win32', 'linux'].includes(process.platform),
    timeout: 15000,
  },
  async () => {
    const endpoint = await createRdpTlsFixture();
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'rdp-resource-api-'));
    let adapter,
      joinedClose = false;
    class ObservedAdapter extends NativeSessionWorker {
      async close() {
        await super.close();
        joinedClose = true;
      }
    }
    const logs = [];
    const options = {
      workerPath,
      runtimeRoot,
      ipcTransport: 'framed-pipes',
      maxResidentBytes: 1,
      residentPollIntervalMs: 2000,
    };
    const authorization = 'Bearer synthetic-resource-owner';
    const server = await createSessionServer({
      worker: options,
      authenticate: (request) =>
        request.headers.authorization === authorization
          ? { id: 'synthetic-resource-owner' }
          : undefined,
      allowedOrigins: [origin],
      sessions: {
        workerFactory() {
          adapter = new ObservedAdapter(options);
          return adapter;
        },
      },
      logDestination: new Writable({
        write(chunk, _encoding, done) {
          logs.push(chunk.toString());
          done();
        },
      }),
    });
    const sockets = [];
    const request = (method, url, payload) =>
      server.inject({
        method,
        url,
        headers: { authorization },
        ...(payload === undefined ? {} : { payload }),
      });
    try {
      await server.listen({ host: '127.0.0.1', port: 0 });
      const createdResponse = await request('POST', '/v1/sessions', {
        target: { host: '127.0.0.1', port: endpoint.port },
        auth: { username: 'synthetic', password: 'synthetic-IPC-sentinel' },
        security: { protocol: 'tls', certificatePolicy: 'prompt' },
        timeouts: { connectMs: 5000 },
      });
      assert.equal(createdResponse.statusCode, 202);
      const created = createdResponse.json();
      const path = '/v1/sessions/' + created.sessionId;
      const base = 'ws://127.0.0.1:' + server.server.address().port + path;
      const spareResponse = await request('POST', path + '/attach-token', {
        channel: 'media',
      });
      assert.equal(spareResponse.statusCode, 200);
      const spare = spareResponse.json().token;
      const events = [];
      const closes = [];
      for (const channel of ['control', 'media']) {
        const ws = new WebSocket(
          base + '/' + channel + '?token=' + created.attach[channel].token,
          ['freerdp-bridge-v1'],
          { origin },
        );
        sockets.push(ws);
        ws.on('error', () => {});
        ws.on('message', (bytes) => {
          if (channel === 'control') events.push(JSON.parse(bytes.toString()));
        });
        closes.push(once(ws, 'close'));
        await once(ws, 'open');
      }
      await eventually(
        () => events.some((event) => event.type === 'certificate.prompt'),
        5000,
      );
      const pid = adapter.pid;
      assert.ok(Number.isSafeInteger(pid));
      const closeResults = await Promise.all(closes);
      for (const [code, reason] of closeResults) {
        assert.equal(code, 1000);
        assert.equal(reason.toString(), 'session terminal');
      }
      const expected = {
        code: 'WORKER_MEMORY_LIMIT',
        message: 'Session worker memory policy exceeded',
        retryable: false,
      };
      const failures = events.filter((event) => event.type === 'session.error');
      assert.equal(failures.length, 1);
      assert.deepEqual(failures[0].data, expected);
      const snapshot = await request('GET', path);
      assert.equal(snapshot.statusCode, 200);
      assert.equal(snapshot.headers['cache-control'], 'no-store');
      assert.equal(snapshot.json().state, 'failed');
      assert.deepEqual(snapshot.json().error, expected);
      const attach = await request('POST', path + '/attach-token', {
        channel: 'control',
      });
      assert.equal(attach.statusCode, 409);
      assert.equal(attach.json().code, 'SESSION_NOT_ATTACHABLE');
      assert.equal(await rejectedUpgrade(base + '/media?token=' + spare), 401);
      await eventually(() => joinedClose, 5000);
      assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
      assert.deepEqual(await readdir(runtimeRoot), []);
      assert.equal(endpoint.applicationBytes, 0);
      for (const secret of [
        'synthetic-IPC-sentinel',
        spare,
        created.attach.control.token,
        created.attach.media.token,
      ])
        assert.equal(logs.join('').includes(secret), false);
    } finally {
      for (const ws of sockets) ws.terminate();
      await server.close();
      await endpoint.close();
      await rm(runtimeRoot, { recursive: true, force: true, maxRetries: 3 });
    }
  },
);
