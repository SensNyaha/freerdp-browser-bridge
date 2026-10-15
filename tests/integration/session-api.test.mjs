import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { Writable } from 'node:stream';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createSessionServer } from '../../apps/bridge-api/dist/session-server.js';
import { createSecureLogger } from '../../apps/bridge-api/dist/logging.js';
import { eventually, fakeFactory } from '../fixtures/session-worker.mjs';
const { WebSocket } = createRequire(
  new URL('../../apps/bridge-api/package.json', import.meta.url),
)('ws');
const origin = 'https://ui.example.test';
const suffix = process.platform === 'win32' ? '.exe' : '';
const workerPath = join(
  resolve(process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation'),
  'rdp-worker' + suffix,
);
const config = () => ({
  target: { host: 'rdp.example.test' },
  auth: { username: 'example-user', password: randomBytes(24).toString('hex') },
  gateway: {
    enabled: true,
    host: 'gateway.example.test',
    password: randomBytes(24).toString('hex'),
    accessToken: randomBytes(24).toString('hex'),
  },
});
async function withServer(options, run) {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'rdp-session-api-'));
  const a = randomBytes(32).toString('base64url');
  const b = randomBytes(32).toString('base64url');
  const logs = [];
  const factory = fakeFactory(options.mode);
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      logs.push(chunk.toString());
      callback();
    },
  });
  const server = await createSessionServer({
    worker: { workerPath, runtimeRoot },
    authenticate: (request) => {
      if (request.headers.authorization === 'Bearer ' + a)
        return { id: 'principal-a' };
      if (request.headers.authorization === 'Bearer ' + b)
        return { id: 'principal-b' };
      return undefined;
    },
    allowedOrigins: [origin],
    sessions: options.native
      ? {}
      : { ...factory, createBurst: 100, ...options.sessions },
    logDestination: destination,
  });
  const request = (method, url, payload, actor = a, extra = {}) =>
    server.inject({
      method,
      url,
      ...(payload === undefined ? {} : { payload }),
      headers: { authorization: 'Bearer ' + actor, ...extra },
    });
  try {
    await server.listen({ host: '127.0.0.1', port: 0 });
    const address = server.server.address();
    const wsBase = 'ws://127.0.0.1:' + address.port;
    await run({ server, request, factory, logs, a, b, wsBase, runtimeRoot });
  } finally {
    await server.close();
    assert.deepEqual(await readdir(runtimeRoot), []);
    await rm(runtimeRoot, { recursive: true, force: true, maxRetries: 3 });
  }
}
async function open(wsBase, id, channel, token, header = false) {
  const ws = new WebSocket(
    wsBase +
      '/v1/sessions/' +
      id +
      '/' +
      channel +
      (header ? '' : '?token=' + token),
    ['freerdp-bridge-v1'],
    {
      origin,
      headers: header ? { authorization: 'Bearer ' + token } : {},
    },
  );
  ws.on('error', () => {});
  const message = once(ws, 'message');
  await once(ws, 'open');
  if (channel === 'media')
    ws.send(
      JSON.stringify({ v: 1, type: 'media.hello', data: { codecs: ['jpeg'] } }),
    );
  const [data] = await message;
  return { ws, first: JSON.parse(data.toString()) };
}
async function rejected(wsBase, id, channel, token, options = {}) {
  return new Promise((done, reject) => {
    const ws = new WebSocket(
      wsBase + '/v1/sessions/' + id + '/' + channel + '?token=' + token,
      ['freerdp-bridge-v1'],
      { origin, ...options },
    );
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error('Rejected-upgrade test deadline exceeded'));
    }, 3000);
    ws.on('error', () => {});
    ws.on('open', () => {
      clearTimeout(timer);
      ws.terminate();
      reject(new Error('Unauthorized socket upgraded'));
    });
    ws.on('unexpected-response', (_request, response) => {
      clearTimeout(timer);
      response.resume();
      ws.terminate();
      done(response.statusCode);
    });
  });
}
async function closeSocket(ws) {
  if (ws.readyState === WebSocket.CLOSED) return;
  const closed = once(ws, 'close');
  ws.close();
  await closed;
}

