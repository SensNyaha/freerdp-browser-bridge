import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { WorkerProcess } from '../../packages/node-bridge/dist/index.js';
import { decodeFilePage } from '../../packages/protocol/dist/index.js';
import { createRdpTlsFixture } from '../fixtures/rdp-tls.mjs';

const binaryDir = process.env.BRIDGE_MANAGED_DRIVE_TEST_BINARY_DIR;
const transports =
  process.platform === 'linux'
    ? ['framed-pipes', 'unix-seqpacket-rws1']
    : ['framed-pipes'];
for (const ipcTransport of transports)
  for (const profile of ['off', 'pcm', 'opus', 'cancel', 'xrdp-legacy']) {
    test(
      `actual managed-drive worker / ${ipcTransport} / ${profile}: guarded loader, strict TLS and joined sandbox cleanup; synthetic server`,
      { skip: !binaryDir, timeout: 20000 },
      async () => {
        const endpoint = await createRdpTlsFixture();
        const runtimeRoot = await mkdtemp(
          join(tmpdir(), 'bridge-managed-drive-'),
        );
        const worker = new WorkerProcess({
          workerPath: resolve(
            binaryDir,
            'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
          ),
          runtimeRoot,
          ipcTransport,
          maxWriteBytes: 131072,
        });
        const states = [];
        worker.on('rdp-state', (state) => states.push(state));
        try {
          const build = await worker.start();
          assert.equal(build.capabilities.managedDrives, true);
          if (profile === 'xrdp-legacy')
            assert.equal(build.capabilities.xrdpLegacyDelete, true);
          const config = {
            target: { host: '127.0.0.1', port: endpoint.port },
            auth: { username: 'synthetic', password: 'owned test sentinel' },
            security: { protocol: 'tls', certificatePolicy: 'strict' },
            timeouts: { connectMs: 5000 },
            media: {
              audioOutput: ['cancel', 'xrdp-legacy'].includes(profile)
                ? 'off'
                : profile,
            },
            redirection: {
              thinclientDrives: [
                { name: 'Documents', subdir: 'documents' },
                { name: 'ReadOnly', subdir: 'readonly', readOnly: true },
              ],
            },
          };
          // Capability alone must never authorize a filesystem owner.
          await assert.rejects(worker.connect(config), {
            code: 'RDP_SETTING_NOT_IMPLEMENTED',
          });
          const initialized = await worker.nativeFileCommand({
            operation: 'initialize',
            id: 131072n,
            argument: 65536n,
            value: 16n,
            ...(profile === 'xrdp-legacy' ? { flags: 1 } : {}),
          });
          assert.equal(initialized.status, 'ok');
          await worker.connect(config);
          if (profile !== 'cancel') {
            const deadline = Date.now() + 7000;
            while (!states.some((state) => state.state === 'failed')) {
              assert.ok(
                Date.now() < deadline,
                'Managed drive terminal state deadline',
              );
              await delay(20);
            }
            assert.equal(states.at(-1).error, 'RDP_CERTIFICATE_REJECTED');
            await worker.ping();
            const list = decodeFilePage(
              await worker.nativeFileCommand({
                operation: 'list',
                id: 0n,
                argument: 0n,
                value: 64n,
              }),
            );
            assert.deepEqual(
              list.map((entry) => [entry.name, entry.directory]),
              [
                ['documents', true],
                ['readonly', true],
              ],
            );
          }
          assert.equal(endpoint.applicationBytes, 0);
        } finally {
          await worker.close();
          await endpoint.close();
          assert.deepEqual(await readdir(runtimeRoot), []);
          await rm(runtimeRoot, {
            recursive: true,
            force: true,
            maxRetries: 3,
          });
        }
      },
    );
  }
