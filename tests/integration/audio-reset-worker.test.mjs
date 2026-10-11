import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setImmediate as turn } from 'node:timers/promises';
import { WorkerProcess } from '../../packages/node-bridge/dist/index.js';
import { eventually } from '../fixtures/session-worker.mjs';

const binaryRoot = process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation';
const suffix = process.platform === 'win32' ? '.exe' : '';
async function run(body, codec = 'opus', legacy = false) {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'bridge-audio-reset-'));
  const peer = legacy
    ? codec === 'opus'
      ? 'fixture-audio-opus'
      : 'fixture-audio-0'
    : `fixture-audio-${codec}-reset`;
  const worker = new WorkerProcess({
    workerPath: resolve(binaryRoot, peer + suffix),
    runtimeRoot,
    heartbeatIntervalMs: 60000,
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
const config = (host, codec = 'opus') => ({
  target: { host },
  auth: {},
  media: { audioOutput: codec },
});

test('fake private audio reset: both codecs schedule a fresh ordered epoch without rewriting old samples', async () => {
  for (const codec of ['pcm', 'opus'])
    await run(async (worker) => {
      assert.equal(worker.build.capabilities.audioReset, true);
      assert.equal(await worker.resetAudio(1n), 'unavailable');
      const events = [];
      worker.on('audio', (e) => {
        assert.ok(events.length < 24);
        events.push(e);
      });
      await worker.connect(config('reset-valid', codec));
      await eventually(() => events.length === 3);
      assert.equal(await worker.resetAudio(9n), 'stale');
      assert.equal(await worker.resetAudio(1n), 'scheduled');
      await eventually(() => events.length === 7);
      assert.equal(events[3].state.availability, 'waiting');
      assert.equal(events[3].state.epoch, 2n);
      assert.equal(events[4].state.availability, 'ready');
      assert.equal(events[5].config.epoch, 2n);
      assert.equal(events[6].packet.epoch, 2n);
      assert.equal(events[6].packet.timestampUs, 20000n);
      assert.equal(events[6].packet.discontinuity, true);
      assert.equal(events[2].packet.epoch, 1n);
      assert.equal(await worker.resetAudio(1n), 'stale');
      assert.equal(await worker.resetAudio(2n), 'scheduled');
      await eventually(() => events.length === 11);
      assert.equal(events[10].packet.timestampUs, 40000n);
      await worker.ping();
    }, codec);
});
test('fake private audio reset: one pending request returns busy locally and terminal close rejects ownership', async () => {
  await run(async (worker) => {
    await worker.connect(config('reset-delay'));
    await eventually(() => worker.audioState?.availability === 'ready');
    const pending = worker.resetAudio(1n);
    await turn();
    assert.equal(await worker.resetAudio(1n), 'busy');
    await worker.ping();
    assert.equal(await pending, 'unavailable');
    assert.equal(worker.state, 'ready');
  });
  await run(async (worker) => {
    await worker.connect(config('reset-hold'));
    await eventually(() => worker.audioState?.availability === 'ready');
    const rejected = assert.rejects(worker.resetAudio(1n), {
      code: 'WORKER_EXITED',
    });
    await worker.close();
    await rejected;
    assert.equal(
      await worker.resetAudio(worker.audioState.epoch),
      'unavailable',
    );
    assert.equal(worker.state, 'closed');
  });
});
test('fake private audio reset: scheduled epoch cannot repeat before a fresh source status', async () => {
  await run(async (worker) => {
    await worker.connect(config('reset-scheduled-only'));
    await eventually(() => worker.audioState?.availability === 'ready');
    assert.equal(await worker.resetAudio(1n), 'scheduled');
    assert.equal(worker.audioState.epoch, 1n);
    assert.equal(await worker.resetAudio(1n), 'busy');
    await worker.ping();
    assert.equal(worker.state, 'ready');
  });
});

test('fake private audio reset: typed stale busy unavailable outcomes keep heartbeat healthy', async () => {
  for (const outcome of ['stale', 'busy', 'unavailable'])
    await run(async (worker) => {
      await worker.connect(config('reset-' + outcome));
      await eventually(() => worker.audioState?.availability === 'ready');
      assert.equal(await worker.resetAudio(1n), outcome);
      await worker.ping();
      assert.equal(worker.state, 'ready');
    });
});
test('fake private audio reset: invalid epoch and legacy capability are refused before dispatch', async () => {
  for (const codec of ['pcm', 'opus'])
    await run(
      async (worker) => {
        assert.equal(worker.build.capabilities.audioReset, false);
        await worker.connect(config('valid', codec));
        await eventually(() => worker.audioState?.availability === 'ready');
        for (const epoch of [0n, -1n, 0x10000000000000000n, 1])
          await assert.rejects(worker.resetAudio(epoch));
        await assert.rejects(worker.resetAudio(1n), {
          code: 'AUDIO_RESET_NOT_IMPLEMENTED',
        });
        await worker.ping();
        assert.equal(worker.state, 'ready');
      },
      codec,
      true,
    );
});
test('fake private audio reset: malformed duplicate and mismatched replies fail private IPC closed', async () => {
  for (const mode of ['reset-malformed', 'reset-duplicate', 'reset-wrong-id'])
    await run(async (worker) => {
      const failures = [];
      worker.on('failure', (e) => failures.push(e.code));
      await worker.connect(config(mode));
      await eventually(() => worker.audioState?.availability === 'ready');
      await worker.resetAudio(1n).catch(() => {});
      await eventually(() => failures.length === 1);
      assert.equal(failures[0], 'IPC_PROTOCOL_ERROR');
      assert.equal(worker.state, 'failed');
    });
});
