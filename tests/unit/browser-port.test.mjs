import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomInt } from 'node:crypto';
import {
  listenBrowserHttp,
  listenBrowserLoopback,
} from '../fixtures/browser-port.mjs';

const close = (server) => new Promise((resolve) => server.close(resolve));

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
    const fault = Object.assign(new Error('fixture'), { code: 'EACCES' });
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
