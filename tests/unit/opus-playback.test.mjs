import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  encodeOpusAudioStateRecord,
  encodeOpusAudioConfigRecord,
  encodeOpusAudioPacketRecord,
} from '../../packages/protocol/dist/index.js';
const moduleUrl = (source) =>
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const pcmUrl = moduleUrl(
  await readFile('apps/reference-harness/pcm-playback.js'),
);
const wireUrl = moduleUrl(
  await readFile('apps/reference-harness/opus-wire.js'),
);
const { PcmPortSender } = await import(pcmUrl);
const { OpusPlayback } = await import(
  moduleUrl(
    (await readFile('apps/reference-harness/opus-playback.js', 'utf8'))
      .replace("'./opus-wire.js'", JSON.stringify(wireUrl))
      .replace("'./pcm-playback.js'", JSON.stringify(pcmUrl)),
  )
);
const buffer = (bytes) => Uint8Array.from(bytes).buffer;
function state(sequence, availability = 'ready', revision = 1n, epoch = 1n) {
  return buffer(
    encodeOpusAudioStateRecord(
      { enabled: true, availability, revision, epoch, timestampUs: revision },
      sequence,
    ),
  );
}
function config(sequence, epoch = 1n, time = 1000n) {
  return buffer(
    encodeOpusAudioConfigRecord(
      {
        codec: 'opus',
        sampleRate: 48000,
        channels: 2,
        packetFrames: 960,
        epoch,
        lookaheadFrames: 312,
      },
      time,
      sequence,
    ),
  );
}
function packet(sequence, time = 1000n, discontinuity = true) {
  return buffer(
    encodeOpusAudioPacketRecord(
      {
        epoch: 1n,
        timestampUs: time,
        frames: 960,
        silenceFrames: 0,
        discontinuity,
        encoded: Buffer.from([0xfc, 0xff, 0xfe]),
      },
      sequence,
    ),
  );
}
function fixture(timeoutMs = 1000) {
  const sent = [],
    decoders = [],
    acks = [],
    failures = [];
  const port = {
    postMessage(data, transfer) {
      sent.push(structuredClone(data, { transfer }));
    },
    close() {
      this.closed = true;
    },
  };
  let owner;
  const sink = new PcmPortSender(port, {
    sourceStatus: true,
    recordCredit: true,
    timeoutMs,
    onRecordAck: (seq) => owner.acknowledge(seq),
    onFailure: (reason) => owner.fail(reason),
  });
  owner = new OpusPlayback(sink, {
    timeoutMs,
    onRecordAck: (seq) => acks.push(seq),
    onFailure: (reason) => failures.push(reason),
    chunkFactory: (init) => init,
    decoderFactory(callbacks) {
      const decoder = {
        callbacks,
        state: 'unconfigured',
        decodeQueueSize: 0,
        configure(value) {
          this.config = value;
          this.state = 'configured';
        },
        decode(chunk) {
          this.chunk = chunk;
        },
        close() {
          this.state = 'closed';
        },
      };
      decoders.push(decoder);
      return decoder;
    },
  });
  const ack = () =>
    port.onmessage({
      data: { type: 'ack', id: sent.at(-1).id, accepted: true },
    });
  const prepare = () => {
    assert.equal(owner.record(state(0)), true);
    ack();
    assert.equal(owner.record(config(1)), true);
    ack();
  };
  return { owner, sink, port, sent, decoders, acks, failures, ack, prepare };
}
function audio(overrides = {}) {
  return {
    numberOfFrames: 960,
    numberOfChannels: 2,
    sampleRate: 48000,
    timestamp: 1000,
    closed: 0,
    copyTo(target, { planeIndex, format }) {
      assert.equal(format, 'f32-planar');
      target.fill(planeIndex ? -0.5 : 0.5);
    },
    close() {
      this.closed++;
    },
    ...overrides,
  };
}

