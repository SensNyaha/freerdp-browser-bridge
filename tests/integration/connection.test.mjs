import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkerProcess } from '../../packages/node-bridge/dist/index.js';
import {
  NativeSessionWorker,
  SessionManager,
} from '../../packages/node-bridge/dist/index.js';
import { eventually } from '../fixtures/session-worker.mjs';
import { createRdpTlsFixture } from '../fixtures/rdp-tls.mjs';
import { createSessionServer } from '../../apps/bridge-api/dist/session-server.js';
import { createRequire } from 'node:module';
import { Writable } from 'node:stream';
const { WebSocket } = createRequire(
  new URL('../../apps/bridge-api/package.json', import.meta.url),
)('ws');

const workerPath = resolve(
  process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
  'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
);
const linked = Boolean(
  JSON.parse(
    execFileSync(workerPath, ['--capabilities'], {
      encoding: 'utf8',
      windowsHide: true,
    }),
  ).capabilities.connectCore,
);

test(
  'native HTTP/WS: attached controller receives certificate prompt and sends a scoped decision',
  {
    skip: !linked,
    timeout: 15000,
  },
  async () => {
    const endpoint = await createRdpTlsFixture();
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'bridge-native-api-'));
    const workerOptions = { workerPath, runtimeRoot };
    const logs = [];
    const server = await createSessionServer({
      worker: workerOptions,
      authenticate: (request) =>
        request.headers.authorization === 'Bearer synthetic-owner'
          ? { id: 'synthetic-owner' }
          : undefined,
      allowedOrigins: ['https://ui.example.test'],
      sessions: { workerFactory: () => new NativeSessionWorker(workerOptions) },
      logDestination: new Writable({
        write(chunk, _encoding, done) {
          logs.push(chunk.toString());
          done();
        },
      }),
    });
    let ws;
    try {
      await server.listen({ host: '127.0.0.1', port: 0 });
      const create = await server.inject({
        method: 'POST',
        url: '/v1/sessions',
        headers: { authorization: 'Bearer synthetic-owner' },
        payload: configuration(endpoint.port, 'prompt'),
      });
      assert.equal(create.statusCode, 202);
      const created = create.json();
      const events = [];
      ws = new WebSocket(
        'ws://127.0.0.1:' +
          server.server.address().port +
          '/v1/sessions/' +
          created.sessionId +
          '/control?token=' +
          created.attach.control.token,
        ['freerdp-bridge-v1'],
        { origin: 'https://ui.example.test' },
      );
      ws.on('error', () => {});
      ws.on('message', (bytes) => events.push(JSON.parse(bytes.toString())));
      await once(ws, 'open');
      await eventually(() =>
        events.some((e) => e.type === 'certificate.prompt'),
      );
      const prompt = events.find((e) => e.type === 'certificate.prompt').data;
      const send = (seq, data) =>
        ws.send(
          JSON.stringify({
            v: 1,
            type: 'certificate.response',
            seq,
            ts: Date.now(),
            data,
          }),
        );
      send(1, {
        challenge: prompt.challenge,
        fingerprint: prompt.fingerprint,
        accept: false,
        unexpected: 'not-allowed',
      });
      await eventually(() =>
        events.some(
          (e) =>
            e.type === 'session.error' &&
            e.data.code === 'CONTROL_PROTOCOL_ERROR',
        ),
      );
      send(2, {
        challenge: '2',
        fingerprint: prompt.fingerprint,
        accept: true,
      });
      await eventually(() =>
        events.some(
          (e) =>
            e.type === 'session.error' &&
            e.data.code === 'CERTIFICATE_PROMPT_STALE',
        ),
      );
      const closed = once(ws, 'close');
      send(3, {
        challenge: prompt.challenge,
        fingerprint: prompt.fingerprint,
        accept: false,
      });
      await closed;
      assert.ok(
        events.some(
          (e) =>
            e.type === 'session.error' &&
            e.data.code === 'RDP_CERTIFICATE_REJECTED',
        ),
      );
      const snapshot = await server.inject({
        url: '/v1/sessions/' + created.sessionId,
        headers: { authorization: 'Bearer synthetic-owner' },
      });
      assert.equal(snapshot.json().state, 'failed');
      assert.equal(snapshot.json().error.code, 'RDP_CERTIFICATE_REJECTED');
      for (const secret of [
        'synthetic-IPC-sentinel',
        created.attach.control.token,
        created.attach.media.token,
      ])
        assert.equal(logs.join('').includes(secret), false);
    } finally {
      ws?.terminate();
      await server.close();
      assert.deepEqual(await readdir(runtimeRoot), []);
      await rm(runtimeRoot, { recursive: true, force: true, maxRetries: 3 });
      await endpoint.close();
    }
  },
);
async function withWorker(run) {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'bridge-connect-test-'));
  const worker = new WorkerProcess({
    workerPath,
    runtimeRoot,
    heartbeatIntervalMs: 100,
  });
  try {
    await worker.start();
    await run(worker);
  } finally {
    await worker.close();
    assert.deepEqual(await readdir(runtimeRoot), []);
    await rm(runtimeRoot, { recursive: true, force: true, maxRetries: 3 });
  }
}
const configuration = (port, policy = 'strict', connectMs = 5000) => ({
  target: { host: '127.0.0.1', port },
  auth: { username: 'synthetic', password: 'synthetic-IPC-sentinel' },
  security: { protocol: 'tls', certificatePolicy: policy },
  timeouts: { connectMs },
});
function terminal(worker) {
  return new Promise((done) => {
    const receive = (value) => {
      if (['failed', 'closed'].includes(value.state)) {
        worker.off('rdp-state', receive);
        done(value);
      }
    };
    worker.on('rdp-state', receive);
  });
}

