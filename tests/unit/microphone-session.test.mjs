import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionManager } from '../../packages/node-bridge/dist/index.js';
import { encodeMicrophoneRecord } from '../../packages/protocol/dist/index.js';
import { FakeSessionWorker, eventually } from '../fixtures/session-worker.mjs';
const principal = { id: 'microphone-fixture-owner' };
const configuration = (microphone = 'pcm') => ({
  target: { host: 'fixture.invalid' },
  auth: {},
  media: { microphone },
});
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const wire = (epoch = 1n, sequence = 1) =>
  encodeMicrophoneRecord(
    {
      epoch,
      timestampUs: 0n,
      discontinuity: true,
      pcm: Buffer.alloc(3840, 12),
    },
    sequence,
  );
class MicrophoneWorker extends FakeSessionWorker {
  source = {
    enabled: true,
    availability: 'ready',
    revision: 1n,
    epoch: 1n,
    timestampUs: 0n,
  };
  sampleCalls = 0;
  resetCalls = 0;
  onMicrophone(listener) {
    this.on('microphone', listener);
    return () => this.off('microphone', listener);
  }
  async start(config, signal) {
    await super.start(config, signal);
    if (!signal.aborted) this.emit('microphone', this.source);
  }
  publish(patch = {}) {
    this.source = {
      ...this.source,
      revision: this.source.revision + 1n,
      timestampUs: this.source.timestampUs + 1n,
      ...patch,
    };
    this.emit('microphone', this.source);
  }
  async sendMicrophone(packet) {
    ++this.sampleCalls;
    assert.equal(packet.pcm[0], 12);
    return 'accepted';
  }
  async resetMicrophone(epoch) {
    ++this.resetCalls;
    assert.equal(epoch, this.source.epoch);
    this.publish({ epoch: epoch + 1n });
    return 'scheduled';
  }
}
async function fixture(run, options = {}) {
  const worker = new MicrophoneWorker();
  const manager = new SessionManager({
    workerFactory: () => worker,
    ...options,
  });
  const created = manager.create(configuration(), principal, '127.0.0.1');
  const attach = (channel) =>
    manager.attach(
      created.sessionId,
      manager.mintToken(created.sessionId, principal, channel).token,
      channel,
    );
  try {
    await eventually(
      () => manager.get(created.sessionId, principal).state === 'connected',
    );
    await eventually(() => worker.listenerCount('microphone') === 1);
    await run({
      worker,
      manager,
      created,
      attach,
      control: attach('control'),
      media: attach('media'),
    });
  } finally {
    await manager.shutdown();
    assert.equal(worker.listenerCount('microphone'), 0);
    assert.equal(manager.statistics().active, 0);
  }
}

test('microphone session: selection requires typed backend before startup; Opus stays unsupported and off stays explicit', async () => {
  for (const microphone of ['pcm', 'opus']) {
    const worker = new FakeSessionWorker();
    const manager = new SessionManager({ workerFactory: () => worker });
    assert.throws(
      () => manager.create(configuration(microphone), principal, '127.0.0.1'),
      { code: 'RDP_SETTING_NOT_IMPLEMENTED' },
    );
    assert.equal(worker.started, 0);
    await manager.shutdown();
  }
  const worker = new MicrophoneWorker();
  worker.start = async function (config, signal) {
    await FakeSessionWorker.prototype.start.call(this, config, signal);
  };
  const manager = new SessionManager({ workerFactory: () => worker });
  const created = manager.create(configuration('off'), principal, '127.0.0.1');
  try {
    await eventually(
      () => manager.get(created.sessionId, principal).state === 'connected',
    );
    const media = manager.attach(
      created.sessionId,
      manager.mintToken(created.sessionId, principal, 'media').token,
      'media',
    );
    assert.throws(() => media.microphone, { code: 'MEDIA_NOT_IMPLEMENTED' });
    assert.throws(() => media.startMicrophone(), {
      code: 'MEDIA_NOT_IMPLEMENTED',
    });
    worker.emit('microphone', worker.source);
    assert.equal(
      manager.get(created.sessionId, principal).error.code,
      'WORKER_INVALID_STATE',
    );
  } finally {
    await manager.shutdown();
  }
});

test('microphone session: current media and control authority, copied metadata, one grant and reset before restart', async () => {
  await fixture(async ({ worker, control, media }) => {
    assert.throws(() => control.microphone, { code: 'ATTACH_INVALID' });
    assert.throws(() => control.startMicrophone(), { code: 'ATTACH_INVALID' });
    await assert.rejects(control.sendMicrophone(wire()), {
      code: 'ATTACH_INVALID',
    });
    const state = media.microphone;
    state.epoch = 99n;
    assert.equal(media.microphone.epoch, 1n);
    await assert.rejects(media.sendMicrophone(wire()), {
      code: 'ATTACH_INVALID',
    });
    assert.equal(media.startMicrophone(), true);
    assert.equal(media.startMicrophone(), false);
    assert.equal((await media.sendMicrophone(wire())).result, 'accepted');
    assert.equal(worker.sampleCalls, 1);
    const stopped = media.stopMicrophone();
    assert.equal(media.stopMicrophone(), stopped);
    assert.equal(media.startMicrophone(), false);
    assert.equal(await stopped, true);
    assert.equal(media.microphone.epoch, 2n);
    assert.equal(media.startMicrophone(), true);
    assert.equal((await media.sendMicrophone(wire())).result, 'stale');
    assert.equal((await media.sendMicrophone(wire(2n, 2))).result, 'accepted');
    assert.equal(await media.stopMicrophone(), true);
    assert.equal(worker.resetCalls, 2);
  });
});

