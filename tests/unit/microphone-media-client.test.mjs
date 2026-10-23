import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MicrophoneMediaClient,
  validateMicrophoneProfile,
} from '../../apps/reference-harness/microphone-media.js';
import { parseMicrophoneRecord } from '../../apps/reference-harness/microphone-wire.js';
import { parseMicrophoneOpusRecord } from '../../apps/reference-harness/microphone-opus-wire.js';
const profile = () => ({
  codec: 'pcm',
  sourceStatus: true,
  streamId: 4,
  sampleRate: 48000,
  channels: 2,
  frames: 960,
  maxPayloadBytes: 3876,
  maxInFlight: 1,
  packetTimeoutMs: 2000,
  stopTimeoutMs: 4000,
});
const state = (
  granted = false,
  epoch = '1',
  revision = '1',
  retiring = false,
  availability = 'ready',
) => ({
  granted,
  retiring,
  source: { enabled: true, availability, revision, epoch, timestampUs: '0' },
});
const message = (type, data) => ({
  v: 1,
  type: 'microphone.' + type,
  seq: 0,
  ts: 0,
  data,
});
function fixture(codec = 'pcm', codecApi) {
  let now = 0;
  const writes = [],
    changes = [],
    calls = { failed: 0 };
  const backend = {
    write(value) {
      writes.push(
        typeof value === 'string' ? JSON.parse(value) : value.slice(0),
      );
      return true;
    },
    changed: (value) => changes.push(value),
    failed: () => ++calls.failed,
  };
  const client = new MicrophoneMediaClient(
    backend,
    {
      ...profile(),
      codec,
      maxPayloadBytes: codec === 'opus' ? 1315 : 3876,
    },
    () => now,
    codecApi,
  );
  const emit = (type, data) => client.message(message(type, data));
  emit('state', state());
  return {
    client,
    backend,
    writes,
    changes,
    calls,
    emit,
    now(value) {
      now = value;
    },
    async grant(epoch = 1n, revision = '1') {
      const started = client.start(epoch);
      emit('state', state(true, epoch.toString(), revision));
      const request = writes
        .filter((value) => value.type === 'microphone.start')
        .at(-1);
      emit('result', {
        requestSeq: request.data.requestSeq,
        status: 'started',
      });
      assert.equal(await started, true);
      return client.authorize(epoch);
    },
    packet(timestampUs = 0n, epoch = 1n) {
      return { epoch, timestampUs, pcm: new Uint8Array(3840).fill(7) };
    },
  };
}

test('microphone media client: exact copied PCM profile and source, no implicit grant and independent JSON request sequence', async () => {
  const value = profile();
  assert.deepEqual(validateMicrophoneProfile(value), value);
  for (const patch of [
    { codec: 'opus' },
    { maxPayloadBytes: 3840 },
    { packetTimeoutMs: 1 },
    { extra: true },
  ])
    assert.throws(
      () => validateMicrophoneProfile({ ...value, ...patch }),
      /^Error: Invalid microphone media client$/,
    );
  const f = fixture();
  assert.equal(f.writes.length, 0);
  assert.equal(f.client.authorize(1n), undefined);
  f.client.source.source.epoch = 99n;
  assert.equal(f.client.source.source.epoch, 1n);
  const started = f.client.start(1n);
  assert.equal(await f.client.start(1n), false);
  assert.deepEqual(f.writes[0], {
    v: 1,
    type: 'microphone.start',
    data: { requestSeq: 1 },
  });
  f.emit('result', { requestSeq: 1, status: 'busy' });
  assert.equal(await started, false);
  const token = await f.grant();
  assert.equal(typeof token, 'symbol');
  assert.equal(f.writes[1].data.requestSeq, 2);
  f.client.sender.offer(token, f.packet(), 0);
  assert.equal(parseMicrophoneRecord(f.writes[2]).sequence, 1);
  assert.equal(f.client.sender.authorize, undefined);
  f.client.close();
  assert.equal(f.calls.failed, 0);
});

test('microphone media client: stop immediately revokes token, shares its barrier and keeps issued packet ACK through fresh epoch', async () => {
  const f = fixture(),
    token = await f.grant();
  f.client.sender.offer(token, f.packet(), 0);
  const stopped = f.client.stop();
  assert.equal(f.client.stop(), stopped);
  assert.equal(f.client.authorized(token, 1n), false);
  assert.equal(f.client.sender.offer(token, f.packet(20000n), 0), false);
  f.emit('state', state(false, '1', '1', true));
  f.emit('state', state(false, '2', '2'));
  f.emit('result', { requestSeq: 2, status: 'stopped' });
  await stopped;
  assert.equal(f.client.stats.inFlight, true);
  assert.equal(await f.client.start(2n), false);
  f.emit('ack', { sequence: 1, epoch: '1', status: 'unavailable' });
  const fresh = await f.grant(2n, '2');
  assert.notEqual(fresh, token);
  assert.equal(f.client.authorized(token, 1n), false);
  assert.equal(f.client.sender.offer(fresh, f.packet(0n, 2n), 0), true);
  assert.equal(parseMicrophoneRecord(f.writes.at(-1)).sequence, 2);
  assert.equal(parseMicrophoneRecord(f.writes.at(-1)).discontinuity, true);
  f.client.close();
});

