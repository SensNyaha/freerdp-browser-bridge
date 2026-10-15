import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { WorkerProcess } from '../../packages/node-bridge/dist/index.js';
import { createRdpTlsFixture } from '../fixtures/rdp-tls.mjs';
import { eventually } from '../fixtures/session-worker.mjs';

const workerPath = resolve(
  process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
  'rdp-worker',
);
const capabilities =
  process.platform === 'linux'
    ? JSON.parse(
        execFileSync(workerPath, ['--capabilities'], { encoding: 'utf8' }),
      ).capabilities
    : {};
const available = capabilities.pcmInput && capabilities.opusInput;
const pcm = {
  epoch: 1n,
  timestampUs: 0n,
  discontinuity: true,
  pcm: Buffer.alloc(3840),
};
const opus = {
  epoch: 1n,
  timestampUs: 0n,
  discontinuity: true,
  lookaheadFrames: 312,
  encoded: Buffer.from([0xfc, 0xff]),
};

for (const ipcTransport of ['auto', 'framed-pipes'])
  for (const microphone of ['pcm', 'opus'])
    for (const audioOutput of ['off', 'pcm', 'opus'])
      test(
        `actual Linux ${ipcTransport} input ${microphone}/output ${audioOutput}: source authority, strict TLS and cleanup without capture`,
        { skip: !available, timeout: 15000 },
        async () => {
          const endpoint = await createRdpTlsFixture();
          const runtimeRoot = await mkdtemp(join(tmpdir(), 'rdp-linux-mic-'));
          const worker = new WorkerProcess({
            workerPath,
            runtimeRoot,
            ipcTransport,
          });
          const events = [];
          worker.on('microphone', (state) => {
            assert.ok(events.length < 8);
            events.push({ type: 'microphone', state });
          });
          worker.on('rdp-state', (state) => {
            assert.ok(events.length < 16);
            events.push({ type: 'rdp', state });
          });
          try {
            const build = await worker.start();
            assert.deepEqual(build.capabilities, capabilities);
            assert.equal(build.capabilities.microphoneReset, true);
            assert.equal(
              build.transport,
              ipcTransport === 'auto' ? 'unix-seqpacket-rws1' : 'framed-pipes',
            );
            assert.equal(await worker.resetMicrophone(1n), 'unavailable');
            await worker.connect({
              target: { host: '127.0.0.1', port: endpoint.port },
              auth: { username: 'synthetic', password: 'synthetic-linux-mic' },
              security: { protocol: 'tls', certificatePolicy: 'strict' },
              media: { microphone, audioOutput },
              timeouts: { connectMs: 5000 },
            });
            await eventually(
              () =>
                events.some(
                  (event) =>
                    event.type === 'rdp' && event.state.state === 'failed',
                ),
              6000,
            );
            const failed = events.findIndex(
              (event) => event.type === 'rdp' && event.state.state === 'failed',
            );
            const source = events.findIndex(
              (event) => event.type === 'microphone',
            );
            assert.ok(source >= 0 && source < failed);
            assert.equal(
              events[failed].state.error,
              'RDP_CERTIFICATE_REJECTED',
            );
            assert.equal(events[source].state.enabled, true);
            assert.equal(events[source].state.availability, 'closed');
            assert.equal(events[source].state.epoch, 0n);
            assert.equal(
              events.filter((event) => event.type === 'microphone').length,
              1,
            );
            assert.equal(await worker.sendMicrophone(pcm), 'unavailable');
            assert.equal(await worker.sendMicrophoneOpus(opus), 'unavailable');
            assert.equal(await worker.resetMicrophone(1n), 'unavailable');
            assert.equal(endpoint.applicationBytes, 0);
            await worker.ping();
            await worker.close();
            assert.deepEqual(await readdir(runtimeRoot), []);
          } finally {
            await worker.close();
            await endpoint.close();
            await rm(runtimeRoot, { recursive: true, force: true });
          }
        },
      );