test(
  'native connection: strict rejects untrusted/mismatched TLS without a prompt',
  {
    skip: !linked,
    timeout: 15000,
  },
  async () => {
    const endpoint = await createRdpTlsFixture();
    try {
      await withWorker(async (worker) => {
        let prompted = false;
        worker.on('certificate', () => {
          prompted = true;
        });
        const result = terminal(worker);
        await worker.connect({
          ...configuration(endpoint.port),
          quality: {
            profile: 'custom',
            maxFps: 5,
            targetBitrateKbps: 750,
            maxBitrateKbps: 1000,
          },
        });
        assert.equal((await result).error, 'RDP_CERTIFICATE_REJECTED');
        assert.equal(prompted, false);
        assert.equal(endpoint.applicationBytes, 0);
        await worker.ping();
      });
    } finally {
      await endpoint.close();
    }
  },
);

test(
  'native session registry: certificate replay after detach and remote failure are scoped',
  {
    skip: !linked,
    timeout: 15000,
  },
  async () => {
    const endpoint = await createRdpTlsFixture();
    const runtimeRoot = await mkdtemp(
      join(tmpdir(), 'bridge-native-registry-'),
    );
    const manager = new SessionManager({
      workerFactory: () => new NativeSessionWorker({ workerPath, runtimeRoot }),
    });
    try {
      const owner = { id: 'synthetic-owner' };
      const created = manager.create(
        configuration(endpoint.port, 'prompt'),
        owner,
        '127.0.0.1',
      );
      await eventually(
        () => manager.get(created.sessionId, owner).state === 'awaiting-user',
      );
      const token = manager.mintToken(
        created.sessionId,
        owner,
        'control',
      ).token;
      const lease = manager.attach(created.sessionId, token, 'control');
      assert.ok(lease.certificate);
      const response = { ...lease.certificate, accept: false };
      await assert.rejects(
        lease.respondCertificate({ ...response, challenge: '2' }),
        { code: 'CERTIFICATE_PROMPT_STALE' },
      );
      lease.release();
      await assert.rejects(lease.respondCertificate(response), {
        code: 'CERTIFICATE_PROMPT_STALE',
      });
      const next = manager.attach(
        created.sessionId,
        manager.mintToken(created.sessionId, owner, 'control').token,
        'control',
      );
      await next.respondCertificate(response);
      await eventually(
        () => manager.get(created.sessionId, owner).state === 'failed',
      );
      assert.equal(
        manager.get(created.sessionId, owner).error.code,
        'RDP_CERTIFICATE_REJECTED',
      );
      await assert.rejects(next.respondCertificate(response), {
        code: 'CERTIFICATE_PROMPT_STALE',
      });
      await eventually(() => manager.statistics().active === 0);
    } finally {
      await manager.shutdown();
      assert.deepEqual(await readdir(runtimeRoot), []);
      await rm(runtimeRoot, { recursive: true, force: true, maxRetries: 3 });
      await endpoint.close();
    }
  },
);