test('microphone media client: cancellation during start retains issued correlation while stop cannot grant capture', async () => {
  const f = fixture();
  const started = f.client.start(1n),
    stopped = f.client.stop();
  assert.equal(await started, false);
  assert.equal(f.writes.length, 2);
  f.emit('state', state(true));
  f.emit('result', { requestSeq: 1, status: 'started' });
  assert.equal(f.client.authorize(1n), undefined);
  f.emit('state', state(false));
  f.emit('result', { requestSeq: 2, status: 'stopped' });
  await stopped;
  assert.equal(f.client.stats.active, false);
  assert.equal(f.calls.failed, 0);
  f.client.close();
});

test('microphone media client: controller/source revoke requests one stop and source epoch replacement never adopts the old local token', async () => {
  for (const mode of ['revoke', 'epoch']) {
    const f = fixture(),
      token = await f.grant();
    if (mode === 'revoke') f.emit('state', state(false, '1', '1', true));
    else f.emit('state', state(true, '2', '2'));
    assert.equal(f.client.authorized(token, 1n), false);
    const stopped = f.client.stop();
    assert.equal(
      f.writes.filter((value) => value.type === 'microphone.stop').length,
      1,
    );
    f.emit('state', state(false, '2', '2'));
    f.emit('result', { requestSeq: 2, status: 'stopped' });
    await stopped;
    f.client.close();
  }
});

test('microphone media client: command deadlines apply before late replies; stopped graph still has a packet deadline', async () => {
  for (const mode of [
    'startPoll',
    'startReply',
    'stopReply',
    'packetAfterStop',
    'backward',
  ]) {
    const f = fixture();
    let started, stopped;
    if (mode.startsWith('start')) started = f.client.start(1n);
    else {
      const token = await f.grant();
      if (mode === 'packetAfterStop')
        f.client.sender.offer(token, f.packet(), 0);
      if (mode !== 'backward') stopped = f.client.stop();
    }
    if (mode === 'backward') {
      f.now(10);
      f.client.poll();
      f.now(9);
      f.client.poll();
    }
    if (mode === 'startPoll') {
      f.now(1999);
      assert.equal(f.client.poll(), true);
      f.now(2000);
      f.client.poll();
    }
    if (mode === 'startReply') {
      f.now(2000);
      f.emit('result', { requestSeq: 1, status: 'busy' });
    }
    if (mode === 'stopReply') {
      f.now(4000);
      f.emit('result', { requestSeq: 2, status: 'stopped' });
    }
    if (mode === 'packetAfterStop') {
      f.emit('state', state(false, '2', '2'));
      f.emit('result', { requestSeq: 2, status: 'stopped' });
      await stopped;
      stopped = undefined;
      f.now(2000);
      f.client.poll();
    }
    if (started) assert.equal(await started, false);
    if (stopped)
      await assert.rejects(stopped, /^Error: Invalid microphone media client$/);
    assert.equal(f.calls.failed, 1, mode);
    assert.equal(f.client.stats.closed, true, mode);
    f.client.close();
    assert.equal(f.calls.failed, 1);
  }
});

test('microphone media client: malformed/replayed/unsolicited state/result/ACK or transport failure closes sanitized ownership once', async () => {
  for (const mode of [
    'unsolicitedGrant',
    'result',
    'ack',
    'extra',
    'revision',
    'writeFalse',
    'writeThrow',
    'unknownWrite',
    'changedThrow',
  ]) {
    const f = fixture();
    if (mode === 'unsolicitedGrant') f.emit('state', state(true));
    if (mode === 'result')
      f.emit('result', { requestSeq: 1, status: 'started' });
    if (mode === 'ack')
      f.emit('ack', { sequence: 1, epoch: '1', status: 'accepted' });
    if (mode === 'extra')
      f.client.message({ ...message('state', state()), extra: true });
    if (mode === 'revision') f.emit('state', state(false, '2', '1'));
    if (mode === 'changedThrow') {
      f.backend.changed = () => {
        throw new Error('private observer details');
      };
      f.emit('state', state());
    }
    if (mode.startsWith('write') || mode === 'unknownWrite') {
      f.backend.write = () => {
        if (mode === 'writeThrow') throw new Error('private transport details');
        return mode === 'writeFalse' ? false : undefined;
      };
      assert.equal(await f.client.start(1n), false);
    }
    assert.equal(f.calls.failed, 1, mode);
    assert.equal(f.client.stats.closed, true, mode);
    f.client.close();
  }
  const f = fixture();
  assert.equal(f.client.message({ v: 1, type: 'video.ack', data: {} }), false);
  assert.equal(f.calls.failed, 0);
  f.client.close();
});