test('microphone session: losing either attachment revokes pending admission and replacement waits for observed reset', async () => {
  for (const channel of ['control', 'media'])
    await fixture(async ({ worker, control, media, attach }) => {
      const sample = deferred(),
        reset = deferred();
      worker.sendMicrophone = () => {
        ++worker.sampleCalls;
        return sample.promise;
      };
      worker.resetMicrophone = () => {
        ++worker.resetCalls;
        return reset.promise;
      };
      assert.equal(media.startMicrophone(), true);
      const pending = media.sendMicrophone(wire());
      const old = channel === 'control' ? control : media;
      old.release();
      const replacement = attach(channel);
      const current = channel === 'media' ? replacement : media;
      assert.equal(current.startMicrophone(), false);
      sample.resolve('accepted');
      assert.equal((await pending).result, 'unavailable');
      await eventually(() => worker.resetCalls === 1);
      reset.resolve('scheduled');
      await Promise.resolve();
      assert.equal(current.startMicrophone(), false);
      worker.publish({ epoch: 2n });
      await eventually(() => current.startMicrophone());
      old.release(); // Old ownership cannot revoke a replacement.
      worker.sendMicrophone = async () => 'accepted';
      assert.equal((await current.sendMicrophone(wire(2n))).result, 'accepted');
      worker.resetMicrophone = MicrophoneWorker.prototype.resetMicrophone;
      assert.equal(await current.stopMicrophone(), true);
      if (channel === 'media')
        assert.throws(() => media.microphone, { code: 'ATTACH_INVALID' });
      assert.equal(worker.resetCalls, 2);
    });
});

test('microphone session: waiting input never submits and a fresh ready epoch requires a new discontinuity', async () => {
  await fixture(async ({ worker, control, media, attach }) => {
    control.release();
    assert.equal(media.startMicrophone(), false);
    const next = attach('control');
    worker.publish({ epoch: 2n, availability: 'waiting' });
    assert.equal(media.startMicrophone(), true);
    assert.equal((await media.sendMicrophone(wire(2n))).result, 'unavailable');
    assert.equal(worker.sampleCalls, 0);
    worker.publish({ availability: 'ready' });
    const bytes = wire(2n, 2);
    bytes.writeUInt16BE(0, 6);
    assert.equal((await media.sendMicrophone(bytes)).result, 'invalid');
    assert.equal((await media.sendMicrophone(wire(2n, 3))).result, 'accepted');
    assert.equal(await media.stopMicrophone(), true);
    next.release();
  });
});

test('microphone session: malformed or replayed source fails only its session and clears backend listeners', async () => {
  for (const patch of [
    { epoch: 0n },
    { enabled: false },
    { revision: 1n, timestampUs: 0n },
    { timestampUs: -1n },
  ])
    await fixture(async ({ worker, manager, created }) => {
      worker.publish(patch);
      assert.equal(
        manager.get(created.sessionId, principal).error.code,
        'WORKER_INVALID_STATE',
      );
      await eventually(() => manager.statistics().active === 0);
      assert.equal(worker.listenerCount('microphone'), 0);
    });
});

test('microphone session: invalid wire is sanitized, backend admission/reset faults close authority without diagnostic disclosure', async () => {
  for (const mode of ['wire', 'submit', 'reset'])
    await fixture(async ({ worker, media, manager, created }) => {
      assert.equal(media.startMicrophone(), true);
      if (mode === 'wire') {
        await assert.rejects(media.sendMicrophone(Buffer.alloc(2)), {
          code: 'MEDIA_FAILED',
        });
        assert.equal(worker.sampleCalls, 0);
        assert.equal(await media.stopMicrophone(), true);
        return;
      }
      if (mode === 'submit')
        worker.sendMicrophone = async () => {
          throw new Error('untrusted diagnostic');
        };
      const result = await media.sendMicrophone(wire());
      if (mode === 'submit') assert.equal(result.result, 'unavailable');
      else {
        worker.resetMicrophone = async () => 'unavailable';
        assert.equal(await media.stopMicrophone(), false);
      }
      assert.equal(
        manager.get(created.sessionId, principal).error.code,
        'WORKER_FAILED',
      );
      assert.equal(
        JSON.stringify(manager.get(created.sessionId, principal)).includes(
          'untrusted',
        ),
        false,
      );
      assert.throws(() => media.startMicrophone(), { code: 'ATTACH_INVALID' });
    });
});

test('microphone session: cleanup joins pending sample ownership and late completion cannot reopen a closed session', async () => {
  await fixture(async ({ worker, media, manager, created }) => {
    const sample = deferred();
    worker.sendMicrophone = () => sample.promise;
    assert.equal(media.startMicrophone(), true);
    const packet = media.sendMicrophone(wire());
    const closed = manager.close(created.sessionId, principal);
    await Promise.resolve();
    assert.equal(manager.statistics().active, 1);
    sample.resolve('accepted');
    assert.equal((await packet).result, 'unavailable');
    await closed;
    assert.equal(manager.statistics().active, 0);
    assert.equal(worker.resetCalls, 0);
    assert.throws(() => media.startMicrophone(), { code: 'ATTACH_INVALID' });
  });
});
