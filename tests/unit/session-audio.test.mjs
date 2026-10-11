import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SessionAudioSource,
  isPcmSourceEvent,
  isOpusSourceEvent,
} from '../../packages/node-bridge/dist/index.js';
import { ProtocolError } from '../../packages/protocol/dist/index.js';

const state = (revision = 1n, availability = 'ready', epoch = 1n) => ({
  type: 'state',
  state: {
    enabled: true,
    availability,
    revision,
    epoch,
    timestampUs: revision,
  },
});
const config = (codec, epoch = 1n) => ({
  type: 'config',
  config: {
    codec,
    epoch,
    sampleRate: 48000,
    channels: 2,
    packetFrames: 960,
    ...(codec === 'pcm' ? { sampleFormat: 's16le' } : { lookaheadFrames: 312 }),
  },
});
// Opus bytes are a TOC/framing fixture, not entropy-decoder or audible evidence.
const packet = (codec, timestampUs = 0n, discontinuity = true, epoch = 1n) => ({
  type: 'packet',
  packet: {
    epoch,
    timestampUs,
    frames: 960,
    silenceFrames: 0,
    discontinuity,
    ...(codec === 'pcm'
      ? { pcm: Buffer.alloc(3840) }
      : { encoded: Buffer.from([0xfc, 0xff, 0xfe]) }),
  },
});

test('managed audio source fixes its profile and refuses cross-codec or ambiguous samples atomically', () => {
  for (const codec of ['pcm', 'opus']) {
    const other = codec === 'pcm' ? 'opus' : 'pcm';
    const source = new SessionAudioSource(codec);
    assert.deepEqual(source.snapshot(), {
      codec,
      state: undefined,
      config: undefined,
    });
    source.acceptEvent(state());
    assert.throws(() => source.acceptEvent(config(other)), ProtocolError);
    source.acceptEvent(config(codec));
    assert.throws(() => source.acceptEvent(packet(other)), ProtocolError);
    const mixed = packet(codec);
    Object.assign(mixed.packet, packet(other).packet);
    assert.throws(() => source.acceptEvent(mixed), ProtocolError);
    assert.throws(
      () => source.acceptEvent(packet(codec, 0n, false)),
      ProtocolError,
    );
    assert.equal(source.acceptEvent(packet(codec)).packet.timestampUs, 0n);
    assert.equal(source.snapshot().codec, codec);
  }
  for (const invalid of ['off', undefined, null])
    assert.throws(() => new SessionAudioSource(invalid), ProtocolError);
});

test('managed audio source enforces readiness reset epochs and capture progress for both profiles', () => {
  for (const codec of ['pcm', 'opus']) {
    const source = new SessionAudioSource(codec);
    source.acceptEvent(state(1n, 'waiting'));
    assert.throws(() => source.acceptEvent(config(codec)), ProtocolError);
    source.acceptEvent(state(2n));
    source.acceptEvent(config(codec));
    source.acceptEvent(packet(codec));
    assert.throws(
      () => source.acceptEvent(packet(codec, 20001n, false)),
      ProtocolError,
    );
    source.acceptEvent(packet(codec, 20000n, false));
    source.acceptEvent(state(3n, 'waiting', 2n));
    assert.equal(source.snapshot().config, undefined);
    assert.throws(
      () => source.acceptEvent(packet(codec, 40000n)),
      ProtocolError,
    );
    source.acceptEvent(state(4n, 'ready', 2n));
    source.acceptEvent(config(codec, 2n));
    assert.throws(
      () => source.acceptEvent(packet(codec, 40000n, false, 2n)),
      ProtocolError,
    );
    source.acceptEvent(packet(codec, 40000n, true, 2n));
    assert.throws(
      () => source.acceptEvent(state(5n, 'ready', 1n)),
      ProtocolError,
    );
    assert.equal(source.current.epoch, 2n);
  }
});

test('managed audio snapshots copy metadata and never retain or replay source packet bytes', () => {
  for (const codec of ['pcm', 'opus']) {
    const source = new SessionAudioSource(codec);
    const status = state();
    source.acceptEvent(status);
    status.state.epoch = 9n;
    const format = config(codec);
    source.acceptEvent(format);
    format.config.epoch = 9n;
    const sample = packet(codec);
    const accepted = source.acceptEvent(sample);
    const key = codec === 'pcm' ? 'pcm' : 'encoded';
    assert.equal(accepted.packet[key], sample.packet[key]);
    const snapshot = source.snapshot();
    assert.deepEqual(Object.keys(snapshot).sort(), [
      'codec',
      'config',
      'state',
    ]);
    snapshot.state.epoch = 9n;
    snapshot.config.epoch = 9n;
    assert.equal(source.snapshot().state.epoch, 1n);
    assert.equal(source.snapshot().config.epoch, 1n);
  }
});

test('managed source narrowing refuses missing mixed and wrong profile fields without accepting their contents', () => {
  for (const invalid of [
    undefined,
    null,
    {},
    { type: 'unknown' },
    { type: 'packet' },
    { type: 'packet', packet: 1 },
    { type: 'config', config: null },
  ]) {
    assert.equal(isPcmSourceEvent(invalid), false);
    assert.equal(isOpusSourceEvent(invalid), false);
  }
  assert.equal(isPcmSourceEvent(state()), true);
  assert.equal(isOpusSourceEvent(state()), true);
  assert.equal(isPcmSourceEvent(config('opus')), false);
  assert.equal(isOpusSourceEvent(config('pcm')), false);
  const ambiguous = packet('pcm');
  ambiguous.packet.encoded = Buffer.from([0xfc, 0xff]);
  assert.equal(isPcmSourceEvent(ambiguous), false);
  assert.equal(isOpusSourceEvent(ambiguous), false);
  // Narrowing is not validation: each selected source still checks exact codec bounds.
  const malformed = packet('opus');
  malformed.packet.encoded = Buffer.alloc(1276);
  assert.equal(isOpusSourceEvent(malformed), true);
  const source = new SessionAudioSource('opus');
  source.acceptEvent(state());
  source.acceptEvent(config('opus'));
  assert.throws(() => source.acceptEvent(malformed), ProtocolError);
});
