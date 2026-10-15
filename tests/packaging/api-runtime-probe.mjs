// Artifact-only service check. No lab credentials, external server or devices.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readdir, access } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const base = '/opt/freerdp-bridge';
const runtimeRoot = '/run/freerdp-bridge';
if (process.argv[2] === '--host') {
  const { createSessionServer } = await import(
    base + '/api/dist/session-server.js'
  );
  const { NativeSessionWorker } = await import(
    base + '/api/node_modules/@freerdp-bridge/node/dist/index.js'
  );
  const worker = { workerPath: process.env.BRIDGE_WORKER_PATH, runtimeRoot };
  const server = await createSessionServer({
    worker,
    // Synthetic fixture identity, never a production authentication example.
    authenticate: (request) =>
      request.headers['x-fixture-principal'] === 'synthetic'
        ? { id: 'fixture' }
        : undefined,
    sessions: {
      workerFactory: () => new NativeSessionWorker(worker),
      maxSessions: 1,
    },
  });
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => {
      void server.close();
    });
  await server.listen({ host: '127.0.0.1', port: 8080 });
} else {
  assert.equal(process.platform, 'linux');
  assert.match(process.version, /^v24\./);
  assert.notEqual(process.getuid(), 0);
  for (const path of [
    base + '/api/src',
    base + '/api/node_modules/typescript',
    base + '/api/node_modules/eslint',
    '/work',
  ])
    await assert.rejects(access(path), { code: 'ENOENT' });
  assert.deepEqual(await readdir(runtimeRoot), []);
  const request = async (path, options) => {
    const response = await fetch('http://127.0.0.1:8080' + path, {
      ...options,
      signal: AbortSignal.timeout(3000),
    });
    const body = await response.text();
    assert.ok(body.length < 16384);
    return {
      status: response.status,
      body: body ? JSON.parse(body) : undefined,
    };
  };
  const until = async (test) => {
    const deadline = Date.now() + 10000;
    while (!(await test())) {
      if (Date.now() >= deadline) throw new Error('Service runtime deadline');
      await delay(25);
    }
  };
  const run = async (host) => {
    const child = spawn(
      process.execPath,
      host ? ['/opt/api-runtime-probe.mjs', '--host'] : ['dist/main.js'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const closed = once(child, 'close');
    let output = 0;
    for (const stream of [child.stdout, child.stderr])
      stream.on('data', (bytes) => {
        output += bytes.length;
        if (output > 65536) child.kill('SIGKILL');
      });
    try {
      await until(async () => {
        if (child.exitCode !== null || child.signalCode !== null)
          throw new Error('Service ended before readiness');
        return request('/healthz')
          .then((value) => value.status === 200)
          .catch(() => false);
      });
      const build = (await request('/v1/build')).body;
      assert.equal(build.freeRdpVersion, '3.32.1');
      assert.equal(build.transport, 'unix-seqpacket-rws1');
      assert.equal(build.capabilities.opusInput, true);
      assert.equal(build.capabilities.opusOutput, true);
      const configuration = {
        target: { host: '127.0.0.1', port: 9 },
        auth: {},
        timeouts: { connectMs: 1000 },
      };
      const post = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(configuration),
      };
      assert.equal((await request('/v1/sessions', post)).status, 401);
      if (host) {
        const headers = {
          'content-type': 'application/json',
          'x-fixture-principal': 'synthetic',
        };
        const created = await request('/v1/sessions', { ...post, headers });
        assert.equal(created.status, 202);
        const path = '/v1/sessions/' + created.body.sessionId;
        await until(
          async () =>
            (await request(path, { headers })).body.state === 'failed',
        );
        assert.equal(
          (await request(path, { headers })).body.error.code,
          'RDP_CONNECT_FAILED',
        );
        await request(path, { method: 'DELETE', headers });
      }
      child.kill('SIGTERM');
      const result = await Promise.race([
        closed,
        delay(5000).then(() => {
          throw new Error('Service stop deadline');
        }),
      ]);
      assert.deepEqual(result, [0, null]);
      assert.deepEqual(await readdir(runtimeRoot), []);
    } finally {
      if (child.exitCode === null && child.signalCode === null)
        child.kill('SIGKILL');
      await closed;
    }
  };
  await run(false);
  await run(true);
  console.log(
    JSON.stringify({
      node: process.version,
      uid: process.getuid(),
      api: true,
      privateWorker: true,
      primaryIpc: true,
      defaultAuthDenied: true,
      hostNativeLifecycle: true,
      cleanup: true,
    }),
  );
}
