import test from 'node:test';
import assert from 'node:assert/strict';
import { OpusSource } from '../../packages/node-bridge/dist/opus-source.js';
import { PcmSource } from '../../packages/node-bridge/dist/pcm-source.js';
import {
  Kind,
  ProtocolError,
  encodeOpusAudioState,
  encodeOpusAudioConfig,
  encodeOpusAudioPacket,
  encodePcmAudioState,
  encodePcmAudioConfig,
} from '../../packages/protocol/dist/index.js';

const state = (
  revision = 1n,
  availability = 'ready',
  epoch = 1n,
  timestampUs = 100000n,
) =>
  encodeOpusAudioState({
    enabled: true,
    availability,
    revision,
    epoch,
    timestampUs,
  });
const config = (epoch = 1n) =>
  encodeOpusAudioConfig({
    codec: 'opus',
    epoch,
    sampleRate: 48000,
    channels: 2,
    packetFrames: 960,
    lookaheadFrames: 312,
  });
// Framing/TOC fixture only; these tests make no entropy-decoder acceptance claim.
const packet = (timestampUs = 0n, discontinuity = true, epoch = 1n) =>
  encodeOpusAudioPacket({
    epoch,
    timestampUs,
    frames: 960,
    silenceFrames: 0,
    discontinuity,
    encoded: Buffer.from([0xfc, 0xff, 0xfe]),
  });

test('isolated Opus source requires ordered readiness/config and preserves the independent capture clock', () => {
  const owner = new OpusSource();
  assert.throws(() => owner.accept(Kind.AudioConfig, config()), ProtocolError);
  assert.throws(() => owner.accept(Kind.AudioOpus, packet()), ProtocolError);
  owner.accept(Kind.AudioState, state(1n, 'waiting'));
  assert.throws(() => owner.accept(Kind.AudioConfig, config()), ProtocolError);
  owner.accept(Kind.AudioState, state(2n));
  owner.accept(Kind.AudioConfig, config());
  assert.throws(() => owner.accept(Kind.AudioConfig, config()), ProtocolError);
  assert.throws(
    () => owner.accept(Kind.AudioOpus, packet(0n, false)),
    ProtocolError,
  );
  assert.equal(owner.accept(Kind.AudioOpus, packet()).packet.timestampUs, 0n);
  const malformed = packet(20000n, false);
  malformed[24] = 0xf8;
  assert.throws(() => owner.accept(Kind.AudioOpus, malformed), ProtocolError);
  owner.accept(Kind.AudioOpus, packet(20000n, false));
  assert.throws(
    () => owner.accept(Kind.AudioOpus, packet(40001n, false)),
    ProtocolError,
  );
  owner.accept(Kind.AudioOpus, packet(40000n, false));
  owner.accept(Kind.AudioOpus, packet(80000n));
  assert.throws(
    () => owner.accept(Kind.AudioOpus, packet(80000n)),
    ProtocolError,
  );
});

test('isolated Opus source refuses wire profile mixing before advancing shared ownership', () => {
  const owner = new OpusSource();
  const pcm = new PcmSource();
  const fields = {
    enabled: true,
    availability: 'ready',
    revision: 1n,
    epoch: 1n,
    timestampUs: 0n,
  };
  assert.throws(
    () => owner.accept(Kind.AudioState, encodePcmAudioState(fields)),
    ProtocolError,
  );
  assert.throws(() => pcm.accept(Kind.AudioState, state()), ProtocolError);
  assert.equal(owner.current, undefined);
  assert.equal(pcm.current, undefined);
  owner.accept(Kind.AudioState, state());
  pcm.accept(Kind.AudioState, encodePcmAudioState(fields));
  assert.throws(
    () =>
      owner.accept(
        Kind.AudioConfig,
        encodePcmAudioConfig({
          codec: 'pcm',
          epoch: 1n,
          sampleRate: 48000,
          channels: 2,
          sampleFormat: 's16le',
          packetFrames: 960,
        }),
      ),
    ProtocolError,
  );
  assert.throws(() => pcm.accept(Kind.AudioConfig, config()), ProtocolError);
  owner.accept(Kind.AudioConfig, config());
  assert.throws(() => owner.accept(Kind.AudioPcm, packet()), ProtocolError);
  assert.throws(
    () => owner.accept(Kind.Heartbeat, Buffer.alloc(0)),
    ProtocolError,
  );
  assert.throws(
    () =>
      owner.acceptEvent({
        type: 'packet',
        packet: {
          epoch: 1n,
          timestampUs: 0n,
          frames: 960,
          silenceFrames: 0,
          discontinuity: true,
          pcm: Buffer.alloc(3840),
        },
      }),
    ProtocolError,
  );
  owner.accept(Kind.AudioOpus, packet());
});

test('isolated Opus source clears config at Close and requires a fresh epoch without replaying samples', () => {
  const owner = new OpusSource();
  owner.accept(Kind.AudioState, state());
  owner.accept(Kind.AudioConfig, config());
  owner.accept(Kind.AudioOpus, packet(20000n));
  owner.current.availability = 'closed';
  owner.configuration.lookaheadFrames = 0;
  assert.equal(owner.current.availability, 'ready');
  assert.equal(owner.configuration.lookaheadFrames, 312);
  owner.accept(Kind.AudioState, state(2n, 'closed', 2n));
  assert.equal(owner.configuration, undefined);
  assert.throws(
    () => owner.accept(Kind.AudioOpus, packet(40000n)),
    ProtocolError,
  );
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
    () => owner.accept(Kind.AudioOpus, packet(40000n, false, 2n)),
    ProtocolError,
  );
  assert.throws(
    () => owner.accept(Kind.AudioOpus, packet(20000n, true, 2n)),
    ProtocolError,
  );
  assert.throws(
    () => owner.accept(Kind.AudioOpus, packet(40000n, true, 1n)),
    ProtocolError,
  );
  const bytes = packet(40000n, true, 2n);
  const accepted = owner.accept(Kind.AudioOpus, bytes);
  assert.equal(accepted.packet.encoded.buffer, bytes.buffer);
  assert.equal(accepted.packet.timestampUs, 40000n);
  assert.equal(owner.configuration.epoch, 2n);
  owner.accept(Kind.AudioOpus, packet(60000n, false, 2n));
});