test('fake-backend HTTP: owner lifecycle, strict input validation, fresh attach credentials and safe responses', async () => {
  await withServer({}, async ({ request, server, a, b, logs }) => {
    assert.equal(
      (await server.inject('/v1/sessions/' + 'a'.repeat(32))).statusCode,
      401,
    );
    const input = config();
    const response = await request('POST', '/v1/sessions', input);
    assert.equal(response.statusCode, 202, response.body);
    assert.equal(response.headers['cache-control'], 'no-store');
    const session = response.json();
    assert.match(session.sessionId, /^[a-f0-9]{32}$/);
    assert.equal(session.attach.control.role, 'controller');
    assert.equal(session.attach.media.channel, 'media');
    assert.ok(!response.body.includes(input.auth.password));
    assert.ok(!response.body.includes(input.gateway.password));
    const get = await request('GET', '/v1/sessions/' + session.sessionId);
    assert.ok(!get.body.includes('token'));
    assert.ok(!get.body.includes(input.target.host));
    assert.equal(
      (await request('GET', '/v1/sessions/' + session.sessionId, undefined, b))
        .statusCode,
      404,
    );
    assert.equal(
      (
        await request(
          'DELETE',
          '/v1/sessions/' + session.sessionId,
          undefined,
          b,
        )
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await request(
          'POST',
          '/v1/sessions/' + session.sessionId + '/attach-token',
          { channel: 'control' },
          b,
        )
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await request('POST', '/v1/sessions', {
          ...input,
          rawArgv: ['/cert:ignore'],
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await request('POST', '/v1/sessions', {
          ...input,
          target: { ...input.target, port: '3389' },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await request('POST', '/v1/sessions', {
          ...input,
          auth: { ...input.auth, mode: 'restricted-admin' },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await request(
          'POST',
          '/v1/sessions/' + session.sessionId + '/attach-token',
          { channel: 'control', role: 'viewer' },
        )
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await request('POST', '/v1/sessions', input, a, {
          origin: 'https://untrusted.example.test',
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await request('POST', '/v1/sessions', input, a, {
          cookie: 'session=example',
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (await request('DELETE', '/v1/sessions/' + session.sessionId)).json()
        .state,
      'closed',
    );
    assert.equal(
      (await request('DELETE', '/v1/sessions/' + session.sessionId)).statusCode,
      200,
    );
    assert.equal(
      (
        await request(
          'POST',
          '/v1/sessions/' + session.sessionId + '/attach-token',
          { channel: 'control' },
        )
      ).statusCode,
      409,
    );
    for (const secret of [
      input.auth.password,
      input.gateway.password,
      input.gateway.accessToken,
      session.attach.control.token,
      session.attach.media.token,
      a,
      b,
    ])
      assert.ok(!logs.join('').includes(secret));
  });
});

test('fake-backend WebSocket: Origin, channel/session scope, one controller, replay and detach', async () => {
  await withServer({}, async ({ request, wsBase, logs }) => {
    const one = (await request('POST', '/v1/sessions', config())).json();
    const two = (await request('POST', '/v1/sessions', config())).json();
    const token = one.attach.control.token;
    assert.equal(
      await rejected(wsBase, one.sessionId, 'control', token, {
        origin: 'https://untrusted.example.test',
      }),
      403,
    );
    assert.equal(await rejected(wsBase, two.sessionId, 'control', token), 401);
    assert.equal(await rejected(wsBase, one.sessionId, 'media', token), 401);
    const attached = await open(wsBase, one.sessionId, 'control', token);
    assert.equal(attached.first.type, 'session.state');
    assert.equal(attached.first.data.sessionId, one.sessionId);
    assert.equal(await rejected(wsBase, one.sessionId, 'control', token), 401);
    const replacement = (
      await request('POST', '/v1/sessions/' + one.sessionId + '/attach-token', {
        channel: 'control',
      })
    ).json();
    assert.equal(
      await rejected(wsBase, one.sessionId, 'control', replacement.token),
      409,
    );
    const invalid = once(attached.ws, 'message');
    attached.ws.send(
      JSON.stringify({
        v: 1,
        type: 'unknown.command',
        seq: 1,
        ts: Date.now(),
        data: {},
      }),
    );
    assert.equal(
      JSON.parse((await invalid)[0].toString()).data.code,
      'CONTROL_PROTOCOL_ERROR',
    );
    const unsupported = once(attached.ws, 'message');
    attached.ws.send(
      JSON.stringify({
        v: 1,
        type: 'clipboard.request',
        seq: 2,
        ts: Date.now(),
        data: {},
      }),
    );
    assert.equal(
      JSON.parse((await unsupported)[0].toString()).data.code,
      'CONTROL_NOT_IMPLEMENTED',
    );
    const closed = once(attached.ws, 'close');
    attached.ws.send(
      JSON.stringify({
        v: 1,
        type: 'session.detach',
        seq: 3,
        ts: Date.now(),
        data: {},
      }),
    );
    await closed;
    const reattached = await open(
      wsBase,
      one.sessionId,
      'control',
      replacement.token,
      true,
    );
    await closeSocket(reattached.ws);
    const media = await open(
      wsBase,
      one.sessionId,
      'media',
      one.attach.media.token,
    );
    assert.equal(media.first.type, 'media.error');
    assert.equal(media.first.data.code, 'MEDIA_NOT_IMPLEMENTED');
    await closeSocket(media.ws);
    assert.equal(
      await rejected(wsBase, one.sessionId, 'media', one.attach.media.token),
      401,
    );
    for (const secret of [token, replacement.token, one.attach.media.token])
      assert.ok(!logs.join('').includes(secret));
  });
});

test('fake-backend WebSocket: expired credentials, binary/oversized/flooded control and shutdown cleanup', async () => {
  let clock = Date.now();
  await withServer(
    { sessions: { now: () => clock, tokenTtlMs: 100 } },
    async ({ request, wsBase, server }) => {
      const one = (await request('POST', '/v1/sessions', config())).json();
      clock += 100;
      assert.equal(
        await rejected(
          wsBase,
          one.sessionId,
          'control',
          one.attach.control.token,
        ),
        401,
      );
      for (const payload of [Buffer.from('binary'), 'x'.repeat(4097)]) {
        const token = (
          await request(
            'POST',
            '/v1/sessions/' + one.sessionId + '/attach-token',
            { channel: 'control' },
          )
        ).json().token;
        const { ws } = await open(wsBase, one.sessionId, 'control', token);
        const closed = once(ws, 'close');
        ws.send(payload);
        const [code] = await closed;
        assert.ok([1003, 1009].includes(code), String(code));
      }
      const token = (
        await request(
          'POST',
          '/v1/sessions/' + one.sessionId + '/attach-token',
          { channel: 'control' },
        )
      ).json().token;
      const { ws } = await open(wsBase, one.sessionId, 'control', token);
      const closed = once(ws, 'close');
      for (let seq = 0; seq < 40; seq++)
        ws.send(
          JSON.stringify({
            v: 1,
            type: 'unknown.command',
            seq,
            ts: Date.now(),
            data: {},
          }),
        );
      assert.equal((await closed)[0], 1008);
      assert.ok(
        ['connecting', 'connected'].includes(
          (await request('GET', '/v1/sessions/' + one.sessionId)).json().state,
        ),
      );
      const next = (
        await request(
          'POST',
          '/v1/sessions/' + one.sessionId + '/attach-token',
          { channel: 'control' },
        )
      ).json().token;
      const attached = await open(wsBase, one.sessionId, 'control', next);
      const shutdownClose = once(attached.ws, 'close');
      await server.close();
      await shutdownClose;
      assert.equal(attached.ws.readyState, WebSocket.CLOSED);
    },
  );
});

test('fake-backend HTTP/WS: worker crash is isolated, structured and never leaks worker diagnostics', async () => {
  await withServer({}, async ({ request, wsBase, factory, logs }) => {
    const one = (await request('POST', '/v1/sessions', config())).json();
    const two = (await request('POST', '/v1/sessions', config())).json();
    const attached = await open(
      wsBase,
      one.sessionId,
      'control',
      one.attach.control.token,
    );
    const events = [];
    attached.ws.on('message', (data) =>
      events.push(JSON.parse(data.toString())),
    );
    const closed = once(attached.ws, 'close');
    factory.workers[0].crash();
    await closed;
    assert.ok(
      events.some(
        (event) =>
          event.type === 'session.error' && event.data.code === 'WORKER_FAILED',
      ),
    );
    assert.equal(
      (await request('GET', '/v1/sessions/' + one.sessionId)).json().state,
      'failed',
    );
    await eventually(() => factory.workers[0].closed === 1);
    assert.equal(
      (await request('GET', '/v1/sessions/' + two.sessionId)).json().state,
      'connected',
    );
    assert.ok(!logs.join('').includes('untrusted worker diagnostic'));
  });
});

test('fake-backend HTTP: session/token/body limits and metrics have no identity or credential labels', async () => {
  await withServer(
    { sessions: { maxSessions: 1, maxPerPrincipal: 1, createBurst: 3 } },
    async ({ request, logs, a }) => {
      const input = config();
      const one = (await request('POST', '/v1/sessions', input)).json();
      assert.equal(
        (await request('POST', '/v1/sessions', config())).statusCode,
        429,
      );
      assert.equal(
        (await request('POST', '/v1/sessions', config())).statusCode,
        429,
      );
      assert.equal(
        (await request('POST', '/v1/sessions', config())).json().code,
        'CREATE_RATE_LIMIT',
      );
      const url = '/v1/sessions/' + one.sessionId + '/attach-token';
      assert.equal(
        (await request('POST', url, { channel: 'control' })).statusCode,
        200,
      );
      assert.equal(
        (await request('POST', url, { channel: 'media' })).statusCode,
        200,
      );
      assert.equal(
        (await request('POST', url, { channel: 'control' })).statusCode,
        429,
      );
      const huge = await request('POST', '/v1/sessions', {
        ...input,
        padding: 'x'.repeat(65536),
      });
      assert.equal(huge.statusCode, 413);
      const metrics = await request('GET', '/metrics');
      assert.equal(metrics.statusCode, 200);
      assert.match(metrics.body, /bridge_sessions_active 1/);
      assert.match(metrics.body, /bridge_sessions_created_total 1/);
      for (const sensitive of [
        a,
        one.sessionId,
        input.auth.username,
        input.target.host,
        input.auth.password,
        one.attach.control.token,
        'principal-a',
      ])
        assert.ok(!metrics.body.includes(sensitive));
      assert.ok(!logs.join('').includes(input.auth.password));
    },
  );
});

test('native-worker HTTP: session creation rejects unavailable RDP capability without spawning a simulated session', async () => {
  await withServer({ native: true }, async ({ request, factory }) => {
    const response = await request('POST', '/v1/sessions', config());
    assert.equal(response.statusCode, 501);
    assert.equal(response.json().code, 'RDP_NOT_IMPLEMENTED');
    assert.equal(factory.workers.length, 0);
    const ready = await request('GET', '/readyz');
    assert.equal(ready.json().rdp, false);
  });
});

test('secure logger: recursive credential redaction and URL/header omission', () => {
  const lines = [];
  const logger = createSecureLogger({ write: (line) => lines.push(line) });
  const secret = randomBytes(24).toString('hex');
  logger.info(
    {
      req: {
        method: 'GET',
        url: '/control?token=' + secret,
        headers: { authorization: secret },
      },
      nested: [
        { gateway: { password: secret, accessToken: secret }, pin: secret },
      ],
    },
    'redaction test',
  );
  logger
    .child({ gateway: { password: secret }, accessToken: secret })
    .info({ err: new Error(secret) }, 'child redaction test');
  const child = logger.child({ component: 'safe-child' });
  child.setBindings({ nested: [{ pin: secret }] });
  child
    .child({ proxy: { password: secret } })
    .warn('grandchild redaction test');
  logger.info({ value: 'x'.repeat(65536) }, 'oversized record');
  logger.error(new Error(secret));
  child.error({ err: new Error(secret) });
  assert.ok(
    lines.some((line) => JSON.parse(line).code === 'LOG_RECORD_REJECTED'),
  );
  assert.ok(!lines.join('').includes(secret));
  assert.ok(!lines.join('').includes('/control?token='));
  assert.ok(lines.join('').includes('[REDACTED]'));
});

test('fake-backend diagnostics: HTTP rejection, backend failure and metrics contain no credential canaries', async () => {
  await withServer({}, async ({ request, server, factory, logs, a }) => {
    const input = config();
    const canary = randomBytes(32).toString('base64url');
    input.auth.password = canary;
    const responses = [];
    responses.push(
      await request('POST', '/v1/sessions', { ...input, unknown: canary }),
    );
    responses.push(
      await request(
        'POST',
        '/v1/sessions',
        '{"password":"' + canary,
        undefined,
        { 'content-type': 'application/json' },
      ),
    );
    responses.push(
      await request('POST', '/v1/sessions', canary, undefined, {
        'content-type': 'application/unrecognized',
      }),
    );
    responses.push(
      await request('POST', '/v1/sessions', {
        ...input,
        unknown: canary.repeat(2048),
      }),
    );
    responses.push(
      await request(
        'GET',
        '/v1/sessions/' + 'a'.repeat(32) + '?token=' + canary,
        undefined,
        canary,
      ),
    );
    responses.push(
      await request('GET', '/missing/' + canary + '?token=' + canary),
    );
    assert.deepEqual(
      responses.map((response) => response.statusCode),
      [400, 400, 415, 413, 401, 404],
    );
    const one = (await request('POST', '/v1/sessions', input)).json();
    await eventually(
      () => factory.workers.length === 1 && factory.workers[0].started === 1,
    );
    factory.workers[0].emit('failure', new Error(canary));
    await eventually(() => factory.workers[0].closed === 1);
    const failed = await request('GET', '/v1/sessions/' + one.sessionId);
    assert.deepEqual(failed.json().error, {
      code: 'WORKER_FAILED',
      message: 'Session worker failed',
      retryable: true,
    });
    responses.push(failed);
    const metrics = await request('GET', '/metrics');
    for (const value of [
      canary,
      a,
      input.gateway.password,
      input.gateway.accessToken,
    ]) {
      assert.ok(
        !logs.join('').includes(value),
        'log contains credential canary',
      );
      assert.ok(
        !metrics.body.includes(value),
        'metric contains credential canary',
      );
      assert.ok(
        responses.every((response) => !response.body.includes(value)),
        'error response contains credential canary',
      );
    }
    for (const value of [
      input.auth.username,
      input.target.host,
      one.sessionId,
      one.attach.control.token,
      one.attach.media.token,
    ])
      assert.ok(!metrics.body.includes(value));
    const rejectionSnapshot = logs
      .flatMap((line) => line.trim().split('\n'))
      .map((line) => JSON.parse(line))
      .filter((record) => record.msg === 'request rejected')
      .map((record) => ({ code: record.code, msg: record.msg }));
    assert.deepEqual(rejectionSnapshot, [
      { code: 'INVALID_SESSION_CONFIG', msg: 'request rejected' },
      { code: 'INVALID_SESSION_CONFIG', msg: 'request rejected' },
      { code: 'AUTH_REQUIRED', msg: 'request rejected' },
    ]);
    assert.equal((await server.inject({ url: '/healthz' })).statusCode, 200);
  });
});

test('HTTP regression: MIME edge cases and malformed/encoded routes cannot bypass authorization or schemas', async () => {
  await withServer({}, async ({ request, server }) => {
    const session = (await request('POST', '/v1/sessions', config())).json();
    for (const url of [
      '/metrics',
      '/%6detri%63s',
      '/v1/%73essions/' + session.sessionId,
      '/v1/sessions/%zz',
    ]) {
      const response = await server.inject({ method: 'GET', url });
      assert.ok(response.statusCode >= 400, url);
      assert.ok(!response.body.includes(session.sessionId));
      assert.ok(!response.body.includes('bridge_sessions_active'));
    }
    for (const contentType of [
      'application/json\tignored',
      ' application/json',
    ]) {
      const response = await request(
        'POST',
        '/v1/sessions/' + session.sessionId + '/attach-token',
        { channel: 'control', role: 'viewer' },
        undefined,
        { 'content-type': contentType },
      );
      assert.ok([400, 415].includes(response.statusCode), response.body);
      assert.ok(!response.body.includes('"token":'));
    }
  });
});
