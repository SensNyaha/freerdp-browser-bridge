import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createStandaloneAuthenticator } from '../../apps/standalone/dist/auth.js';
import {
  validateStandaloneConfig,
  readStandaloneConfig,
} from '../../apps/standalone/dist/config.js';
import { standaloneTargetAllowed } from '../../apps/standalone/dist/policy.js';

const require = createRequire(
  new URL('../../apps/standalone/package.json', import.meta.url),
);
const { SignJWT } = await import(pathToFileURL(require.resolve('jose')).href);
// Synthetic ephemeral keys only. Private material never enters a file or log.
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const key = {
  ...publicKey.export({ format: 'jwk' }),
  kid: 'synthetic',
  use: 'sig',
  alg: 'RS256',
};
const base = () => ({
  schemaVersion: 1,
  listen: { host: '127.0.0.1', port: 8080 },
  allowedOrigins: ['https://app.example.test'],
  targets: [{ host: 'rdp.example.test', port: 3389 }],
  limits: { maxSessions: 8, maxPerPrincipal: 2 },
  auth: {
    issuer: 'https://issuer.example.test',
    audience: 'bridge',
    jwks: { keys: [structuredClone(key)] },
  },
});
const request = (token) => ({
  headers: { authorization: 'Bearer ' + token },
});
async function token(claims = {}, header = {}, signingKey = privateKey) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    sub: 'synthetic-user',
    scope: 'rdp:connect',
    iss: base().auth.issuer,
    aud: 'bridge',
    iat: now,
    exp: now + 120,
    ...claims,
  })
    .setProtectedHeader({
      alg: 'RS256',
      typ: 'at+jwt',
      kid: 'synthetic',
      ...header,
    })
    .sign(signingKey);
}

test('standalone verifies signature, issuer/audience, lifetime, type and scope', async () => {
  const authenticate = createStandaloneAuthenticator(base());
  assert.deepEqual(await authenticate(request(await token())), {
    id: 'synthetic-user',
  });
  const now = Math.floor(Date.now() / 1000);
  for (const claims of [
    { iss: 'https://other.example.test' },
    { aud: 'other' },
    { scope: 'other' },
    { exp: now - 60 },
    { iat: now - 1000 },
    { nbf: now + 60 },
    { sub: '' },
    { sub: 'x'.repeat(257) },
    { sub: undefined },
    { exp: undefined },
    { iat: undefined },
  ])
    assert.equal(await authenticate(request(await token(claims))), undefined);
  assert.equal(
    await authenticate(request(await token({}, { typ: 'other' }))),
    undefined,
  );
  const wrong = generateKeyPairSync('rsa', { modulusLength: 2048 });
  assert.equal(
    await authenticate(request(await token({}, {}, wrong.privateKey))),
    undefined,
  );
  assert.equal(
    await authenticate(request(await token({}, { kid: 'unknown' }))),
    undefined,
  );
  const hmac = await new SignJWT({ sub: 'synthetic-user' })
    .setProtectedHeader({ alg: 'HS256', kid: 'synthetic', typ: 'at+jwt' })
    .sign(Buffer.alloc(32, 1));
  assert.equal(await authenticate(request(hmac)), undefined);
  // Untrusted token headers never redirect local key selection to a URL.
  assert.deepEqual(
    await authenticate(
      request(await token({}, { jku: 'https://untrusted.invalid/jwks' })),
    ),
    { id: 'synthetic-user' },
  );
});

test('standalone defaults deny, refuses cookies, malformed/oversize JWT and bounds concurrent verification', async () => {
  const config = base();
  delete config.auth;
  assert.equal(
    await createStandaloneAuthenticator(config)(request(await token())),
    undefined,
  );
  const authenticate = createStandaloneAuthenticator(base());
  const valid = await token();
  for (const headers of [
    {},
    { authorization: 'Basic synthetic' },
    { authorization: 'Bearer ' + 'x'.repeat(8192) },
    { authorization: 'Bearer e30.e30.e30' },
    { authorization: 'Bearer ' + valid, cookie: '' },
    { authorization: 'Bearer ' + valid, cookie: 'unrelated=synthetic' },
  ])
    assert.equal(await authenticate({ headers }), undefined);
  const replies = await Promise.all(
    Array.from({ length: 32 }, () => authenticate(request(valid))),
  );
  assert.equal(replies.filter(Boolean).length, 16);
  assert.deepEqual(await authenticate(request(valid)), {
    id: 'synthetic-user',
  });
});

test('standalone config refuses secrets/private keys, invalid bounds, remote listener and ambiguous public keys', () => {
  const config = base();
  const checked = validateStandaloneConfig(config);
  config.auth.jwks.keys[0].kid = 'mutated';
  assert.equal(checked.auth.jwks.keys[0].kid, 'synthetic');
  const rejected = [];
  const alter = (edit) => {
    const value = base();
    edit(value);
    rejected.push(value);
  };
  alter((value) => (value.password = 'synthetic-rejected'));
  alter((value) => (value.listen.host = '0.0.0.0'));
  alter((value) => (value.limits.maxSessions = 100));
  alter((value) => (value.limits.maxPerPrincipal = 9));
  alter((value) => (value.auth.jwks.keys[0] = { ...key, d: 'private' }));
  alter((value) => (value.auth.jwks.keys[0] = { kty: 'oct', k: 'secret' }));
  alter((value) => value.auth.jwks.keys.push({ ...key }));
  alter((value) => (value.allowedOrigins = ['https://app.example.test/path']));
  alter((value) => (value.allowedOrigins = ['http://public.example.test']));
  for (const value of rejected)
    assert.throws(() => validateStandaloneConfig(value), {
      message: 'STANDALONE_CONFIG_INVALID',
    });
});

test('standalone config reads bounded regular files and uses fixed errors', async () => {
  const root = await mkdtemp(resolve('build/standalone-config-'));
  try {
    const path = join(root, 'config.json');
    await writeFile(path, JSON.stringify(base()));
    assert.equal((await readStandaloneConfig(path)).schemaVersion, 1);
    for (const bytes of ['{invalid', 'x'.repeat(65537)]) {
      await writeFile(path, bytes);
      await assert.rejects(readStandaloneConfig(path), {
        message: 'STANDALONE_CONFIG_INVALID',
      });
    }
    await assert.rejects(readStandaloneConfig(root), {
      message: 'STANDALONE_CONFIG_INVALID',
    });
  } finally {
    assert.equal(resolve(root, '..'), resolve('build'));
    await rm(root, { recursive: true, force: true });
  }
});

test('standalone destination policy requires an exact approved target and refuses alternate gateway/proxy routes', () => {
  const session = { target: { host: 'RDP.example.test' }, auth: {} };
  assert.equal(standaloneTargetAllowed(base(), session), true);
  for (const value of [
    { ...session, target: { host: 'other.example.test' } },
    { ...session, target: { host: 'rdp.example.test', port: 3390 } },
    { ...session, gateway: { enabled: true, host: 'other.example.test' } },
    {
      ...session,
      proxy: { type: 'http', host: 'other.example.test', port: 80 },
    },
    { ...session, target: { ...session.target, serverName: 'other' } },
  ])
    assert.equal(standaloneTargetAllowed(base(), value), false);
});
