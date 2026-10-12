import test from 'node:test';
import assert from 'node:assert/strict';
import { MicrophoneOpusSender } from '../../apps/reference-harness/microphone-opus-sender.js';
import { parseMicrophoneOpusRecord } from '../../apps/reference-harness/microphone-opus-wire.js';
const status = (epoch = '1', revision = '1', granted = true) => ({
  granted,
  retiring: false,
  source: {
    enabled: true,
    availability: 'ready',
    epoch,
    revision,
    timestampUs: revision,
  },
});
const packet = (timestampUs = 0n, epoch = 1n) => ({
  epoch,
  timestampUs,
  pcm: new Uint8Array(3840),
});
const ack = (sequence = 1, epoch = '1', status = 'accepted') => ({
  sequence,
  epoch,
  status,
});
const metadata = () => ({
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
  let now = 0;
  const codecs = [],
    data = [],
    sent = [],
    counts = { revoke: 0 };
  const api = {
    encoder(callbacks) {
      const codec = {
        callbacks,
        state: 'unconfigured',
        closes: 0,
        configure() {
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
  const backend = {
    send: (record) => {
      sent.push(record);
      return true;
    },
    revoke: () => {
      ++counts.revoke;
    },
  };
  const sender = new MicrophoneOpusSender(backend, api, () => now);
  t.after(() => sender.close());
  const output = (timestamp = 0, codec = codecs.at(-1), extra = metadata()) =>
    codec.callbacks.output(
      {
        timestamp,
        duration: 20000,
        byteLength: 3,
        copyTo: (bytes) => bytes.set([0xfc, 0xff, 0xfe]),
      },
      extra,
    );
  return {
    sender,
    backend,
    api,
    codecs,
    data,
    sent,
    counts,
    output,
    time(value) {
      now = value;
    },
    grant() {
      sender.status(status(), now);
      return sender.authorize(now);
    },
  };
}

test('Opus sender: no codec before permission token, one synthetic PCM input and actual encoded wire until real ACK', (t) => {
  const f = fixture(t);
  assert.equal(f.codecs.length, 0);
  f.sender.status(status(), 0);
  assert.equal(f.sender.offer(Symbol('foreign'), packet(), 0), false);
  assert.equal(f.codecs.length, 0);
  const token = f.sender.authorize(0),
    original = packet();
  new DataView(original.pcm.buffer).setInt16(0, -32768, true);
  assert.equal(f.sender.offer(token, original, 0), true);
  assert.equal(f.codecs.length, 1);
  assert.equal(f.data[0].data[0], -1);
  assert.equal(f.data[0].closed, true);
  assert.equal(new DataView(original.pcm.buffer).getInt16(0, true), -32768);
  assert.equal(f.sent.length, 0);
  f.time(1);
  f.output();
  const unit = parseMicrophoneOpusRecord(f.sent[0]);
  assert.equal(unit.sequence, 1);
  assert.equal(unit.lookaheadFrames, 312);
  assert.equal(unit.discontinuity, true);
  assert.equal(unit.epoch, 1n);
  assert.equal(f.sender.stats.sent, 1);
  assert.equal(f.sender.stats.inFlight, true);
  f.time(2);
  f.sender.acknowledge(ack(), 2);
  assert.equal(f.sender.stats.accepted, 1);
  assert.equal(f.sender.stats.closed, false);
});

test('Opus sender: latest unencoded PCM replaces before codec and new discontinuity resets the existing SDK generation', (t) => {
  const f = fixture(t),
    token = f.grant();
  f.sender.offer(token, packet(), 0);
  f.time(1);
  f.output();
  f.time(2);
  f.sender.offer(token, packet(20000n), 2);
  f.time(3);
  f.sender.offer(token, packet(40000n), 3);
  assert.equal(f.data.length, 1);
  assert.equal(f.sender.stats.pendingBytes, 3840);
  f.time(4);
  f.sender.acknowledge(ack(), 4);
  assert.equal(f.data.length, 2);
  assert.equal(f.data[1].timestamp, 40000);
  assert.equal(f.codecs[0].closes, 1);
  f.time(5);
  f.output(40000);
  const unit = parseMicrophoneOpusRecord(f.sent[1]);
  assert.equal(unit.discontinuity, true);
  assert.equal(unit.timestampUs, 40000n);
  f.time(6);
  f.sender.acknowledge(ack(2), 6);
  f.time(7);
  f.sender.offer(token, packet(60000n), 7);
  assert.equal(f.codecs.length, 2);
  f.time(8);
  f.output(60000, undefined, undefined);
  assert.equal(parseMicrophoneOpusRecord(f.sent[2]).discontinuity, false);
});

test('Opus sender: expired or revoked unissued codec closes and late callbacks cannot emit; next fresh input starts discontinuously', (t) => {
  for (const mode of ['expire', 'revoke', 'epoch']) {
    const f = fixture(t),
      token = f.grant();
    f.sender.offer(token, packet(), 0);
    const old = f.codecs[0];
    if (mode === 'revoke') f.sender.revoke(token);
    else if (mode === 'epoch') {
      f.time(1);
      f.sender.status(status('2', '2'), 1);
    } else {
      f.time(120);
      f.sender.poll(120);
    }
    assert.equal(old.closes, 1);
    assert.equal(f.sender.stats.inFlight, false);
    f.output(0, old);
    old.callbacks.error(new Error('Old private codec details'));
    assert.equal(f.sent.length, 0);
    assert.equal(f.sender.stats.closed, false);
    if (mode === 'revoke') continue;
    const time = mode === 'expire' ? 121 : 2,
      epoch = mode === 'epoch' ? 2n : 1n;
    f.time(time);
    f.sender.offer(token, packet(20000n, epoch), time);
    f.time(time + 1);
    f.output(20000);
    assert.equal(parseMicrophoneOpusRecord(f.sent[0]).discontinuity, true);
  }
});

test('Opus sender: issued old epoch retains real ACK while retired encoder cannot touch replacement', (t) => {
  const f = fixture(t),
    token = f.grant();
  f.sender.offer(token, packet(), 0);
  f.time(1);
  f.output();
  const old = f.codecs[0];
  f.time(2);
  f.sender.status(status('2', '2'), 2);
  assert.equal(old.closes, 1);
  assert.equal(f.sender.stats.inFlight, true);
  f.time(3);
  f.sender.offer(token, packet(0n, 2n), 3);
  assert.equal(f.codecs.length, 1);
  f.time(4);
  f.sender.acknowledge(ack(1, '1', 'stale'), 4);
  assert.equal(f.codecs.length, 2);
  f.output(0, old);
  assert.equal(f.sent.length, 1);
  f.time(5);
  f.output();
  assert.equal(parseMicrophoneOpusRecord(f.sent[1]).epoch, 2n);
});

test('Opus sender: explicit no-write retires codec without replay; uncertain send and codec failure revoke once', (t) => {
  const f = fixture(t),
    token = f.grant();
  f.backend.send = () => false;
  f.sender.offer(token, packet(), 0);
  const old = f.codecs[0];
  f.time(1);
  f.output();
  assert.equal(old.closes, 1);
  assert.equal(f.sender.stats.closed, false);
  assert.equal(f.sender.stats.sent, 0);
  f.backend.send = (record) => {
    f.sent.push(record);
    return true;
  };
  f.time(2);
  f.sender.offer(token, packet(20000n), 2);
  f.time(3);
  f.output(20000);
  assert.equal(f.sent.length, 1);
  assert.equal(parseMicrophoneOpusRecord(f.sent[0]).sequence, 2);
  assert.equal(parseMicrophoneOpusRecord(f.sent[0]).discontinuity, true);
  for (const mode of ['send', 'codec']) {
    const g = fixture(t),
      grant = g.grant();
    g.sender.offer(grant, packet(), 0);
    if (mode === 'send') {
      g.backend.send = () => {
        throw new Error('Private transport detail');
      };
      g.time(1);
      g.output();
    } else g.codecs[0].callbacks.error(new Error('Private SDK detail'));
    assert.equal(g.sender.stats.closed, true);
    assert.equal(g.sender.stats.faults, 1);
    assert.equal(g.counts.revoke, 1);
    assert.equal(g.sent.length, 0);
    assert.equal(g.codecs[0].closes, 1);
  }
});

test('Opus sender: failed codec retirement closes admission and revokes once', (t) => {
  const f = fixture(t),
    token = f.grant();
  f.sender.offer(token, packet(), 0);
  f.codecs[0].close = function () {
    ++this.closes;
    throw new Error('Private codec close detail');
  };
  f.time(121);
  f.sender.poll(121);
  assert.equal(f.sender.stats.closed, true);
  assert.equal(f.sender.stats.faults, 1);
  assert.equal(f.counts.revoke, 1);
  assert.equal(f.codecs[0].closes, 1);
  f.output();
  assert.equal(f.sent.length, 0);
});

test('Opus sender: reentrant permission loss closes a late codec factory result before input', (t) => {
  const f = fixture(t),
    token = f.grant(),
    factory = f.api.encoder;
  f.api.encoder = (callbacks) => {
    const codec = factory(callbacks);
    f.sender.status(status('1', '2', false), 0);
    return codec;
  };
  f.sender.offer(token, packet(), 0);
  assert.equal(f.codecs.length, 1);
  assert.equal(f.codecs[0].closes, 1);
  assert.equal(f.data.length, 0);
  assert.equal(f.counts.revoke, 1);
  f.output();
  assert.equal(f.sent.length, 0);
  assert.equal(f.sender.stats.inFlight, false);
});
