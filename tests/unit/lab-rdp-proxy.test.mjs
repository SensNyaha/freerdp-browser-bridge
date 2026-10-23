import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { createLabRdpProxy } from '../../scripts/lab-rdp-proxy.mjs';

test(
  'local TCP fixture proxy forwards bytes once, refuses replacement and joins interruption',
  { timeout: 5000 },
  async () => {
    let upstream;
    let connections = 0;
    const echo = net.createServer((socket) => {
      upstream = socket;
      connections++;
      socket.on('error', () => {});
      socket.pipe(socket);
    });
    echo.listen(0, '127.0.0.1');
    await once(echo, 'listening');
    const proxy = await createLabRdpProxy('127.0.0.1', echo.address().port);
    const client = net.createConnection({ host: proxy.host, port: proxy.port });
    client.on('error', () => {});
    const closed = new Promise((done) => client.once('close', done));
    try {
      await once(client, 'connect');
      const reply = once(client, 'data');
      client.write(Buffer.from('synthetic-wire'));
      assert.equal((await reply)[0].toString(), 'synthetic-wire');
      const extra = net.createConnection({
        host: proxy.host,
        port: proxy.port,
      });
      extra.on('error', () => {});
      await new Promise((done) => extra.once('close', done));
      assert.equal(connections, 1);
      assert.equal(proxy.snapshot().refused, 1);
      const copy = proxy.snapshot();
      copy.accepted = 99;
      assert.equal(proxy.snapshot().accepted, 1);
      proxy.interrupt();
      await closed;
      await proxy.close();
      await proxy.close();
      assert.equal(proxy.snapshot().interrupted, true);
    } finally {
      client.destroy();
      upstream?.destroy();
      await proxy.close();
      await new Promise((done) => echo.close(done));
    }
  },
);
test('local proxy target validation refuses hostnames and malformed ports before binding', async () => {
  for (const [host, port] of [
    ['localhost', 3389],
    ['127.0.0.1', 0],
    ['127.0.0.1', 65536],
    ['127.0.0.1', 1.5],
  ])
    await assert.rejects(
      createLabRdpProxy(host, port),
      /LAB_PROXY_TARGET_INVALID/,
    );
});
