import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  WorkerProcess,
  NativeSessionWorker,
  SessionManager,
} from '../../packages/node-bridge/dist/index.js';
import { eventually } from '../fixtures/session-worker.mjs';
import { createRdpTlsFixture } from '../fixtures/rdp-tls.mjs';
const directory = process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation';
const suffix = process.platform === 'win32' ? '.exe' : '';
const nativeAudio = JSON.parse(
  execFileSync(resolve(directory, 'rdp-worker' + suffix), ['--capabilities'], {
    encoding: 'utf8',
    windowsHide: true,
  }),
).capabilities;
const nativePcm = nativeAudio.pcmOutput;
const configuration = (host, media = { audioOutput: 'pcm' }) => ({
  target: { host },
  auth: {},
  media,
});
async function run(body, peer = 'fixture-audio-0') {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'bridge-audio-'));
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
    await rm(runtimeRoot, { recursive: true, force: true });
  }
}
test('fake PCM peer: private source/config/sample order, metadata snapshot and stop without samples', async () => {
  await run(async (worker) => {
    const events = [];
    worker.on('audio', (event) => events.push(event));
    await worker.connect(configuration('close'));
    await eventually(() => events.length === 4);
    assert.deepEqual(
      events.map((event) => event.type),
      ['state', 'config', 'packet', 'state'],
    );
    assert.equal(events[2].packet.pcm.length, 3840);
    assert.equal(events[2].packet.timestampUs, 0n);
    assert.equal(worker.audioState.availability, 'closed');
    const snapshot = worker.audioState;
    snapshot.availability = 'ready';
    assert.equal(worker.audioState.availability, 'closed');
    await worker.ping();
    await worker.close();
    assert.equal(worker.state, 'closed');
  });
});
test('fake PCM peer: unsupported codecs, microphone, latency and legacy capability are refused before connect', async () => {
  await run(async (worker) => {
    for (const media of [
      { audioOutput: 'opus' },
      { audioOutput: 'pcm', microphone: 'pcm' },
      { audioOutput: 'pcm', audioLatencyMs: 40 },
      { audioOutput: 'pcm', audioOutputBufferMs: 200 },
    ])
      await assert.rejects(worker.connect(configuration('valid', media)), {
        code: 'RDP_SETTING_NOT_IMPLEMENTED',
      });
    assert.equal(worker.state, 'ready');
    await worker.ping();
  });
  await run(async (worker) => {
    assert.equal(worker.build.capabilities.pcmOutput, false);
    await assert.rejects(worker.connect(configuration('valid')), {
      code: 'RDP_SETTING_NOT_IMPLEMENTED',
    });
    await worker.connect(
      configuration('off', { audioOutput: 'off', microphone: 'off' }),
    );
    await worker.ping();
    assert.equal(worker.audioState, undefined);
  }, 'fixture-audio-1');
});
test('fake PCM peer: premature status, missing config barrier, replay, PTS gaps and unsolicited output fail closed', async () => {
  for (const host of ['early', 'no-status', 'replay', 'clock', 'unsolicited']) {
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
  }
});
test('fake PCM native adapter forwards opt-in source/config/samples and refuses legacy peers before connect', async () => {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'bridge-audio-public-'));
  const worker = new NativeSessionWorker({
    workerPath: resolve(directory, 'fixture-audio-0' + suffix),
    runtimeRoot,
  });
  const events = [];
  worker.onAudio((event) => events.push(event));
  let legacy;
  try {
    await worker.start(configuration('valid'), new AbortController().signal);
    await eventually(() => events.length === 3);
    assert.deepEqual(
      events.map((event) => event.type),
      ['state', 'config', 'packet'],
    );
    assert.equal(events[2].packet.pcm.length, 3840);
    await worker.close();
    legacy = new NativeSessionWorker({
      workerPath: resolve(directory, 'fixture-audio-1' + suffix),
      runtimeRoot,
    });
    await assert.rejects(
      legacy.start(configuration('valid'), new AbortController().signal),
      { code: 'RDP_SETTING_NOT_IMPLEMENTED' },
    );
  } finally {
    await worker.close();
    await legacy?.close();
    assert.deepEqual(await readdir(runtimeRoot), []);
    await rm(runtimeRoot, { recursive: true, force: true });
  }
});

