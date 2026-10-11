import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  WorkerProcess,
  NativeSessionWorker,
} from '../../packages/node-bridge/dist/index.js';
import { eventually } from '../fixtures/session-worker.mjs';
import { createRdpTlsFixture } from '../fixtures/rdp-tls.mjs';
const directory = process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation';
const suffix = process.platform === 'win32' ? '.exe' : '';
const nativeOpus = JSON.parse(
  execFileSync(resolve(directory, 'rdp-worker' + suffix), ['--capabilities'], {
    encoding: 'utf8',
    windowsHide: true,
  }),
).capabilities.opusOutput;
const configuration = (host, media = { audioOutput: 'opus' }) => ({
  target: { host },
  auth: {},
  media,
});
async function run(body, peer = 'fixture-audio-opus') {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'bridge-opus-worker-'));
  const worker = new WorkerProcess({
    workerPath: resolve(directory, peer + suffix),
    runtimeRoot,
  });
  try {
    await worker.start();
    await body(worker);
  } finally {
    await worker.close();
    assert.deepEqual(await readdir(runtimeRoot), []);
    await rm(runtimeRoot, { recursive: true, force: true, maxRetries: 3 });
  }
}
test('fake Opus peer: typed source/config/encoded packet and Close remain ordered with scalar snapshots', async () => {
  await run(async (worker) => {
    assert.equal(worker.build.capabilities.opusOutput, true);
    assert.equal(worker.build.capabilities.pcmOutput, false);
    const events = [];
    worker.on('audio', (event) => events.push(event));
    await worker.connect(configuration('close'));
    await eventually(() => events.length === 4);
    assert.deepEqual(
      events.map((event) => event.type),
      ['state', 'config', 'packet', 'state'],
    );
    assert.equal(events[1].config.codec, 'opus');
    assert.equal(events[1].config.lookaheadFrames, 312);
    assert.deepEqual(events[2].packet.encoded, Buffer.from([0xfc, 0xff, 0xfe]));
    assert.equal(events[2].packet.timestampUs, 0n);
    assert.equal(events[2].packet.discontinuity, true);
    assert.equal(worker.audioState.availability, 'closed');
    worker.audioState.availability = 'ready';
    assert.equal(worker.audioState.availability, 'closed');
    await worker.ping();
    await worker.close();
    assert.equal(worker.state, 'closed');
  });
});
test('fake Opus peer: premature replay gaps mixed PCM and malformed packets fail private IPC closed', async () => {
  for (const host of [
    'early',
    'no-status',
    'replay',
    'clock',
    'pcm-config',
    'pcm-packet',
    'malformed',
    'unsolicited',
  ])
    await run(async (worker) => {
      const failures = [];
      worker.on('failure', (event) => failures.push(event.code));
      await worker
        .connect(
          configuration(
            host,
            host === 'unsolicited' ? { audioOutput: 'off' } : undefined,
          ),
        )
        .catch(() => {});
      await eventually(() => failures.length === 1);
      assert.equal(worker.state, 'failed');
      assert.equal(failures[0], 'IPC_PROTOCOL_ERROR');
    });
});
test('private Opus selection: legacy peers and unsupported microphone latency or PCM refuse before connect', async () => {
  for (const peer of ['fixture-audio-0', 'fixture-audio-1'])
    await run(async (worker) => {
      assert.equal(worker.build.capabilities.opusOutput, false);
      await assert.rejects(worker.connect(configuration('valid')), {
        code: 'RDP_SETTING_NOT_IMPLEMENTED',
      });
      assert.equal(worker.audioState, undefined);
      assert.equal(worker.state, 'ready');
      await worker.connect(
        configuration('off', { audioOutput: 'off', microphone: 'off' }),
      );
      await worker.ping();
    }, peer);
  await run(async (worker) => {
    for (const media of [
      { audioOutput: 'pcm' },
      { audioOutput: 'opus', microphone: 'pcm' },
      { audioOutput: 'opus', audioLatencyMs: 40 },
    ])
      await assert.rejects(worker.connect(configuration('valid', media)), {
        code: 'RDP_SETTING_NOT_IMPLEMENTED',
      });
    await worker.connect(configuration('valid'));
    await worker.ping();
  });
});
test('public native Opus adapter refuses peers without epoch reset before private connect', async () => {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'bridge-opus-public-gate-'));
  const worker = new NativeSessionWorker({
    workerPath: resolve(directory, 'fixture-audio-opus' + suffix),
    runtimeRoot,
  });
  try {
    await assert.rejects(
      worker.start(configuration('valid'), new AbortController().signal),
      { code: 'RDP_SETTING_NOT_IMPLEMENTED' },
    );
    await worker.close();
    assert.deepEqual(await readdir(runtimeRoot), []);
  } finally {
    await worker.close();
    assert.deepEqual(await readdir(runtimeRoot), []);
    await rm(runtimeRoot, { recursive: true, force: true, maxRetries: 3 });
  }
});
test(
  'actual native private Opus Node owner preserves strict TLS refusal and receives codec-1 Close',
  { skip: !nativeOpus, timeout: 15000 },
  async () => {
    const endpoint = await createRdpTlsFixture();
    try {
      await run(async (worker) => {
        const audio = [],
          terminal = [];
        worker.on('audio', (event) => audio.push(event));
        worker.on('rdp-state', (event) => {
          if (event.state === 'failed') terminal.push(event);
        });
        await worker.connect({
          target: { host: '127.0.0.1', port: endpoint.port },
          auth: { username: 'synthetic', password: 'synthetic-IPC-sentinel' },
          security: { protocol: 'tls', certificatePolicy: 'strict' },
          media: { audioOutput: 'opus' },
          timeouts: { connectMs: 5000 },
        });
        await eventually(() => terminal.length === 1);
        assert.equal(terminal[0].error, 'RDP_CERTIFICATE_REJECTED');
        assert.equal(audio.length, 1);
        assert.equal(audio[0].type, 'state');
        assert.equal(audio[0].state.availability, 'closed');
        assert.equal(worker.audioState.availability, 'closed');
        assert.equal(endpoint.applicationBytes, 0);
        assert.equal(worker.state, 'ready');
        await worker.ping();
      }, 'rdp-worker');
    } finally {
      await endpoint.close();
    }
  },
);