test('Opus playback: decode owns one credit, copies stereo, closes AudioData before Worklet ACK', async () => {
  const f = fixture();
  try {
    f.prepare();
    assert.equal(f.owner.record(packet(2)), true);
    assert.deepEqual(f.acks, [0, 1]);
    assert.equal(f.owner.snapshot().decoding, 1);
    assert.deepEqual(f.decoders[0].config, {
      codec: 'opus',
      sampleRate: 48000,
      numberOfChannels: 2,
    });
    assert.equal(f.decoders[0].chunk.type, 'key');
    assert.equal(f.decoders[0].chunk.timestamp, 1000);
    const data = audio();
    f.decoders[0].callbacks.output(data);
    assert.equal(data.closed, 1);
    assert.deepEqual(f.acks, [0, 1]);
    const sent = f.sent.at(-1).packet;
    assert.equal(sent.timestampUs, 1000n);
    assert.equal(sent.discontinuity, true);
    assert.equal(sent.pcm.byteLength, 3840);
    const view = new DataView(sent.pcm);
    assert.equal(view.getInt16(0, true), 16384);
    assert.equal(view.getInt16(2, true), -16384);
    f.ack();
    assert.deepEqual(f.acks, [0, 1, 2]);
    assert.equal(f.owner.snapshot().recordInFlight, 0);
    assert.equal(f.owner.record(packet(3, 21000n, false)), true);
    const second = audio({ timestamp: 20999 });
    f.decoders[0].callbacks.output(second);
    f.ack();
    assert.equal(f.decoders.length, 1);
    assert.equal(f.owner.record(packet(4, 61000n, true)), true);
    assert.equal(f.decoders[0].state, 'closed');
    const stale = audio();
    f.decoders[0].callbacks.output(stale);
    assert.equal(stale.closed, 1);
    assert.equal(f.owner.closed, false);
    const next = audio({ timestamp: 61000 });
    f.decoders[1].callbacks.output(next);
    f.ack();
    assert.deepEqual(f.acks, [0, 1, 2, 3, 4]);
    assert.equal(f.owner.record(state(5, 'closed', 2n)), true);
    f.ack();
    assert.equal(f.decoders[1].state, 'closed');
    assert.equal(f.sent.at(-1).type, 'reset');
    assert.equal(f.owner.snapshot().playback.source.availability, 'closed');
    assert.deepEqual(f.failures, []);
  } finally {
    await f.owner.close();
  }
});

test('Opus playback: malformed output, duplicates and copy exceptions retire decoder and grant no packet ACK', async () => {
  for (const override of [
    { numberOfFrames: 961 },
    { numberOfChannels: 1 },
    { sampleRate: 44100 },
    { timestamp: 1002 },
    {
      copyTo() {
        throw new Error('fixture');
      },
    },
    {
      copyTo(target) {
        target.fill(NaN);
      },
    },
  ]) {
    const f = fixture();
    f.prepare();
    f.owner.record(packet(2));
    const data = audio(override);
    f.decoders[0].callbacks.output(data);
    await f.owner.close();
    assert.equal(data.closed, 1);
    assert.equal(f.port.closed, true);
    assert.equal(f.decoders[0].state, 'closed');
    assert.deepEqual(f.acks, [0, 1]);
    assert.deepEqual(f.failures, ['decoder']);
  }
  const f = fixture();
  f.prepare();
  f.owner.record(packet(2));
  f.decoders[0].callbacks.output(audio());
  const duplicate = audio();
  f.decoders[0].callbacks.output(duplicate);
  await f.owner.close();
  assert.equal(duplicate.closed, 1);
  assert.deepEqual(f.acks, [0, 1]);
  assert.deepEqual(f.failures, ['decoder']);
});

test('Opus playback: source and clock checks precede decode; concurrent record and unsafe PTS fail closed', async () => {
  for (const bytes of [
    packet(2, 1000n, false),
    packet(2, BigInt(Number.MAX_SAFE_INTEGER)),
    config(2, 2n),
    state(2, 'ready', 1n),
  ]) {
    const f = fixture();
    f.prepare();
    assert.equal(f.owner.record(bytes), false);
    assert.equal(f.decoders[0].chunk, undefined);
    await f.owner.close();
    assert.deepEqual(f.acks, [0, 1]);
  }
  const f = fixture();
  f.prepare();
  f.owner.record(packet(2));
  assert.equal(f.owner.record(packet(3, 21000n, false)), false);
  const late = audio();
  f.decoders[0].callbacks.output(late);
  await f.owner.close();
  assert.equal(late.closed, 1);
  assert.deepEqual(f.acks, [0, 1]);
});

test('Opus playback: decoder stall, SDK error and admission loss close all owned resources once', async () => {
  const stall = fixture(10);
  stall.prepare();
  stall.owner.record(packet(2));
  await new Promise((resolve) => setTimeout(resolve, 30));
  await stall.owner.close();
  assert.deepEqual(stall.failures, ['deadline']);
  assert.deepEqual(stall.acks, [0, 1]);
  const f = fixture();
  f.prepare();
  f.owner.record(packet(2));
  f.decoders[0].callbacks.error(new Error('ignored'));
  await f.owner.close();
  assert.deepEqual(f.failures, ['decoder']);
  const loss = fixture();
  loss.prepare();
  loss.owner.record(packet(2));
  loss.decoders[0].callbacks.output(audio());
  loss.port.onmessage({
    data: { type: 'ack', id: loss.sent.at(-1).id, accepted: false },
  });
  await loss.owner.close();
  assert.deepEqual(loss.acks, [0, 1]);
  assert.deepEqual(loss.failures, ['acknowledgment']);
});
