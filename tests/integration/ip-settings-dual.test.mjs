import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { lookup } from 'node:dns/promises';
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

test('TLS fixture refuses invalid bind ports before acquisition', async () => {
  for (const port of [-1, 65536, 1.5, '443', null, {}, NaN])
    await assert.rejects(createRdpTlsFixture('127.0.0.1', port), {
      message: 'TLS fixture port must be bounded',
    });
});

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

test(
  'actual FreeRDP / localhost dual-family TLS: preference, resolver order, force and IPv4 fallback',
  { skip: !supported, timeout: 30000 },
  async (context) => {
    const addresses = await lookup('localhost', { all: true, verbatim: true });
    assert.ok(addresses.length > 0 && addresses.length <= 16);
    assert.ok(
      addresses.every(
        ({ address, family }) =>
          (address === '127.0.0.1' && family === 4) ||
          (address === '::1' && family === 6),
      ),
    );
    if (
      !addresses.some(({ family }) => family === 4) ||
      !addresses.some(({ family }) => family === 6) ||
      !(await ipv6Available())
    ) {
      context.skip('Dual-family localhost/IPv6 listener unavailable');
      return;
    }
    let ipv4, ipv6;
    async function connect(selected, expectedFamily) {
      const before4 = ipv4.connections,
        before6 = ipv6?.connections ?? 0;
      const root = await mkdtemp(join(tmpdir(), 'bridge-ip-dual-'));
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
        if (['failed', 'closed'].includes(value.state)) terminal = value;
      });
      try {
        await worker.start();
        pid = worker.pid;
        await worker.connect({
          target: { host: 'localhost', port: ipv4.port, ...selected },
          auth: { username: 'synthetic', password: 'synthetic-IPC-sentinel' },
          security: { protocol: 'tls', certificatePolicy: 'prompt' },
          timeouts: { connectMs: 4000 },
        });
        await eventually(
          () =>
            expectedFamily === 0
              ? terminal !== undefined
              : prompt !== undefined,
          7000,
        );
        if (expectedFamily === 0) {
          assert.equal(prompt, undefined);
          assert.equal(terminal.error, 'RDP_CONNECT_FAILED');
        } else {
          await worker.ping();
          await worker.decideCertificate(prompt, false);
          await eventually(() => terminal !== undefined, 3000);
          assert.equal(terminal.error, 'RDP_CERTIFICATE_REJECTED');
        }
        assert.equal(ipv4.connections - before4, expectedFamily === 4 ? 1 : 0);
        assert.equal(
          (ipv6?.connections ?? 0) - before6,
          expectedFamily === 6 ? 1 : 0,
        );
        assert.equal(ipv4.applicationBytes, 0);
        assert.equal(ipv6?.applicationBytes ?? 0, 0);
        await worker.ping();
      } finally {
        try {
          await worker.close();
          assert.deepEqual(await readdir(root), []);
          if (pid !== undefined)
            assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
        } finally {
          await rm(root, { recursive: true, force: true, maxRetries: 3 });
        }
      }
    }
    try {
      for (let attempt = 0; attempt < 3; ++attempt) {
        ipv4 = await createRdpTlsFixture();
        try {
          ipv6 = await createRdpTlsFixture('::1', ipv4.port);
          break;
        } catch (error) {
          await ipv4.close();
          ipv4 = undefined;
          if (error.code !== 'TLS_FIXTURE_PORT_BUSY' || attempt === 2)
            throw error;
        }
      }
      await connect({ preferIPv6: true }, 6);
      await connect({ preferIPv6: false }, addresses[0].family);
      await connect({ preferIPv6: true, forceIpVersion: 4 }, 4);
      await ipv6.close();
      ipv6 = undefined;
      await connect({ forceIpVersion: 6 }, 0);
      await connect({ preferIPv6: true }, 4);
      context.diagnostic(
        JSON.stringify({
          resolverFirstFamily: addresses[0].family,
          preferredFamily: 6,
          forcedFamily: 4,
          noForcedFallback: true,
          fallbackFamily: 4,
          workers: 5,
          zeroApplicationBytes: true,
          joinedCleanup: true,
        }),
      );
    } finally {
      try {
        await ipv6?.close();
      } finally {
        await ipv4?.close();
      }
    }
  },
);
