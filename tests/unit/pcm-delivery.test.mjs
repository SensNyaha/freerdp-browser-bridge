import test from 'node:test';
import assert from 'node:assert/strict';
import { PcmMediaSender } from '../../packages/node-bridge/dist/index.js';
import {
  ProtocolError,
  encodePcmAudioConfigRecord,
  decodePcmAudioStateRecord,
} from '../../packages/protocol/dist/index.js';
const state = (revision = 1n, availability = 'ready', epoch = 1n) => ({
  type: 'state',
  state: { enabled: true, availability, epoch, revision, timestampUs: 100000n },
});
const configuration = (epoch = 1n) => ({
  epoch,
  codec: 'pcm',
  sampleRate: 48000,
  channels: 2,
  sampleFormat: 's16le',
  packetFrames: 960,
});
const packet = (index = 0, epoch = 1n, discontinuity = index === 0) => ({
  type: 'packet',
  packet: {
    epoch,
    timestampUs: BigInt(index) * 20000n,
    frames: 960,
    silenceFrames: 0,
    discontinuity,
    pcm: Buffer.alloc(3840, 0x12),
  },
});
function consume(owner, now) {
  let copied;
  assert.equal(
    owner.pump(now, (bytes) => {
      copied = Buffer.from(bytes);
      return true;
    }),
    'sent',
  );
  assert.equal(owner.acknowledge(copied.readUInt32BE(12), now + 1), true);
  return copied;
}
function readyOwner() {
  const owner = new PcmMediaSender();
  assert.equal(owner.offer(state()), true);
  assert.equal(owner.offer({ type: 'config', config: configuration() }), true);
  assert.equal(owner.offer(packet()), true);
  return owner;
}
test('standalone PCM config record has independent exact vector and refuses descriptor clock/sequence errors', () => {
  assert.equal(
    encodePcmAudioConfigRecord(configuration(), 3n, 7).toString('hex'),
    '52574231010300020000000300000007000000000000000300000014010202010000bb8003c000000000000000000001',
  );
  for (const timestamp of [-1n, 3, 0xffffffffffffffffn])
    assert.throws(
      () => encodePcmAudioConfigRecord(configuration(), timestamp, 0),
      ProtocolError,
    );
  for (const sequence of [-1, 1.5, 0x100000000, NaN])
    assert.throws(
      () => encodePcmAudioConfigRecord(configuration(), 0n, sequence),
      ProtocolError,
    );
  assert.throws(
    () => encodePcmAudioConfigRecord({ ...configuration(), epoch: 0n }, 0n, 0),
    ProtocolError,
  );
});
test('PCM delivery: ready/config/PCM each consume one credit; attachment adds discontinuity and owns copied latest samples', () => {
  const owner = new PcmMediaSender({
    state: state().state,
    config: configuration(),
  });
  const first = packet(0, 1n, false);
  assert.equal(owner.offer(first), true);
  first.packet.pcm.fill(0x99);
  const status = consume(owner, 0);
  assert.equal(status[5], 9);
  assert.equal(decodePcmAudioStateRecord(status).state.availability, 'ready');
  const config = consume(owner, 2);
  assert.equal(config[5], 3);
  assert.equal(config.readBigUInt64BE(16), 0n);
  const pcm = consume(owner, 4);
  assert.equal(pcm[5], 4);
  assert.equal(pcm.readUInt16BE(6), 2);
  assert.equal(pcm[28], 0x12);
  assert.equal(pcm.length, 3868);
  for (let index = 1; index <= 100; index++)
    assert.equal(owner.offer(packet(index)), true);
  assert.equal(owner.snapshot().replacedPackets, 99);
  assert.equal(owner.snapshot().pendingPacketBytes, 3840);
  const latest = consume(owner, 6);
  assert.equal(latest.readBigUInt64BE(16), 2000000n);
  assert.equal(latest.readUInt16BE(6), 2);
  owner.offer(packet(101));
  const ordinary = consume(owner, 8);
  assert.equal(ordinary.readUInt16BE(6), 0);
  assert.equal(owner.snapshot().acknowledgements, 5);
  assert.equal(owner.snapshot().pendingPacketBytes, 0);
});
test('PCM delivery: stop clears unsent samples and waits for existing receiver credit without replay; recovery starts with config/discontinuity', () => {
  const owner = readyOwner();
  consume(owner, 0);
  consume(owner, 2);
  let flight;
  assert.equal(
    owner.pump(4, (bytes) => {
      flight = Buffer.from(bytes);
      return true;
    }),
    'sent',
  );
  owner.offer(packet(1));
  owner.offer(state(2n, 'closed', 2n));
  let callbacks = 0;
  assert.equal(
    owner.pump(5, () => {
      callbacks++;
      return true;
    }),
    'blocked',
  );
  assert.equal(callbacks, 0);
  assert.equal(owner.snapshot().inFlightBytes, 3868);
  assert.equal(owner.snapshot().pendingPacketBytes, 0);
  assert.equal(owner.snapshot().discardedPackets, 1);
  assert.equal(owner.acknowledge(flight.readUInt32BE(12), 6), true);
  const stop = consume(owner, 7);
  assert.equal(decodePcmAudioStateRecord(stop).state.availability, 'closed');
  assert.equal(
    owner.pump(9, () => {
      callbacks++;
      return true;
    }),
    'idle',
  );
  owner.offer(state(3n, 'ready', 2n));
  owner.offer({ type: 'config', config: configuration(2n) });
  owner.offer(packet(2, 2n, true));
  assert.equal(consume(owner, 10)[5], 9);
  assert.equal(consume(owner, 12)[5], 3);
  assert.equal(consume(owner, 14).readUInt16BE(6), 2);
});
test('PCM delivery: temporary transport refusal preserves sequence and latest-state scalar replacement, with fixed pending sample storage', () => {
  const owner = readyOwner();
  assert.equal(
    owner.pump(0, () => false),
    'blocked',
  );
  assert.equal(owner.snapshot().nextSequence, 0);
  owner.offer(state(2n, 'closed', 2n));
  owner.offer(state(3n, 'waiting', 2n));
  assert.equal(owner.snapshot().pendingPacketBytes, 0);
  assert.equal(owner.snapshot().pendingConfig, false);
  const metadata = consume(owner, 1);
  assert.equal(metadata.readUInt32BE(12), 0);
  assert.equal(decodePcmAudioStateRecord(metadata).state.revision, 3n);
  assert.equal(owner.snapshot().inFlightBytes, 0);
  assert.equal(
    owner.pump(3, () => true),
    'idle',
  );
});
test('PCM delivery: source order/replay and unknown events fail closed; fresh epochs require native discontinuity while attachment replay permits ordinary first samples', () => {
  for (const event of [
    packet(),
    { type: 'unknown' },
    { type: 'state', state: { ...state().state, enabled: false } },
  ]) {
    const owner = new PcmMediaSender();
    assert.equal(owner.offer(event), false);
    assert.equal(owner.snapshot().failed, true);
    assert.equal(
      owner.pump(0, () => true),
      'failed',
    );
  }
  const owner = new PcmMediaSender();
  owner.offer(state());
  owner.offer({ type: 'config', config: configuration() });
  assert.equal(owner.offer(packet(0, 1n, false)), false);
  assert.equal(owner.snapshot().pendingPacketBytes, 0);
  const replay = new PcmMediaSender({
    state: state().state,
    config: configuration(),
  });
  assert.equal(replay.offer(packet(0, 1n, false)), true);
  assert.equal(replay.offer(state()), false);
});
test('PCM delivery: wrong/duplicate ACK and exact receiver deadline retire credit; sequence never wraps', () => {
  for (const [sequence, now] of [
    [1, 1],
    [0, 2000],
  ]) {
    const owner = readyOwner();
    owner.pump(0, () => true);
    assert.equal(owner.acknowledge(sequence, now), false);
    assert.equal(owner.snapshot().failed, true);
  }
  const expired = readyOwner();
  expired.pump(0, () => true);
  assert.equal(
    expired.pump(2000, () => true),
    'failed',
  );
  assert.equal(expired.snapshot().inFlight, 0);
  const duplicate = readyOwner();
  consume(duplicate, 0);
  assert.equal(duplicate.acknowledge(0, 2), false);
  const maximum = new PcmMediaSender(
    { state: state(1n, 'waiting').state },
    2000,
    0xffffffff,
  );
  assert.equal(consume(maximum, 0).readUInt32BE(12), 0xffffffff);
  maximum.offer(state(2n));
  assert.equal(
    maximum.pump(2, () => true),
    'failed',
  );
  assert.equal(maximum.snapshot().nextSequence, 0x100000000);
});
test('PCM delivery: invalid clocks and reentry preserve ownership; output exceptions are terminal and explicit close drops pending storage', () => {
  const owner = readyOwner();
  assert.equal(
    owner.pump(-1, () => true),
    'invalid',
  );
  assert.equal(owner.snapshot().nextSequence, 0);
  assert.equal(
    owner.pump(5, () => false),
    'blocked',
  );
  assert.equal(
    owner.pump(4, () => true),
    'invalid',
  );
  assert.equal(
    owner.pump(5, () => {
      assert.equal(owner.offer(state(2n)), false);
      assert.equal(owner.acknowledge(0, 5), false);
      assert.equal(
        owner.pump(6, () => true),
        'invalid',
      );
      return true;
    }),
    'sent',
  );
  assert.equal(owner.acknowledge(0, 6), true);
  assert.equal(
    owner.pump(7, () => {
      throw new Error('uncertain transport admission');
    }),
    'failed',
  );
  assert.equal(owner.snapshot().pendingPacketBytes, 0);
  const closed = readyOwner();
  closed.close();
  closed.close();
  assert.equal(closed.snapshot().pendingPacketBytes, 0);
  assert.equal(
    closed.pump(0, () => true),
    'closed',
  );
  for (const timeout of [0, 19, 2001, Infinity])
    assert.throws(() => new PcmMediaSender({}, timeout), ProtocolError);
  assert.throws(
    () => new PcmMediaSender({ config: configuration() }),
    ProtocolError,
  );
});
