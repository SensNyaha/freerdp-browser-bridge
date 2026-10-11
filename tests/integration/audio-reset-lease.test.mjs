import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  NativeSessionWorker,
  SessionManager,
} from '../../packages/node-bridge/dist/index.js';
import { eventually } from '../fixtures/session-worker.mjs';

test('fake PCM native adapter: current media lease reaches correlated private audio reset and fresh metadata', async () => {
  const runtimeRoot = await mkdtemp(
    join(tmpdir(), 'bridge-audio-reset-lease-'),
  );
  const worker = new NativeSessionWorker({
    runtimeRoot,
    workerPath: resolve(
      process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
      'fixture-audio-pcm-reset' + (process.platform === 'win32' ? '.exe' : ''),
    ),
  });
  const manager = new SessionManager({ workerFactory: () => worker });
  const principal = { id: 'reset-fixture-owner' };
  try {
    const session = manager.create(
      {
        target: { host: 'reset-valid' },
        auth: {},
        media: { audioOutput: 'pcm' },
      },
      principal,
      '127.0.0.1',
    );
    await eventually(
      () => manager.get(session.sessionId, principal).state === 'connected',
    );
    const attach = (channel) =>
      manager.attach(
        session.sessionId,
        manager.mintToken(session.sessionId, principal, channel).token,
        channel,
      );
    const lease = attach('media');
    await eventually(
      () =>
        lease.audio.state?.availability === 'ready' &&
        lease.audio.config?.epoch === 1n,
    );
    const events = [];
    lease.onAudio((event) => {
      assert.ok(events.length < 8);
      events.push(event);
    });
    await assert.rejects(attach('control').resetAudio(1n), {
      code: 'ATTACH_INVALID',
    });
    assert.equal(await lease.resetAudio(1n), 'scheduled');
    await eventually(() => events.length === 4);
    assert.deepEqual(
      events.map((e) => e.type),
      ['state', 'state', 'config', 'packet'],
    );
    assert.equal(lease.audio.config.epoch, 2n);
    assert.equal(events[3].packet.discontinuity, true);
    assert.equal(await lease.resetAudio(1n), 'stale');
    lease.release();
    await assert.rejects(lease.resetAudio(2n), { code: 'ATTACH_INVALID' });
    assert.equal(manager.get(session.sessionId, principal).state, 'connected');
  } finally {
    await manager.shutdown();
    assert.deepEqual(await readdir(runtimeRoot), []);
    await rm(runtimeRoot, { recursive: true, force: true, maxRetries: 3 });
  }
});
