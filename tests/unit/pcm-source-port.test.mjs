import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  encodePcmAudioStateRecord,
  encodePcmAudioRecords,
} from '../../packages/protocol/dist/index.js';
const { PcmPortSender } = await import(
  'data:text/javascript;base64,' +
    (await readFile('apps/reference-harness/pcm-playback.js')).toString(
      'base64',
    )
);
const buffer = (bytes) => Uint8Array.from(bytes).buffer;
const configuration = {
  epoch: 1n,
  codec: 'pcm',
  sampleRate: 48000,
  channels: 2,
  sampleFormat: 's16le',
  packetFrames: 960,
};
function state(
  sequence,
  availability,
  revision = 1n,
  epoch = 1n,
  timestampUs = 0n,
  enabled = true,
) {
  return buffer(
    encodePcmAudioStateRecord(
      { enabled, availability, revision, epoch, timestampUs },
      sequence,
    ),
  );
}
function packets(sequence, index = 0, epoch = 1n, config = true) {
  return encodePcmAudioRecords(
    { ...configuration, epoch },
    {
      epoch,
      timestampUs: BigInt(index) * 20000n,
      frames: 960,
      silenceFrames: 0,
      discontinuity: config,
      pcm: Buffer.alloc(3840, index),
    },
    sequence,
    config,
  ).map(buffer);
}
class Port {
  sent = [];
  closed = false;
  postMessage(data, transfer) {
    this.sent.push(structuredClone(data, { transfer }));
  }
  close() {
    this.closed = true;
  }
  ack(id) {
    this.onmessage?.({ data: { type: 'ack', id, accepted: true } });
  }
}

test('PCM source port: Close resets independently and recovery needs the matching config', async () => {
  const port = new Port(),
    sender = new PcmPortSender(port, { sourceStatus: true });
  try {
    assert.equal(sender.record(state(0, 'ready')), true);
    for (const record of packets(1)) assert.equal(sender.record(record), true);
    assert.deepEqual(
      port.sent.map((item) => item.type),
      ['reset'],
    );
    port.ack(1);
    port.ack(2);
    port.ack(3);
    assert.deepEqual(
      port.sent.map((item) => item.type),
      ['reset', 'config', 'packet'],
    );
    assert.equal(sender.record(state(3, 'closed', 2n, 2n, 1000n)), true);
    assert.equal(port.sent[3].type, 'reset');
    assert.equal(sender.snapshot().pendingPacketBytes, 0);
    assert.equal(sender.snapshot().source.awaitingConfig, true);
    port.ack(4);
    assert.equal(sender.snapshot().inFlight, 0);
    assert.equal(sender.record(state(4, 'ready', 3n, 2n, 40000n)), true);
    // Metadata clock describes observation; captured PCM may precede it.
    for (const record of packets(5, 1, 2n))
      assert.equal(sender.record(record), true);
    port.ack(5);
    port.ack(6);
    assert.equal(port.sent[6].type, 'packet');
    assert.equal(port.sent[6].packet.timestampUs, 20000n);
    assert.equal(port.sent[6].packet.epoch, 2n);
    assert.equal(port.sent[6].packet.discontinuity, true);
    port.ack(7);
    assert.equal(sender.snapshot().sourceStates, 3);
    assert.equal(sender.snapshot().resetCommands, 3);
    assert.equal(sender.snapshot().source.epoch, '2');
  } finally {
    await sender.close();
  }
});

test('PCM source port: status discards pending samples and config behind an old flight', async () => {
  const port = new Port(),
    sender = new PcmPortSender(port, { sourceStatus: true });
  try {
    sender.record(state(0, 'ready'));
    for (const record of packets(1)) assert.equal(sender.record(record), true);
    port.ack(1); // Old config is in flight; old samples remain locally pending.
    assert.equal(sender.record(packets(3, 1, 1n, false)[0]), true);
    assert.equal(sender.record(state(4, 'closed', 2n, 2n, 21000n)), true);
    assert.equal(sender.snapshot().pendingPacketBytes, 0);
    assert.equal(sender.record(state(5, 'waiting', 3n, 2n, 22000n)), true);
    assert.equal(sender.record(state(6, 'ready', 4n, 2n, 40000n)), true);
    for (const record of packets(7, 2, 2n))
      assert.equal(sender.record(record), true);
    assert.equal(port.sent.length, 2);
    port.ack(2);
    port.ack(3);
    port.ack(4);
    assert.deepEqual(
      port.sent.map((item) => item.type),
      ['reset', 'config', 'reset', 'config', 'packet'],
    );
    assert.equal(port.sent[4].packet.epoch, 2n);
    assert.equal(new Uint8Array(port.sent[4].packet.pcm)[0], 2);
    assert.equal(sender.snapshot().resetDiscardedPackets, 1);
    assert.equal(sender.snapshot().pendingPacketBytes, 0);
    port.ack(5);
  } finally {
    await sender.close();
  }
});