test(
  'native session registry: unsupported configuration has an explicit failure and bounded cleanup',
  {
    skip: !linked,
    timeout: 15000,
  },
  async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'bridge-native-config-'));
    const manager = new SessionManager({
      workerFactory: () => new NativeSessionWorker({ workerPath, runtimeRoot }),
    });
    try {
      const owner = { id: 'synthetic-owner' };
      const created = manager.create(
        { ...configuration(3389), reconnect: { enabled: true } },
        owner,
        '127.0.0.1',
      );
      await eventually(
        () => manager.get(created.sessionId, owner).state === 'failed',
      );
      assert.equal(
        manager.get(created.sessionId, owner).error.code,
        'RDP_SETTING_NOT_IMPLEMENTED',
      );
      await eventually(() => manager.statistics().active === 0);
    } finally {
      await manager.shutdown();
      assert.deepEqual(await readdir(runtimeRoot), []);
      await rm(runtimeRoot, { recursive: true, force: true, maxRetries: 3 });
    }
  },
);

test(
  'native connection: prompt decisions bind fingerprint/challenge and deny replay',
  {
    skip: !linked,
    timeout: 15000,
  },
  async () => {
    const endpoint = await createRdpTlsFixture();
    try {
      await withWorker(async (worker) => {
        const prompted = once(worker, 'certificate');
        const result = terminal(worker);
        await worker.connect(configuration(endpoint.port, 'prompt'));
        const [prompt] = await prompted;
        assert.match(prompt.fingerprint, /^sha256:[0-9a-f]{64}$/);
        assert.equal(prompt.untrusted, true);
        assert.equal(prompt.hostnameMismatch, true);
        await worker.ping(); // TLS callback wait cannot block lifecycle IPC.
        await assert.rejects(
          worker.decideCertificate({ ...prompt, challenge: '2' }, true),
          { code: 'CERTIFICATE_PROMPT_STALE' },
        );
        await assert.rejects(
          worker.decideCertificate(
            { ...prompt, fingerprint: 'sha256:' + '00'.repeat(32) },
            true,
          ),
          { code: 'CERTIFICATE_PROMPT_STALE' },
        );
        await worker.decideCertificate(prompt, false);
        assert.equal((await result).error, 'RDP_CERTIFICATE_REJECTED');
        await assert.rejects(worker.decideCertificate(prompt, true), {
          code: 'CERTIFICATE_PROMPT_STALE',
        });
        assert.equal(endpoint.applicationBytes, 0);
      });
    } finally {
      await endpoint.close();
    }
  },
);

test(
  'native connection: explicit session trust reaches RDP bytes, deadline remains bounded',
  {
    skip: !linked,
    timeout: 15000,
  },
  async () => {
    const endpoint = await createRdpTlsFixture();
    try {
      await withWorker(async (worker) => {
        const prompted = once(worker, 'certificate');
        const result = terminal(worker);
        await worker.connect(configuration(endpoint.port, 'prompt', 1500));
        const [prompt] = await prompted;
        await worker.decideCertificate(prompt, true);
        assert.equal((await result).error, 'RDP_CONNECT_TIMEOUT');
        assert.ok(endpoint.applicationBytes > 0);
        await worker.ping();
      });
    } finally {
      await endpoint.close();
    }
  },
);

test(
  'native connection: close interrupts a certificate wait and reclaims worker',
  {
    skip: !linked,
    timeout: 15000,
  },
  async () => {
    const endpoint = await createRdpTlsFixture();
    try {
      await withWorker(async (worker) => {
        const prompted = once(worker, 'certificate');
        await worker.connect(configuration(endpoint.port, 'prompt'));
        await prompted;
        const started = Date.now();
        await worker.close();
        assert.equal(worker.state, 'closed');
        assert.ok(Date.now() - started < 2000);
      });
    } finally {
      await endpoint.close();
    }
  },
);

test(
  'worker connection API: unsupported settings and absent backend fail explicitly',
  {
    timeout: 15000,
  },
  async () => {
    await withWorker(async (worker) => {
      if (!linked) {
        await assert.rejects(worker.connect(configuration(3389)), {
          code: 'RDP_NOT_IMPLEMENTED',
        });
      } else {
        for (const extra of [
          { security: { protocol: 'rdp' } },
          { security: { certificatePolicy: 'tofu' } },
          { reconnect: { enabled: true } },
          { media: { audioOutput: 'pcm' } },
          { target: { host: '127.0.0.1', preferIPv6: true } },
          { quality: { wallpaper: false } },
          { quality: { targetBitrateKbps: 99 } },
          { quality: { maxBitrateKbps: 20001 } },
        ]) {
          await assert.rejects(
            worker.connect({ ...configuration(3389), ...extra }),
            { code: 'RDP_SETTING_NOT_IMPLEMENTED' },
          );
        }
      }
      await worker.ping();
    });
  },
);