test('microphone media client: reentrant write/observer closure cannot commit a grant or overlap stop; late results grant no ownership', async () => {
  for (const mode of ['result', 'stop', 'close', 'observer']) {
    const f = fixture();
    let stopped;
    if (mode !== 'observer')
      f.backend.write = () => {
        if (mode === 'result')
          f.emit('result', { requestSeq: 1, status: 'busy' });
        if (mode === 'stop') stopped = f.client.stop();
        if (mode === 'close') f.client.close();
        return true;
      };
    else f.backend.changed = () => f.client.close();
    const started = f.client.start(1n);
    if (mode === 'observer') f.emit('state', state(true));
    assert.equal(await started, false, mode);
    if (stopped) await assert.rejects(stopped);
    f.emit('result', { requestSeq: 1, status: 'started' });
    assert.equal(f.client.authorize(1n), undefined);
    assert.equal(f.client.stats.closed, true);
    f.client.close();
  }
});

function syntheticOpus() {
  const codecs = [];
  const api = {
    encoder(callbacks) {
      const codec = {
        callbacks,
        state: 'unconfigured',
        closes: 0,
        configure() {
          this.state = 'configured';
        },
        encode(data) {
          this.input = data;
        },
        close() {
          ++this.closes;
          this.state = 'closed';
        },
      };
      codecs.push(codec);
      return codec;
    },
    data(options) {
      return { ...options, close() {} };
    },
  };
  return {
    api,
    codecs,
    output(codec = codecs.at(-1)) {
      codec.callbacks.output(
        {
          timestamp: codec.input.timestamp,
          duration: 20000,
          byteLength: 3,
          copyTo: (bytes) => bytes.set([0xfc, 0xff, 0xfe]),
        },
        {
          decoderConfig: {
            codec: 'opus',
            sampleRate: 48000,
            numberOfChannels: 2,
            description: new Uint8Array([
              79, 112, 117, 115, 72, 101, 97, 100, 1, 2, 56, 1, 128, 187, 0, 0,
              0, 0, 0,
            ]).buffer,
          },
        },
      );
    },
  };
}
const binaryWrites = (f) =>
  f.writes.filter((value) => value instanceof ArrayBuffer);

test('Opus media client: exact independent profile, lazy codec and no implicit permission or PCM fallback', async (t) => {
  const selected = { ...profile(), codec: 'opus', maxPayloadBytes: 1315 };
  assert.deepEqual(validateMicrophoneProfile(selected), selected);
  for (const patch of [
    { codec: 'pcm' },
    { codec: 'unknown' },
    { maxPayloadBytes: 3876 },
    { frames: 480 },
    { extra: true },
  ])
    assert.throws(() => validateMicrophoneProfile({ ...selected, ...patch }));
  const sdk = syntheticOpus(),
    f = fixture('opus', sdk.api);
  t.after(() => f.client.close());
  assert.equal(sdk.codecs.length, 0);
  assert.equal(f.client.sender.offer(Symbol('foreign'), f.packet(), 0), false);
  assert.equal(await f.client.start(2n), false);
  assert.equal(sdk.codecs.length, 0);
  const token = await f.grant();
  assert.equal(sdk.codecs.length, 0);
  f.client.sender.offer(token, f.packet(), 0);
  assert.equal(sdk.codecs.length, 1);
  assert.equal(binaryWrites(f).length, 0);
  f.now(1);
  sdk.output();
  const unit = parseMicrophoneOpusRecord(binaryWrites(f)[0]);
  assert.equal(unit.discontinuity, true);
  assert.equal(unit.sequence, 1);
  assert.equal(unit.lookaheadFrames, 312);
  f.emit('ack', { sequence: 1, epoch: '1', status: 'accepted' });
  assert.equal(f.client.stats.accepted, 1);
  assert.equal(f.calls.failed, 0);
});