test('PCM source port: metadata burst coalesces to one pending reset without samples', async () => {
  const port = new Port(),
    sender = new PcmPortSender(port, { sourceStatus: true });
  try {
    assert.equal(sender.record(state(0, 'waiting')), true);
    for (let index = 1; index <= 100; ++index)
      assert.equal(
        sender.record(
          state(
            index,
            index % 2 ? 'waiting' : 'closed',
            BigInt(index + 1),
            1n,
            BigInt(index),
          ),
        ),
        true,
      );
    assert.equal(port.sent.length, 1);
    assert.equal(sender.snapshot().pendingReset, true);
    assert.equal(sender.snapshot().pendingConfig, false);
    assert.equal(sender.snapshot().pendingPacketBytes, 0);
    port.ack(1);
    assert.equal(port.sent.length, 2);
    port.ack(2);
    assert.equal(sender.snapshot().inFlight, 0);
    assert.equal(sender.snapshot().source.revision, '101');
    assert.equal(sender.snapshot().source.availability, 'closed');
  } finally {
    await sender.close();
  }
});

test('PCM source port: no samples can bypass initial status stop or a fresh config boundary', async () => {
  const cases = [
    [packets(0)[0]],
    [state(0, 'ready'), packets(1, 0, 1n, false)[0]],
    [state(0, 'closed'), packets(1)[0]],
    [state(0, 'unavailable', 1n, 0n, 0n, false), packets(1)[0]],
    [state(0, 'ready', 1n, 2n), packets(1)[0]],
    [
      state(0, 'ready'),
      ...packets(1),
      state(3, 'suspended', 2n, 2n, 1000n),
      packets(4, 1, 1n, false)[0],
    ],
  ];
  for (const records of cases) {
    const port = new Port(),
      failures = [],
      sender = new PcmPortSender(port, {
        sourceStatus: true,
        onFailure: (reason) => failures.push(reason),
      });
    try {
      for (let at = 0; at < records.length; ++at)
        assert.equal(sender.record(records[at]), at !== records.length - 1);
      assert.equal(sender.snapshot().closed, true);
      assert.deepEqual(failures, ['protocol']);
      assert.equal(sender.snapshot().pendingPacketBytes, 0);
      assert.equal(port.closed, true);
    } finally {
      await sender.close();
    }
  }
});

test('PCM source port: replay backward source metadata and immutable mode violations retire ownership', async () => {
  for (const next of [
    state(1, 'closed', 1n, 2n, 1001n),
    state(1, 'closed', 2n, 0n, 1001n),
    state(1, 'closed', 2n, 2n, 999n),
    state(1, 'unavailable', 2n, 0n, 1001n, false),
  ]) {
    const port = new Port(),
      sender = new PcmPortSender(port, { sourceStatus: true });
    assert.equal(sender.record(state(0, 'ready', 1n, 1n, 1000n)), true);
    assert.equal(sender.record(next), false);
    assert.equal(sender.snapshot().closed, true);
    await sender.close();
  }
  for (const sourceStatus of [null, 1, 'true'])
    assert.throws(() => new PcmPortSender(new Port(), { sourceStatus }));
});

