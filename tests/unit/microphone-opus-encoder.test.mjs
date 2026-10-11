import test from 'node:test';
import assert from 'node:assert/strict';
import { MicrophoneOpusEncoder } from '../../apps/reference-harness/microphone-opus-encoder.js';
const packet = (pts = 0n, discontinuity = true) => ({
  epoch: 1n,
  timestampUs: pts,
  discontinuity,
  pcm: new Uint8Array(3840),
});
const description = () => ({
  decoderConfig: {
    codec: 'opus',
    sampleRate: 48000,
    numberOfChannels: 2,
    description: new Uint8Array([
      79, 112, 117, 115, 72, 101, 97, 100, 1, 2, 56, 1, 128, 187, 0, 0, 0, 0, 0,
    ]).buffer,
  },
});
function fixture(t) {
  let now = 0,
    authorized = true;
  const codecs = [],
    data = [],
    received = [];
  let failed = 0;
  const backend = {
    authorized: () => authorized,
    receive: (unit) => {
      received.push({ ...unit, encoded: unit.encoded.slice() });
      return true;
    },
    failed: () => {
      ++failed;
    },
  };
  const api = {
    encoder(callbacks) {
      const codec = {
        callbacks,
        state: 'unconfigured',
        closes: 0,
        configure(config) {
          this.config = config;
          this.state = 'configured';
        },
        encode(value) {
          this.data = value;
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
      const value = {
        ...options,
        data: options.data.slice(),
        closed: false,
        close() {
          this.closed = true;
        },
      };
      data.push(value);
      return value;
    },
  };
  const encoder = new MicrophoneOpusEncoder(1n, backend, api, () => now);
  t.after(() => encoder.close());
  const output = (
    pts = 0,
    metadata = description(),
    codec = codecs.at(-1),
    overrides = {},
  ) =>
    codec.callbacks.output(
      {
        timestamp: pts,
        duration: 20000,
        byteLength: 3,
        copyTo: (bytes) => bytes.set([0xfc, 1, 2]),
        ...overrides,
      },
      metadata,
    );
  return {
    encoder,
    codecs,
    data,
    received,
    backend,
    api,
    output,
    failed: () => failed,
    now: (value) => {
      now = value;
    },
    authorized: (value) => {
      authorized = value;
    },
  };
}

test('microphone Opus encoder: one codec input, exact planar conversion, closed AudioData and borrowed output copy', (t) => {
  const f = fixture(t),
    input = packet();
  const view = new DataView(input.pcm.buffer);
  view.setInt16(0, -32768, true);
  view.setInt16(2, 32767, true);
  const original = input.pcm.slice();
  assert.equal(f.encoder.encode(input), true);
  assert.equal(f.encoder.encode(packet(20000n, false)), false);
  assert.equal(f.data.length, 1);
  assert.equal(f.data[0].closed, true);
  assert.equal(f.data[0].data[0], -1);
  assert.equal(f.data[0].data[960], 32767 / 32768);
  assert.deepEqual(input.pcm, original);
  f.output();
  assert.equal(f.received.length, 1);
  assert.deepEqual(f.received[0].encoded, new Uint8Array([0xfc, 1, 2]));
  assert.equal(f.received[0].lookaheadFrames, 312);
  assert.equal(f.received[0].discontinuity, true);
  assert.equal(f.encoder.stats.inFlight, false);
  assert.equal(f.encoder.encode(packet(20000n, false)), true);
  f.output(20000, undefined);
  assert.equal(f.encoder.stats.delivered, 2);
  assert.equal(f.codecs.length, 1);
  f.encoder.close();
  assert.equal(f.codecs[0].closes, 1);
});

test('microphone Opus encoder: discontinuity retires old generation; late old callbacks cannot affect current packet', (t) => {
  const f = fixture(t);
  f.encoder.encode(packet());
  f.output();
  const old = f.codecs[0];
  assert.equal(f.encoder.encode(packet(80000n)), true);
  assert.equal(old.closes, 1);
  old.callbacks.error(new Error('old private details'));
  f.output(0, description(), old);
  assert.equal(f.failed(), 0);
  assert.equal(f.received.length, 1);
  f.output(80000);
  assert.equal(f.received[1].timestampUs, 80000n);
  assert.equal(f.received[1].discontinuity, true);
  assert.equal(f.encoder.stats.delivered, 2);
});

test('microphone Opus encoder: invalid input never reaches AudioData and cannot be retried in the failed scope', (t) => {
  for (const changes of [
    { epoch: 0n },
    { timestampUs: -1n },
    { timestampUs: BigInt(Number.MAX_SAFE_INTEGER) },
    { discontinuity: false },
    { pcm: new Uint8Array(3) },
    { pcm: new Uint8Array(new SharedArrayBuffer(3840)) },
  ]) {
    const f = fixture(t);
    assert.equal(f.encoder.encode({ ...packet(), ...changes }), false);
    assert.equal(f.data.length, 0);
    assert.equal(f.failed(), 1);
    assert.equal(f.encoder.stats.closed, true);
    assert.equal(f.encoder.encode(packet()), false);
  }
  for (const pts of [0n, 20001n]) {
    const f = fixture(t);
    f.encoder.encode(packet());
    f.output();
    assert.equal(f.encoder.encode(packet(pts, false)), false);
    assert.equal(f.data.length, 1);
  }
});

test('microphone Opus encoder: output size/profile/time/description/replay or receiver failure retires sanitized ownership', (t) => {
  for (const mode of [
    'size',
    'time',
    'duration',
    'toc',
    'description',
    'missing-description',
    'receiver',
    'replay',
  ]) {
    const f = fixture(t);
    f.encoder.encode(packet());
    const overrides =
      mode === 'size'
        ? { byteLength: 1276 }
        : mode === 'time'
          ? { timestamp: 1 }
          : mode === 'duration'
            ? { duration: 10000 }
            : mode === 'toc'
              ? { copyTo: (bytes) => bytes.set([0xf8, 1, 2]) }
              : {};
    const metadata = description();
    if (mode === 'description')
      new Uint8Array(metadata.decoderConfig.description)[10] = 255;
    if (mode === 'description')
      new Uint8Array(metadata.decoderConfig.description)[11] = 255;
    if (mode === 'receiver') f.backend.receive = () => false;
    f.output(
      0,
      mode === 'missing-description' ? {} : metadata,
      f.codecs[0],
      overrides,
    );
    if (mode === 'replay') f.output();
    assert.equal(f.failed(), 1, mode);
    assert.equal(f.encoder.stats.closed, true, mode);
  }
});

test('microphone Opus encoder: authority loss cancels without a fault; codec/clock/processing deadline fails once', (t) => {
  for (const mode of ['authority', 'clock', 'deadline', 'codec']) {
    const f = fixture(t);
    f.encoder.encode(packet());
    if (mode === 'authority') f.authorized(false);
    if (mode === 'clock') f.now(-1);
    if (mode === 'deadline') f.now(2000);
    if (mode === 'codec')
      f.codecs[0].callbacks.error(new Error('private SDK details'));
    f.encoder.poll();
    f.output();
    assert.equal(f.encoder.stats.closed, true);
    assert.equal(f.received.length, 0);
    assert.equal(f.failed(), mode === 'authority' ? 0 : 1);
    assert.equal(f.codecs[0].closes, 1);
  }
});

test('microphone Opus encoder: reentrant encode/output/receiver and AudioData cleanup cannot overlap input or retain old state', (t) => {
  for (const mode of ['output', 'data-close', 'receiver']) {
    const f = fixture(t);
    if (mode === 'output') f.codecs[0].encode = () => f.output();
    if (mode === 'data-close') {
      const create = f.api.data;
      f.api.data = (options) => {
        const value = create(options);
        value.close = () => {
          throw new Error('close');
        };
        return value;
      };
    }
    if (mode === 'receiver')
      f.backend.receive = () => {
        assert.equal(f.encoder.encode(packet(20000n, false)), false);
        f.encoder.close();
        return true;
      };
    assert.equal(f.encoder.encode(packet()), mode === 'receiver');
    if (mode === 'receiver') f.output();
    assert.equal(f.encoder.stats.closed, true);
    assert.equal(f.data.length, 1);
    assert.equal(f.codecs[0].closes, 1);
  }
});

test('microphone Opus encoder: late factory resources and reentrant packet copy are released before any new receiver call', (t) => {
  for (const mode of [
    'factory-close',
    'factory-error',
    'data-close',
    'copy-close',
  ]) {
    const f = fixture(t);
    if (mode.startsWith('factory')) {
      f.encoder.encode(packet());
      f.output();
      const create = f.api.encoder;
      f.api.encoder = (callbacks) => {
        if (mode === 'factory-close') f.encoder.close();
        else callbacks.error(new Error('private SDK initialization'));
        return create(callbacks);
      };
      assert.equal(f.encoder.encode(packet(80000n)), false);
      assert.equal(f.codecs.length, 2);
      assert.equal(f.codecs[1].closes, 1);
    } else if (mode === 'data-close') {
      const create = f.api.data;
      f.api.data = (options) => {
        const data = create(options);
        f.encoder.close();
        return data;
      };
      assert.equal(f.encoder.encode(packet()), false);
      assert.equal(f.data[0].closed, true);
      assert.equal(f.received.length, 0);
    } else {
      f.encoder.encode(packet());
      f.output(0, description(), f.codecs[0], {
        copyTo: (bytes) => {
          bytes.set([0xfc, 1, 2]);
          f.encoder.close();
        },
      });
      assert.equal(f.received.length, 0);
    }
    assert.equal(f.encoder.stats.closed, true);
    assert.equal(f.failed(), mode === 'factory-error' ? 1 : 0);
  }
  const f = fixture(t);
  let borrowed;
  f.backend.receive = (unit) => {
    borrowed = unit.encoded;
    return true;
  };
  f.encoder.encode(packet());
  f.output();
  assert.deepEqual(borrowed, new Uint8Array(3));
});
