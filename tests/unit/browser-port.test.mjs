import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomInt } from 'node:crypto';
import {
  listenBrowserHttp,
  listenBrowserLoopback,
} from '../fixtures/browser-port.mjs';

const close = (server) => new Promise((resolve) => server.close(resolve));

test('browser fixture port: actual Fetch rejects a blocked port while the selected HTTP listener remains reachable', async () => {
  await assert.rejects(
    fetch('http://127.0.0.1:2049/'),
    (error) => error.cause?.message === 'bad port',
  );
  const server = createServer((_, response) => response.end('reachable'));
  try {
    const port = await listenBrowserHttp(server);
    assert.ok(port >= 49152 && port <= 65535);
    assert.equal(
      await (await fetch('http://127.0.0.1:' + port)).text(),
      'reachable',
    );
  } finally {
    await close(server);
  }
});

test('browser fixture port: occupied loopback retries preserve the existing server and clean listeners', async () => {
  const occupied = createServer((_, response) => response.end('occupied'));
  const next = createServer((_, response) => response.end('next'));
  const initialErrors = next.listenerCount('error');
  const initialReady = next.listenerCount('listening');
  await listenBrowserHttp(occupied);
  const occupiedPort = occupied.address().port;
  let attempts = 0;
  try {
    const port = await listenBrowserHttp(next, () =>
      ++attempts === 1 ? occupiedPort : randomInt(49152, 65536),
    );
    assert.ok(attempts >= 2 && attempts <= 8);
    assert.ok(port >= 49152 && port <= 65535);
    assert.equal(occupied.listening, true);
    assert.equal(next.listenerCount('error'), initialErrors);
    assert.equal(next.listenerCount('listening'), initialReady);
    assert.equal(
      await (await fetch('http://127.0.0.1:' + port)).text(),
      'next',
    );
  } finally {
    await close(next);
    await close(occupied);
  }
});

test('browser fixture port: finite collision exhaustion and non-collision errors are observable', async () => {
  const occupied = createServer();
  const refused = createServer();
  const initialErrors = refused.listenerCount('error');
  const initialReady = refused.listenerCount('listening');
  await listenBrowserHttp(occupied);
  let attempts = 0;
  try {
    await assert.rejects(
      listenBrowserHttp(refused, () => {
        ++attempts;
        return occupied.address().port;
      }),
      /attempts exhausted/,
    );
    assert.equal(attempts, 8);
    assert.equal(refused.listening, false);
    assert.equal(refused.listenerCount('error'), initialErrors);
    assert.equal(refused.listenerCount('listening'), initialReady);
    const fault = Object.assign(new Error('fixture'), { code: 'EIO' });
    await assert.rejects(
      listenBrowserLoopback(async () => {
        throw fault;
      }),
      (error) => error === fault,
    );
    await assert.rejects(
      listenBrowserLoopback(
        async () => assert.fail('must not listen'),
        () => 2049,
      ),
      /Invalid browser fixture port/,
    );
  } finally {
    await close(refused);
    await close(occupied);
  }
});

test('browser fixture port: Windows denied candidates retry finitely without bypassing OS policy', async () => {
  const fault = Object.assign(new Error('synthetic listen refusal'), {
    code: 'EACCES',
  });
  let calls = 0;
  const listen = async () => {
    if (++calls === 1) throw fault;
  };
  if (process.platform === 'win32') {
    assert.equal(
      await listenBrowserLoopback(listen, () => 49152 + calls),
      49153,
    );
    assert.equal(calls, 2);
    calls = 0;
    await assert.rejects(
      listenBrowserLoopback(async () => {
        ++calls;
        throw fault;
      }),
      (error) =>
        error.message === 'Browser fixture port attempts exhausted' &&
        error.cause === fault,
    );
    assert.equal(calls, 8);
  } else {
    await assert.rejects(
      listenBrowserLoopback(listen),
      (error) => error === fault,
    );
    assert.equal(calls, 1);
  }
});

test('browser fixture port: exhaustion retains the exact final OS error as cause', async () => {
  const fault = Object.assign(new Error('synthetic occupied port'), {
    code: 'EADDRINUSE',
  });
  let calls = 0;
  await assert.rejects(
    listenBrowserLoopback(async () => {
      ++calls;
      throw fault;
    }),
    (error) =>
      error.message === 'Browser fixture port attempts exhausted' &&
      error.cause === fault,
  );
  assert.equal(calls, 8);
});
