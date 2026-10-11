import test from 'node:test';
import assert from 'node:assert/strict';
import { OpusMediaSender } from '../../packages/node-bridge/dist/index.js';
import {
  ProtocolError,
  decodeOpusAudioState,
} from '../../packages/protocol/dist/index.js';
const state = (revision = 1n, epoch = 1n, availability = 'ready') => ({
  type: 'state',
  state: {
    enabled: true,
    availability,
    epoch,
    revision,
    timestampUs: 100000n + revision,
  },
});
const config = (epoch = 1n) => ({
  type: 'config',
  config: {
    codec: 'opus',
    epoch,
    sampleRate: 48000,
    channels: 2,
    packetFrames: 960,
    lookaheadFrames: 312,
  },
});
// Complete TOC/framing fixture only, not entropy or audible audio.
const packet = (index = 0, epoch = 1n, discontinuity = index === 0) => ({
  type: 'packet',
  packet: {
    epoch,
    timestampUs: BigInt(index) * 20000n,
    frames: 960,
    silenceFrames: 0,
    discontinuity,
    encoded: Buffer.from([0xfc, 0xff, 0xfe]),
  },
});
function send(owner, now, ack = true) {
  let copied;
  assert.equal(
    owner.pump(now, (bytes) => {
      copied = Buffer.from(bytes);
      return true;
    }),
    'sent',
  );
  if (ack)
    assert.equal(owner.acknowledge(copied.readUInt32BE(12), now + 1), true);
  return copied;
}
function ready() {
  const owner = new OpusMediaSender();
  assert.equal(owner.offer(state()), true);
  assert.equal(owner.offer(config()), true);
  assert.equal(owner.offer(packet()), true);
  return owner;
}
test('Opus delivery: state config and exact original prediction bytes each consume one credit', () => {
  const owner = ready();
  const status = send(owner, 0, false);
  assert.equal(status[5], 9);
  assert.equal(
    owner.pump(1, () => assert.fail()),
    'blocked',
  );
  assert.equal(owner.acknowledge(0, 2), true);
  const cfg = send(owner, 3);
  assert.equal(cfg[5], 3);
  assert.equal(cfg[29], 1);
  const first = send(owner, 5);
  assert.equal(first[5], 4);
  assert.equal(first.readUInt16BE(6), 2);
  assert.deepEqual(first.subarray(28), packet().packet.encoded);
  const original = packet(1);
  assert.equal(owner.offer(original), true);
  original.packet.encoded.fill(0x99);
  const ordinary = send(owner, 7);
  assert.equal(ordinary.readUInt16BE(6), 0);
  assert.equal(ordinary.readBigUInt64BE(16), 20000n);
  assert.deepEqual(ordinary.subarray(28), packet().packet.encoded);
  assert.equal(owner.snapshot().acknowledgements, 4);
  assert.equal(owner.resetEpoch, undefined);
});
test('Opus delivery: ready snapshot requests native reset and skips predictive history until fresh epoch', () => {
  const owner = new OpusMediaSender({
    state: state().state,
    config: config().config,
  });
  assert.equal(owner.resetEpoch, 1n);
  assert.equal(owner.snapshot().pendingConfig, false);
  assert.equal(owner.offer(packet(5, 1n, false)), true);
  assert.equal(owner.snapshot().pendingPacketBytes, 0);
  const status = send(owner, 0);
  assert.equal(decodeOpusAudioState(status.subarray(28)).epoch, 1n);
  assert.equal(
    owner.pump(2, () => assert.fail()),
    'idle',
  );
  assert.equal(owner.offer(state(2n, 2n, 'waiting')), true);
  assert.equal(owner.resetEpoch, undefined);
  assert.equal(owner.snapshot().recoveryPending, false);
  send(owner, 3);
  assert.equal(
    owner.pump(10000, () => assert.fail()),
    'idle',
  );
  assert.equal(owner.offer(state(3n, 2n)), true);
  assert.equal(owner.offer(config(2n)), true);
  assert.equal(owner.offer(packet(6, 2n, true)), true);
  send(owner, 10001);
  const cfg = send(owner, 10003);
  const data = send(owner, 10005);
  assert.equal(cfg.readBigUInt64BE(40), 2n);
  assert.equal(data.readBigUInt64BE(16), 120000n);
  assert.equal(data.readUInt16BE(6), 2);
  assert.deepEqual(data.subarray(28), packet().packet.encoded);
});
test('Opus delivery: occupied copied packet triggers one recovery without replacing bytes or revoking old ACK', () => {
  const owner = ready();
  send(owner, 0);
  const flight = send(owner, 2, false);
  assert.equal(owner.offer(packet(1)), true);
  assert.equal(owner.snapshot().pendingPacketBytes, 0);
  assert.equal(owner.resetEpoch, 1n);
  assert.equal(owner.snapshot().discardedPackets, 2);
  for (let index = 2; index < 102; index++)
    assert.equal(owner.offer(packet(index)), true);
  assert.equal(owner.snapshot().recoveryRequests, 1);
  assert.equal(owner.snapshot().pendingPacketBytes, 0);
  assert.equal(owner.snapshot().inFlight, 1);
  assert.equal(owner.offer(state(2n, 2n, 'waiting')), true);
  assert.equal(owner.offer(state(3n, 2n)), true);
  assert.equal(owner.offer(config(2n)), true);
  assert.equal(owner.offer(packet(102, 2n, true)), true);
  assert.equal(owner.acknowledge(flight.readUInt32BE(12), 3), true);
  const nextState = send(owner, 4);
  assert.equal(nextState.readUInt32BE(12), 2);
  send(owner, 6);
  const fresh = send(owner, 8);
  assert.equal(fresh.readBigUInt64BE(16), 2040000n);
  assert.equal(fresh.readUInt16BE(6), 2);
});
test('Opus delivery: blocked retries preserve exact packet sequence and clock without allocation growth', () => {
  const owner = ready();
  send(owner, 0);
  send(owner, 2);
  let candidate;
  for (let now = 4; now < 104; now++) {
    assert.equal(
      owner.pump(now, (bytes) => {
        candidate ??= Buffer.from(bytes);
        assert.deepEqual(bytes, candidate);
        return false;
      }),
      'blocked',
    );
    assert.equal(owner.snapshot().pendingPacketBytes, 3);
    assert.equal(owner.snapshot().inFlight, 0);
  }
  assert.deepEqual(send(owner, 104), candidate);
  assert.equal(owner.snapshot().nextSequence, 3);
});
test('Opus delivery: recovery and receiver deadlines clock regression sequence exhaustion and bad ACK fail boundedly', () => {
  const recovery = new OpusMediaSender(
    { state: state().state, config: config().config },
    20,
  );
  send(recovery, 0);
  assert.equal(
    recovery.pump(19, () => assert.fail()),
    'idle',
  );
  assert.equal(
    recovery.pump(20, () => assert.fail()),
    'failed',
  );
  assert.equal(recovery.resetEpoch, undefined);
  const receiver = ready();
  send(receiver, 0, false);
  assert.equal(receiver.acknowledge(0, 2000), false);
  assert.equal(receiver.snapshot().inFlightBytes, 0);
  const backwards = ready();
  send(backwards, 10);
  assert.equal(
    backwards.pump(9, () => assert.fail()),
    'invalid',
  );
  assert.equal(backwards.snapshot().failed, false);
  for (const sequence of [-1, 1.5, 0x100000000])
    assert.throws(() => new OpusMediaSender({}, 20, sequence), ProtocolError);
  const exhausted = new OpusMediaSender({}, 20, 0xffffffff);
  exhausted.offer(state());
  exhausted.offer(config());
  exhausted.offer(packet());
  send(exhausted, 0);
  assert.equal(
    exhausted.pump(2, () => assert.fail()),
    'failed',
  );
  const wrong = ready();
  send(wrong, 0, false);
  assert.equal(wrong.acknowledge(1, 1), false);
});
test('Opus delivery: malformed metadata TOC first boundary and skipped history fail before copying', () => {
  for (const incoming of [
    packet(0, 1n, false),
    {
      ...packet(),
      packet: { ...packet().packet, encoded: Buffer.alloc(1276) },
    },
    {
      ...packet(),
      packet: { ...packet().packet, encoded: Buffer.from([0xf8, 0]) },
    },
    packet(0, 2n),
  ]) {
    const owner = new OpusMediaSender();
    owner.offer(state());
    owner.offer(config());
    assert.equal(owner.offer(incoming), false);
    assert.equal(owner.snapshot().pendingPacketBytes, 0);
  }
  const skipped = new OpusMediaSender({
    state: state().state,
    config: config().config,
  });
  assert.equal(skipped.offer(packet(1)), true);
  assert.equal(skipped.offer(packet(1)), false);
  const owner = ready();
  owner.close();
  assert.equal(owner.offer(packet(1)), false);
  assert.equal(owner.snapshot().retiredPackets, 1);
  assert.equal(owner.snapshot().pendingPacketBytes, 0);
});
test('Opus delivery: reentrant offer and ACK refuse while callback close or failure retires bounded storage', () => {
  const owner = ready();
  assert.equal(
    owner.pump(0, () => {
      assert.equal(owner.offer(packet(1)), false);
      assert.equal(owner.acknowledge(0, 0), false);
      owner.close();
      return true;
    }),
    'closed',
  );
  assert.equal(owner.snapshot().inFlight, 0);
  assert.equal(owner.snapshot().pendingPacketBytes, 0);
  for (const send of [
    () => {
      throw new Error('consumer');
    },
    () => undefined,
  ]) {
    const bad = ready();
    assert.equal(bad.pump(0, send), 'failed');
    assert.equal(bad.snapshot().pendingPacketBytes, 0);
  }
});
