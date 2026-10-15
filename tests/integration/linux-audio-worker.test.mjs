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
const available =
  process.platform === 'linux' &&
  capabilities.pcmOutput &&
  capabilities.opusOutput;
for (const ipcTransport of ['auto', 'framed-pipes'])
  for (const codec of ['pcm', 'opus'])
    for (const bufferMs of [120, 200])
      test(
        `actual Linux ${ipcTransport} ${codec}/${bufferMs}: matching capability, strict TLS retirement and healthy IPC`,
        { skip: !available, timeout: 15000 },
        async () => {
          const endpoint = await createRdpTlsFixture();
          const runtimeRoot = await mkdtemp(join(tmpdir(), 'rdp-linux-audio-'));
          const worker = new WorkerProcess({
            workerPath,
            runtimeRoot,
            ipcTransport,
          });
          const audio = [],
            terminal = [];
          worker.on('audio', (event) => {
            assert.ok(audio.length < 8);
            audio.push(event);
          });
          worker.on('rdp-state', (event) => {
            if (event.state === 'failed') terminal.push(event);
          });
          try {
            const build = await worker.start();
            assert.equal(
              build.transport,
              ipcTransport === 'auto' ? 'unix-seqpacket-rws1' : 'framed-pipes',
            );
            assert.deepEqual(build.capabilities, capabilities);
            assert.equal(build.capabilities.audioReset, true);
            assert.equal(build.capabilities.audioBuffer200, true);
            await worker.connect({
              target: { host: '127.0.0.1', port: endpoint.port },
              auth: {
                username: 'synthetic',
                password: 'synthetic-linux-audio',
              },
              security: { protocol: 'tls', certificatePolicy: 'strict' },
              media: { audioOutput: codec, audioOutputBufferMs: bufferMs },
              timeouts: { connectMs: 5000 },
            });
            await eventually(
              () => terminal.length === 1 && audio.length === 1,
              6000,
            );
            assert.equal(terminal[0].error, 'RDP_CERTIFICATE_REJECTED');
            assert.equal(audio[0].type, 'state');
            assert.equal(audio[0].state.availability, 'closed');
            assert.equal(worker.audioState.availability, 'closed');
            assert.equal(worker.audioState.enabled, true);
            assert.equal(endpoint.applicationBytes, 0);
            assert.equal(await worker.resetAudio(1n), 'unavailable');
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
