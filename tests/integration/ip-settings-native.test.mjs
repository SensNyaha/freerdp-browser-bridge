import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkerProcess } from '../../packages/node-bridge/dist/index.js';
import { createRdpTlsFixture } from '../fixtures/rdp-tls.mjs';
import { eventually } from '../fixtures/session-worker.mjs';

const workerPath = resolve(
  process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
  'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
);
const supported =
  JSON.parse(
    execFileSync(workerPath, ['--capabilities'], {
      encoding: 'utf8',
      windowsHide: true,
    }),
  ).capabilities.ipSettings === true;

async function ipv6Available() {
  const server = net.createServer();
  try {
    await new Promise((done, reject) => {
      server.once('error', reject);
      server.listen({ host: '::1', port: 0, ipv6Only: true }, done);
    });
    return true;
  } catch (error) {
    if (['EADDRNOTAVAIL', 'EAFNOSUPPORT'].includes(error.code)) return false;
    throw error;
  } finally {
    if (server.listening) await new Promise((done) => server.close(done));
  }
}

test('TLS fixture rejects non-loopback selection before acquiring resources', async () => {
  for (const host of ['example.test', '0.0.0.0', '::', null, {}])
    await assert.rejects(createRdpTlsFixture(host), {
      message: 'TLS fixture host must be loopback',
    });
});

for (const item of [
  {
    name: 'forced IPv4',
    host: '127.0.0.1',
    selected: { forceIpVersion: 4 },
    reaches: true,
  },
  {
    name: 'prefer IPv6 with forced IPv4',
    host: '127.0.0.1',
    selected: { preferIPv6: true, forceIpVersion: 4 },
    reaches: true,
  },
  {
    name: 'prefer IPv6 with only IPv4 literal available',
    host: '127.0.0.1',
    selected: { preferIPv6: true },
    reaches: true,
  },
  {
    name: 'forced IPv6',
    host: '::1',
    selected: { forceIpVersion: 6 },
    reaches: true,
  },
  {
    name: 'forced IPv6 refuses IPv4 literal',
    host: '127.0.0.1',
    selected: { forceIpVersion: 6 },
    reaches: false,
  },
  {
    name: 'forced IPv4 refuses IPv6 literal',
    host: '::1',
    selected: { forceIpVersion: 4 },
    reaches: false,
  },
])
  test(
    `actual FreeRDP IP selection / synthetic TLS: ${item.name}`,
    { skip: !supported, timeout: 15000 },
    async (context) => {
      if (item.host === '::1' && !(await ipv6Available())) {
        context.skip('IPv6 loopback listener unavailable');
        return;
      }
      const endpoint = await createRdpTlsFixture(item.host);
      const root = await mkdtemp(join(tmpdir(), 'bridge-ip-native-'));
      const worker = new WorkerProcess({
        workerPath,
        runtimeRoot: root,
        ipcTransport: 'framed-pipes',
      });
      let prompt, terminal, pid;
      worker.on('certificate', (value) => {
        prompt = value;
      });
      worker.on('rdp-state', (value) => {
        if (value.state === 'failed' || value.state === 'closed')
          terminal = value;
      });
      try {
        assert.equal((await worker.start()).capabilities.ipSettings, true);
        pid = worker.pid;
        await worker.connect({
          target: { host: item.host, port: endpoint.port, ...item.selected },
          auth: { username: 'synthetic', password: 'synthetic-IPC-sentinel' },
          security: { protocol: 'tls', certificatePolicy: 'prompt' },
          timeouts: { connectMs: 4000 },
        });
        await eventually(
          () => (item.reaches ? prompt !== undefined : terminal !== undefined),
          7000,
        );
        if (item.reaches) {
          assert.equal(endpoint.connections, 1);
          assert.match(prompt.fingerprint, /^sha256:[0-9a-f]{64}$/);
          await worker.ping();
          await worker.decideCertificate(prompt, false);
          await eventually(() => terminal !== undefined, 3000);
          assert.equal(terminal.error, 'RDP_CERTIFICATE_REJECTED');
        } else {
          assert.equal(endpoint.connections, 0);
          assert.equal(prompt, undefined);
          assert.equal(terminal.error, 'RDP_CONNECT_FAILED');
        }
        assert.equal(endpoint.applicationBytes, 0);
        await worker.ping();
      } finally {
        try {
          await worker.close();
          assert.deepEqual(await readdir(root), []);
          if (pid !== undefined)
            assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
        } finally {
          await endpoint.close();
          await rm(root, { recursive: true, force: true, maxRetries: 3 });
        }
      }
    },
  );