for (const codec of ['pcm', 'opus'])
  test(
    `actual native ${codec} session manager preserves strict TLS refusal and retires public native selection before GDI`,
    {
      skip: !(codec === 'pcm'
        ? nativePcm
        : nativeAudio.opusOutput && nativeAudio.audioReset),
      timeout: 15000,
    },
    async () => {
      const endpoint = await createRdpTlsFixture();
      const runtimeRoot = await mkdtemp(
        join(tmpdir(), 'bridge-audio-registry-'),
      );
      const principal = { id: 'audio-registry-fixture' };
      const manager = new SessionManager({
        workerFactory: () =>
          new NativeSessionWorker({
            workerPath: resolve(directory, 'rdp-worker' + suffix),
            runtimeRoot,
          }),
      });
      try {
        const created = manager.create(
          {
            target: { host: '127.0.0.1', port: endpoint.port },
            auth: { username: 'synthetic', password: 'synthetic-IPC-sentinel' },
            security: { protocol: 'tls', certificatePolicy: 'strict' },
            media: { audioOutput: codec },
            timeouts: { connectMs: 5000 },
          },
          principal,
          '127.0.0.1',
        );
        await eventually(
          () => manager.get(created.sessionId, principal).state === 'failed',
        );
        assert.equal(
          manager.get(created.sessionId, principal).error.code,
          'RDP_CERTIFICATE_REJECTED',
        );
        assert.equal(endpoint.applicationBytes, 0);
        await manager.shutdown();
        assert.deepEqual(await readdir(runtimeRoot), []);
      } finally {
        await manager.shutdown();
        await endpoint.close();
        await rm(runtimeRoot, { recursive: true, force: true });
      }
    },
  );
test(
  'actual native PCM worker retires registered static channel on strict TLS rejection before GDI',
  { skip: !nativePcm, timeout: 15000 },
  async () => {
    const endpoint = await createRdpTlsFixture();
    try {
      await run(async (worker) => {
        const events = [];
        const terminal = [];
        worker.on('audio', (event) => events.push(event));
        worker.on('rdp-state', (event) => {
          if (event.state === 'failed') terminal.push(event);
        });
        await worker.connect({
          target: { host: '127.0.0.1', port: endpoint.port },
          auth: { username: 'synthetic', password: 'synthetic-IPC-sentinel' },
          security: { protocol: 'tls', certificatePolicy: 'strict' },
          media: { audioOutput: 'pcm' },
          timeouts: { connectMs: 5000 },
        });
        await eventually(() => terminal.length === 1, 6000);
        assert.equal(terminal[0].error, 'RDP_CERTIFICATE_REJECTED');
        assert.equal(events.length, 1);
        assert.equal(events[0].type, 'state');
        assert.equal(events[0].state.availability, 'closed');
        assert.equal(endpoint.applicationBytes, 0);
        assert.equal(worker.state, 'ready');
        await worker.ping();
      }, 'rdp-worker');
    } finally {
      await endpoint.close();
    }
  },
);
test(
  'actual native PCM worker closes certificate wait with channel callbacks retired and directories reclaimed',
  { skip: !nativePcm, timeout: 15000 },
  async () => {
    const endpoint = await createRdpTlsFixture();
    try {
      await run(async (worker) => {
        let prompt;
        worker.on('certificate', (event) => {
          prompt = event;
        });
        await worker.connect({
          target: { host: '127.0.0.1', port: endpoint.port },
          auth: { username: 'synthetic', password: 'synthetic-IPC-sentinel' },
          security: { protocol: 'tls', certificatePolicy: 'prompt' },
          media: { audioOutput: 'pcm' },
          timeouts: { connectMs: 5000 },
        });
        await eventually(() => prompt !== undefined, 6000);
        await worker.close();
        assert.equal(worker.state, 'closed');
        assert.equal(endpoint.applicationBytes, 0);
      }, 'rdp-worker');
    } finally {
      await endpoint.close();
    }
  },
);
