import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { generateKeyPairSync } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createStandaloneServer } from '../../apps/standalone/dist/server.js';
import { createRdpTlsFixture } from '../fixtures/rdp-tls.mjs';

const require = createRequire(
  new URL('../../apps/standalone/package.json', import.meta.url),
);
const { SignJWT } = await import(pathToFileURL(require.resolve('jose')).href);
const workerPath = resolve(
  process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
  'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
);
const linked =
  JSON.parse(
    execFileSync(workerPath, ['--capabilities'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5000,
      maxBuffer: 65536,
    }),
  ).capabilities.connectCore === true;
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const config = (port) => ({
  schemaVersion: 1,
  listen: { host: '127.0.0.1', port: 8080 },
  allowedOrigins: ['https://app.example.test'],
  targets: [{ host: '127.0.0.1', port }],
  limits: { maxSessions: 1, maxPerPrincipal: 1 },
  auth: {
    issuer: 'https://issuer.example.test',
    audience: 'bridge',
    jwks: {
      keys: [
        {
          ...publicKey.export({ format: 'jwk' }),
          kid: 'synthetic',
          alg: 'RS256',
          use: 'sig',
        },
      ],
    },
  },
});
async function headers(subject = 'synthetic-owner') {
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({
    sub: subject,
    scope: 'rdp:connect',
    iss: config(9).auth.issuer,
    aud: 'bridge',
    iat: now,
    exp: now + 120,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'synthetic', typ: 'at+jwt' })
    .sign(privateKey);
  return { authorization: 'Bearer ' + jwt };
}

test('standalone service denies unauthenticated sessions and unapproved destinations without exposing request secrets', async () => {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'bridge-standalone-'));
  const server = await createStandaloneServer(config(9), {
    workerPath,
    runtimeRoot,
  });
  try {
    assert.equal((await server.inject('/rdp/healthz')).statusCode, 200);
    const payload = { target: { host: '127.0.0.1', port: 9 }, auth: {} };
    assert.equal(
      (
        await server.inject({
          method: 'POST',
          url: '/rdp/v1/sessions',
          payload,
        })
      ).statusCode,
      401,
    );
    const owner = await headers();
    for (const change of [
      { target: { host: 'other.invalid', port: 9 } },
      { gateway: { enabled: true, host: 'other.invalid' } },
      { proxy: { type: 'http', host: 'other.invalid', port: 80 } },
    ]) {
      const response = await server.inject({
        method: 'POST',
        url: '/rdp/v1/sessions',
        headers: owner,
        payload: {
          ...payload,
          auth: { password: 'synthetic-do-not-echo' },
          ...change,
        },
      });
      assert.equal(response.statusCode, 403);
      assert.equal(response.body.includes('synthetic-do-not-echo'), false);
      assert.equal(response.body.includes(owner.authorization), false);
    }
    assert.deepEqual(await readdir(runtimeRoot), []);
  } finally {
    await server.close();
    await rm(runtimeRoot, { recursive: true, force: true });
  }
});

async function nativeFailure(expected) {
  const endpoint = await createRdpTlsFixture();
  const runtimeRoot = await mkdtemp(
    join(tmpdir(), 'bridge-standalone-native-'),
  );
  const server = await createStandaloneServer(config(endpoint.port), {
    workerPath,
    runtimeRoot,
  });
  try {
    const owner = await headers();
    const response = await server.inject({
      method: 'POST',
      url: '/rdp/v1/sessions',
      headers: owner,
      payload: {
        target: { host: '127.0.0.1', port: endpoint.port },
        auth: { username: 'synthetic', password: 'synthetic-only-in-memory' },
        security: { protocol: 'tls', certificatePolicy: 'strict' },
        timeouts: { connectMs: 5000 },
      },
    });
    assert.equal(response.statusCode, 202, response.body);
    const path = '/rdp/v1/sessions/' + response.json().sessionId;
    assert.equal(
      (await server.inject({ url: path, headers: await headers('other') }))
        .statusCode,
      404,
    );
    const deadline = performance.now() + 7000;
    let final;
    do {
      final = (await server.inject({ url: path, headers: owner })).json();
      if (final.state === 'failed') break;
      if (performance.now() > deadline)
        throw new Error('STANDALONE_NATIVE_TEST_DEADLINE');
      await new Promise((done) => setTimeout(done, 10));
    } while (true);
    assert.equal(final.error.code, expected);
    assert.equal(endpoint.applicationBytes, 0);
    await server.close();
    assert.deepEqual(await readdir(runtimeRoot), []);
  } finally {
    await server.close();
    await endpoint.close();
    await rm(runtimeRoot, { recursive: true, force: true });
  }
}
test(
  'standalone / linked native: JWT owner isolation, strict TLS rejection and joined cleanup',
  { skip: !linked, timeout: 20000 },
  () => nativeFailure('RDP_CERTIFICATE_REJECTED'),
);
test(
  'standalone / native foundation: JWT owner isolation, explicit unlinked refusal and joined cleanup',
  { skip: linked, timeout: 20000 },
  () => nativeFailure('RDP_NOT_IMPLEMENTED'),
);
