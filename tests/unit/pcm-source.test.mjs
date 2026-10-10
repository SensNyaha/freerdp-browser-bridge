import test from 'node:test';
import assert from 'node:assert/strict';
import { PcmSource } from '../../packages/node-bridge/dist/pcm-source.js';
import {
  Kind,
  ProtocolError,
  encodePcmAudioState,
  encodePcmAudioConfig,
  encodePcmAudioPacket,
} from '../../packages/protocol/dist/index.js';
const state = (
  revision,
  availability = 'ready',
  epoch = 1n,
  timestampUs = 100000n,
) =>
  encodePcmAudioState({
    enabled: true,
    availability,
    revision,
    epoch,
    timestampUs,
  });
const config = (epoch = 1n) =>
  encodePcmAudioConfig({
    epoch,
    codec: 'pcm',
    sampleRate: 48000,
    channels: 2,
    sampleFormat: 's16le',
    packetFrames: 960,
  });
const packet = (timestampUs = 0n, discontinuity = true, epoch = 1n) =>
  encodePcmAudioPacket({
    epoch,
    timestampUs,
    frames: 960,
    silenceFrames: 0,
    discontinuity,
    pcm: Buffer.alloc(3840),
  });
test('private PCM owner requires status/config/discontinuity and keeps capture time separate from status time', () => {
  const owner = new PcmSource();
  assert.throws(() => owner.accept(Kind.AudioConfig, config()), ProtocolError);
  assert.throws(() => owner.accept(Kind.AudioPcm, packet()), ProtocolError);
  owner.accept(Kind.AudioState, state(1n, 'waiting'));
  assert.throws(() => owner.accept(Kind.AudioConfig, config()), ProtocolError);
  owner.accept(Kind.AudioState, state(2n));
  assert.throws(() => owner.accept(Kind.AudioPcm, packet()), ProtocolError);
  owner.accept(Kind.AudioConfig, config());
  assert.throws(() => owner.accept(Kind.AudioConfig, config()), ProtocolError);
  assert.throws(
    () => owner.accept(Kind.AudioPcm, packet(0n, false)),
    ProtocolError,
  );
  assert.equal(owner.accept(Kind.AudioPcm, packet()).packet.timestampUs, 0n);
  owner.accept(Kind.AudioPcm, packet(20000n, false));
  assert.throws(
    () => owner.accept(Kind.AudioPcm, packet(20001n, false)),
    ProtocolError,
  );
  owner.accept(Kind.AudioPcm, packet(40000n, false));
  owner.accept(Kind.AudioPcm, packet(80000n));
  assert.throws(
    () => owner.accept(Kind.AudioPcm, packet(80000n)),
    ProtocolError,
  );
});
test('private PCM owner drops configuration at stop/reset and rejects replay, stale epochs and backwards clocks atomically', () => {
  const owner = new PcmSource();
  owner.accept(Kind.AudioState, state(1n));
  owner.accept(Kind.AudioConfig, config());
  owner.accept(Kind.AudioPcm, packet(20000n));
  owner.accept(Kind.AudioState, state(2n, 'closed', 2n));
  assert.equal(owner.current.availability, 'closed');
  assert.throws(
    () => owner.accept(Kind.AudioPcm, packet(40000n)),
    ProtocolError,
  );
  const current = owner.current;
  current.availability = 'ready';
  assert.equal(owner.current.availability, 'closed');
  for (const bytes of [
    state(2n, 'ready', 2n),
    state(3n, 'ready', 1n),
    state(3n, 'ready', 2n, 99999n),
  ])
    assert.throws(() => owner.accept(Kind.AudioState, bytes), ProtocolError);
  owner.accept(Kind.AudioState, state(3n, 'ready', 2n));
  assert.throws(() => owner.accept(Kind.AudioConfig, config()), ProtocolError);
  owner.accept(Kind.AudioConfig, config(2n));
  assert.throws(
    () => owner.accept(Kind.AudioPcm, packet(40000n, true, 1n)),
    ProtocolError,
  );
  assert.throws(
    () => owner.accept(Kind.AudioPcm, packet(10000n, true, 2n)),
    ProtocolError,
  );
  owner.accept(Kind.AudioPcm, packet(40000n, true, 2n));
});