test('Opus media client: stop cancels unissued encoding before reset and stale callback cannot send; fresh permission creates new prediction', async (t) => {
  const sdk = syntheticOpus(),
    f = fixture('opus', sdk.api);
  t.after(() => f.client.close());
  const token = await f.grant();
  f.client.sender.offer(token, f.packet(), 0);
  const old = sdk.codecs[0],
    stopped = f.client.stop();
  assert.equal(old.closes, 1);
  assert.equal(f.client.stats.inFlight, false);
  assert.equal(f.client.authorized(token, 1n), false);
  sdk.output(old);
  assert.equal(binaryWrites(f).length, 0);
  f.emit('state', state(false, '2', '2'));
  f.emit('result', { requestSeq: 2, status: 'stopped' });
  await stopped;
  const fresh = await f.grant(2n, '2');
  f.client.sender.offer(fresh, f.packet(0n, 2n), 0);
  f.now(1);
  sdk.output();
  const unit = parseMicrophoneOpusRecord(binaryWrites(f)[0]);
  assert.equal(unit.sequence, 2);
  assert.equal(unit.epoch, 2n);
  assert.equal(unit.discontinuity, true);
  assert.equal(f.calls.failed, 0);
});

test('Opus media client: stop retires codec but issued old-epoch credit still needs the actual ACK before restart', async (t) => {
  const sdk = syntheticOpus(),
    f = fixture('opus', sdk.api);
  t.after(() => f.client.close());
  const token = await f.grant();
  f.client.sender.offer(token, f.packet(), 0);
  f.now(1);
  sdk.output();
  const stopped = f.client.stop();
  assert.equal(sdk.codecs[0].closes, 1);
  f.emit('state', state(false, '2', '2'));
  f.emit('result', { requestSeq: 2, status: 'stopped' });
  await stopped;
  assert.equal(f.client.stats.inFlight, true);
  assert.equal(await f.client.start(2n), false);
  f.emit('ack', { sequence: 1, epoch: '1', status: 'unavailable' });
  const fresh = await f.grant(2n, '2');
  f.client.sender.offer(fresh, f.packet(0n, 2n), 1);
  f.now(2);
  sdk.output();
  assert.equal(
    parseMicrophoneOpusRecord(binaryWrites(f)[1]).discontinuity,
    true,
  );
  assert.equal(f.calls.failed, 0);
});

test('Opus media client: preparation expiry retires the codec without a network ACK; issued timeout survives graph stop', async (t) => {
  const sdk = syntheticOpus(),
    f = fixture('opus', sdk.api);
  t.after(() => f.client.close());
  const token = await f.grant();
  f.client.sender.offer(token, f.packet(), 0);
  f.now(120);
  f.client.poll();
  assert.equal(sdk.codecs[0].closes, 1);
  sdk.output(sdk.codecs[0]);
  assert.equal(binaryWrites(f).length, 0);
  assert.equal(f.client.stats.active, true);
  f.client.sender.offer(token, f.packet(20000n), 120);
  f.now(121);
  sdk.output();
  assert.equal(
    parseMicrophoneOpusRecord(binaryWrites(f)[0]).discontinuity,
    true,
  );
  const stopped = f.client.stop();
  f.emit('state', state(false, '2', '2'));
  f.emit('result', { requestSeq: 2, status: 'stopped' });
  await stopped;
  f.now(2120);
  f.client.poll();
  assert.equal(f.client.stats.failed, true);
  assert.equal(f.calls.failed, 1);
});

test('Opus media client: codec error, uncertain transport and early ACK fail once without retry or PCM downgrade', async (t) => {
  for (const mode of ['codec', 'transport', 'earlyAck']) {
    const sdk = syntheticOpus(),
      f = fixture('opus', sdk.api);
    t.after(() => f.client.close());
    const token = await f.grant();
    f.client.sender.offer(token, f.packet(), 0);
    if (mode === 'codec')
      sdk.codecs[0].callbacks.error(new Error('Private codec error'));
    if (mode === 'transport') {
      const write = f.backend.write;
      f.backend.write = (value) => {
        if (typeof value !== 'string')
          throw new Error('Private transport error');
        return write(value);
      };
      f.now(1);
      sdk.output();
    }
    if (mode === 'earlyAck')
      f.emit('ack', { sequence: 1, epoch: '1', status: 'accepted' });
    f.client.poll();
    assert.equal(f.client.stats.failed, true, mode);
    assert.equal(f.calls.failed, 1, mode);
    assert.equal(binaryWrites(f).length, 0, mode);
    assert.equal(sdk.codecs[0].closes, 1, mode);
    sdk.output();
    f.client.poll();
    assert.equal(f.calls.failed, 1, mode);
    assert.equal(binaryWrites(f).length, 0, mode);
  }
});
