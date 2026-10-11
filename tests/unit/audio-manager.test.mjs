import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionManager } from '../../packages/node-bridge/dist/index.js';
import { FakeSessionWorker, eventually } from '../fixtures/session-worker.mjs';
const principal = { id: 'audio-owner' };
test('public audio manager refuses Opus before backend allocation until negotiation is implemented', async () => {
  let allocated = 0;
  const manager = new SessionManager({
    workerFactory: () => {
      allocated++;
      return new FakeSessionWorker();
    },
  });
  try {
    assert.throws(
      () =>
        manager.create(
          {
            target: { host: 'fake.test' },
            auth: {},
            media: { audioOutput: 'opus' },
          },
          principal,
          '127.0.0.1',
        ),
      { code: 'RDP_SETTING_NOT_IMPLEMENTED' },
    );
    assert.equal(allocated, 0);
    assert.equal(manager.statistics().active, 0);
  } finally {
    await manager.shutdown();
  }
});
const state = (revision = 1n, availability = 'ready', epoch = 1n) => ({
  type: 'state',
  state: {
    enabled: true,
    availability,
    epoch,
    revision,
    timestampUs: 5000000n,
  },
});
const config = (epoch = 1n) => ({
  type: 'config',
  config: {
    epoch,
    codec: 'pcm',
    sampleRate: 48000,
    channels: 2,
    sampleFormat: 's16le',
    packetFrames: 960,
  },
});
const packet = (index = 0, epoch = 1n, discontinuity = index === 0) => ({
  type: 'packet',
  packet: {
    epoch,
    timestampUs: BigInt(index) * 20000n,
    frames: 960,
    silenceFrames: 0,
    discontinuity,
    pcm: Buffer.alloc(3840),
  },
});
async function fixture(body, enabled = true, mode = 'connected') {
  const worker = new FakeSessionWorker(mode);
  worker.onAudio = (listener) => {
    worker.on('audio', listener);
    return () => worker.off('audio', listener);
  };
  const manager = new SessionManager({ workerFactory: () => worker });
  try {
    const created = manager.create(
      {
        target: { host: 'fake.test' },
        auth: {},
        media: { audioOutput: enabled ? 'pcm' : 'off' },
      },
      principal,
      '127.0.0.1',
    );
    await eventually(() => worker.started === 1);
    if (mode === 'connected')
      await eventually(
        () => manager.get(created.sessionId, principal).state === 'connected',
      );
    const attach = (channel = 'media') =>
      manager.attach(
        created.sessionId,
        manager.mintToken(created.sessionId, principal, channel).token,
        channel,
      );
    await body({
      worker,
      manager,
      created,
      attach,
      emit: (event) => worker.emit('audio', event),
    });
  } finally {
    await manager.shutdown();
    assert.equal(worker.listenerCount('audio'), 0);
  }
}
test('fake audio manager: detached source samples are not replayed; media gets only copied current metadata and live events', async () => {
  await fixture(async ({ attach, emit }) => {
    const initial = state();
    emit(initial);
    initial.state.availability = 'closed';
    const format = config();
    emit(format);
    format.config.channels = 1;
    for (let index = 0; index < 100; index++) emit(packet(index));
    const lease = attach();
    assert.equal(lease.audio.state.availability, 'ready');
    assert.equal(lease.audio.config.channels, 2);
    const snapshot = lease.audio;
    snapshot.state.epoch = 9n;
    snapshot.config.epoch = 9n;
    assert.equal(lease.audio.state.epoch, 1n);
    assert.equal(lease.audio.config.epoch, 1n);
    let seen = 0;
    const off = lease.onAudio((event) => {
      seen++;
      assert.equal(event.packet.timestampUs, 2000000n);
    });
    assert.equal(seen, 0);
    emit(packet(100));
    assert.equal(seen, 1);
    off();
    off();
    emit(packet(101));
    assert.equal(seen, 1);
  });
});
test('fake audio manager: one media subscriber, control refusal, detach and stale unsubscribe preserve replacement ownership', async () => {
  await fixture(async ({ attach, emit }) => {
    const control = attach('control');
    assert.throws(() => control.onAudio(() => {}), { code: 'ATTACH_INVALID' });
    assert.throws(() => control.audio, { code: 'ATTACH_INVALID' });
    const first = attach();
    let oldCalls = 0;
    const oldOff = first.onAudio(() => oldCalls++);
    assert.throws(() => first.onAudio(() => {}), { code: 'MEDIA_FAILED' });
    emit(state());
    assert.equal(oldCalls, 1);
    first.release();
    assert.throws(() => first.audio, { code: 'ATTACH_INVALID' });
    assert.throws(() => first.onAudio(() => {}), { code: 'ATTACH_INVALID' });
    const second = attach();
    let newCalls = 0;
    second.onAudio(() => newCalls++);
    oldOff();
    first.release();
    emit(config());
    emit(packet());
    assert.equal(oldCalls, 1);
    assert.equal(newCalls, 2);
    second.release();
    emit(state(2n, 'closed', 2n));
    assert.equal(newCalls, 2);
  });
});
test('fake audio manager: stop without samples clears configuration; terminal cleanup invalidates lease and removes backend listener', async () => {
  await fixture(async ({ worker, manager, created, attach, emit }) => {
    const lease = attach();
    const types = [];
    lease.onAudio((event) => types.push(event.type));
    emit(state());
    emit(config());
    emit(packet());
    emit(state(2n, 'closed', 2n));
    assert.deepEqual(types, ['state', 'config', 'packet', 'state']);
    assert.equal(lease.audio.state.availability, 'closed');
    assert.equal(lease.audio.config, undefined);
    worker.emit('state', 'closed');
    await eventually(() => manager.statistics().active === 0);
    assert.equal(manager.get(created.sessionId, principal).state, 'closed');
    assert.equal(worker.listenerCount('audio'), 0);
    assert.throws(() => lease.audio, { code: 'ATTACH_INVALID' });
    emit(state(3n));
    assert.equal(types.length, 4);
  });
});
test('fake audio manager: consumer exception retires only its subscription and is observable; new media lease recovers', async () => {
  await fixture(async ({ manager, created, attach, emit }) => {
    const lease = attach();
    lease.onAudio(() => {
      throw new Error('consumer fault');
    });
    emit(state());
    assert.equal(lease.audioFailed, true);
    assert.equal(manager.get(created.sessionId, principal).state, 'connected');
    emit(config());
    emit(packet());
    assert.throws(() => lease.onAudio(() => {}), { code: 'MEDIA_FAILED' });
    lease.release();
    const replacement = attach();
    assert.equal(replacement.audioFailed, false);
    let seen = 0;
    replacement.onAudio(() => seen++);
    emit(packet(1));
    assert.equal(seen, 1);
  });
});
test('fake audio manager: replacement created during callback survives old subscriber exception and unsubscribe', async () => {
  await fixture(async ({ attach, emit }) => {
    const first = attach();
    let replacement,
      seen = 0;
    const oldOff = first.onAudio(() => {
      first.release();
      replacement = attach();
      replacement.onAudio(() => seen++);
      throw new Error('retired subscriber fault');
    });
    emit(state());
    oldOff();
    emit(config());
    emit(packet());
    assert.equal(seen, 2);
    assert.equal(replacement.audioFailed, false);
  });
});
test('fake audio manager: packet/order/replay/descriptor failures isolate the source and clear subscriptions', async () => {
  for (const invalid of [
    packet(),
    { type: 'state', state: { ...state().state, enabled: false } },
    { type: 'config', config: { ...config().config, channels: 1 } },
    { type: 'packet', packet: { ...packet().packet, pcm: Buffer.alloc(3839) } },
    state(),
  ]) {
    await fixture(async ({ worker, manager, created, attach, emit }) => {
      const lease = attach();
      lease.onAudio(() => {});
      if (invalid.type !== 'packet' || invalid.packet.pcm.length !== 3840) {
        emit(state());
        emit(config());
      }
      emit(invalid);
      await eventually(() => manager.statistics().active === 0);
      assert.equal(
        manager.get(created.sessionId, principal).error.code,
        'WORKER_INVALID_STATE',
      );
      assert.equal(worker.listenerCount('audio'), 0);
      assert.throws(() => lease.audio, { code: 'ATTACH_INVALID' });
    });
  }
});
test('fake audio manager: absent opt-in and ready before connected refuse output; waiting metadata is allowed while connecting', async () => {
  await fixture(async ({ manager, created, attach, emit }) => {
    const lease = attach();
    assert.equal(lease.audio, undefined);
    assert.throws(() => lease.onAudio(() => {}), {
      code: 'MEDIA_NOT_IMPLEMENTED',
    });
    emit(state());
    await eventually(() => manager.statistics().active === 0);
    assert.equal(
      manager.get(created.sessionId, principal).error.code,
      'WORKER_INVALID_STATE',
    );
  }, false);
  await fixture(
    async ({ manager, created, attach, emit }) => {
      const lease = attach();
      emit(state(1n, 'waiting'));
      assert.equal(lease.audio.state.availability, 'waiting');
      emit(state(2n));
      await eventually(() => manager.statistics().active === 0);
      assert.equal(
        manager.get(created.sessionId, principal).error.code,
        'WORKER_INVALID_STATE',
      );
    },
    true,
    'starting',
  );
});
test('fake audio manager: missing backend support returns explicit error before startup and bounded cleanup', async () => {
  const worker = new FakeSessionWorker();
  const manager = new SessionManager({ workerFactory: () => worker });
  try {
    assert.throws(
      () =>
        manager.create(
          {
            target: { host: 'fake.test' },
            auth: {},
            media: { audioOutput: 'pcm' },
          },
          principal,
          '127.0.0.1',
        ),
      { code: 'RDP_SETTING_NOT_IMPLEMENTED' },
    );
    await eventually(() => manager.statistics().active === 0);
    assert.equal(worker.started, 0);
    assert.equal(worker.closed, 1);
  } finally {
    await manager.shutdown();
  }
});