test('PCM record credit: source/config/sample wire ACK waits for the corresponding Worklet command, including Close without PCM', async () => {
  const port = new Port(),
    acks = [];
  const sender = new PcmPortSender(port, {
    sourceStatus: true,
    recordCredit: true,
    onRecordAck: (sequence) => acks.push(sequence),
  });
  try {
    const records = [state(0, 'ready'), ...packets(1), state(3, 'closed', 2n)];
    for (let i = 0; i < records.length; i++) {
      assert.equal(sender.record(records[i]), true);
      assert.deepEqual(
        acks,
        Array.from({ length: i }, (_, n) => n),
      );
      assert.equal(sender.snapshot().recordInFlight, 1);
      assert.equal(sender.snapshot().inFlight, 1);
      port.ack(i + 1);
      assert.deepEqual(
        acks,
        Array.from({ length: i + 1 }, (_, n) => n),
      );
      assert.equal(sender.snapshot().recordInFlight, 0);
    }
    assert.deepEqual(
      port.sent.map((c) => c.type),
      ['reset', 'config', 'packet', 'reset'],
    );
    assert.equal(sender.snapshot().replacedPackets, 0);
    assert.equal(sender.snapshot().pendingPacketBytes, 0);
  } finally {
    await sender.close();
  }
});

test('PCM record credit: a second unacknowledged record, invalid Worklet ACK or throwing receiver retires ownership without granting extra credit', async () => {
  for (const mode of ['burst', 'wrong', 'rejected', 'throw', 'close']) {
    const port = new Port(),
      acks = [],
      failures = [];
    const sender = new PcmPortSender(port, {
      sourceStatus: true,
      recordCredit: true,
      onRecordAck(sequence) {
        acks.push(sequence);
        if (mode === 'throw') throw new Error('observer');
      },
      onFailure: (reason) => failures.push(reason),
    });
    assert.equal(sender.record(state(0, 'ready')), true);
    if (mode === 'burst') assert.equal(sender.record(packets(1)[0]), false);
    if (mode === 'wrong') port.ack(2);
    if (mode === 'rejected')
      port.onmessage({ data: { type: 'ack', id: 1, accepted: false } });
    if (mode === 'throw') port.ack(1);
    if (mode === 'close') {
      await sender.close();
      port.ack(1);
    }
    assert.equal(sender.snapshot().closed, true);
    assert.deepEqual(acks, mode === 'throw' ? [0] : []);
    assert.equal(sender.snapshot().recordInFlight, 0);
    assert.equal(sender.snapshot().inFlight, 0);
    assert.equal(port.closed, true);
    assert.equal(failures.length, mode === 'close' ? 0 : 1);
    await sender.close();
  }
  for (const options of [
    { recordCredit: true },
    { recordCredit: true, sourceStatus: true },
    { recordCredit: true, sourceStatus: true, onRecordAck: 1 },
    { recordCredit: 'yes', sourceStatus: true, onRecordAck() {} },
  ])
    assert.throws(() => new PcmPortSender(new Port(), options));
});

test('PCM record credit: stats ACK cannot acknowledge a waiting record; receiver callback may synchronously admit its next record', async () => {
  const port = new Port(),
    acks = [];
  let sender;
  sender = new PcmPortSender(port, {
    sourceStatus: true,
    recordCredit: true,
    onRecordAck(sequence) {
      acks.push(sequence);
      if (sequence === 0) assert.equal(sender.record(packets(1)[0]), true);
    },
  });
  try {
    sender.requestStats();
    sender.record(state(0, 'ready'));
    const stats = Object.fromEntries(
      [
        'configurations',
        'packets',
        'playedFrames',
        'underflowFrames',
        'underflows',
        'bufferingSilenceFrames',
        'overflowSkippedFrames',
        'resetDiscardedFrames',
        'invalidCalls',
        'highWaterFrames',
        'queuedFrames',
      ].map((name) => [name, 0]),
    );
    port.onmessage({
      data: {
        type: 'ack',
        id: 1,
        accepted: true,
        stats: { ...stats, buffering: true },
      },
    });
    assert.deepEqual(acks, []);
    assert.equal(port.sent[1].type, 'reset');
    port.ack(2);
    assert.deepEqual(acks, [0]);
    assert.equal(port.sent[2].type, 'config');
    assert.equal(sender.snapshot().recordInFlight, 1);
    port.ack(3);
    assert.deepEqual(acks, [0, 1]);
    assert.equal(sender.snapshot().recordInFlight, 0);
  } finally {
    await sender.close();
  }
});
