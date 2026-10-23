import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { encodePcmAudioRecords } from '../../packages/protocol/dist/index.js';
const { PcmPortSender, parsePcmAudioRecord } = await import(
  'data:text/javascript;base64,' +
    (await readFile('apps/reference-harness/pcm-playback.js')).toString(
      'base64',
    )
);
const config = {
  epoch: 1n,
  codec: 'pcm',
  sampleRate: 48000,
  channels: 2,
  sampleFormat: 's16le',
  packetFrames: 960,
};
const buffer = (bytes) => Uint8Array.from(bytes).buffer;
function records(index, sequence, includeConfig = false, epoch = 1n) {
  return encodePcmAudioRecords(
    { ...config, epoch },
    {
      epoch,
      timestampUs: BigInt(index) * 20000n,
      frames: 960,
      silenceFrames: 0,
      discontinuity: includeConfig,
      pcm: Buffer.alloc(3840, index % 256),
    },
    sequence,
    includeConfig,
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
  ack(id, extra = {}) {
    this.onmessage?.({ data: { type: 'ack', id, accepted: true, ...extra } });
  }
}
test('PCM browser record parser: exact profile, epoch, header and storage limits', () => {
  const [cfg, pcm] = records(0, 0, true);
  assert.equal(parsePcmAudioRecord(cfg).epoch, 1n);
  assert.equal(parsePcmAudioRecord(pcm).pcm.byteLength, 3840);
  for (const source of [cfg, pcm]) {
    for (const size of [0, 27, 47, 49, 3867, 3869]) {
      const bad = new ArrayBuffer(size);
      new Uint8Array(bad).set(new Uint8Array(source).subarray(0, size));
      assert.throws(() => parsePcmAudioRecord(bad));
    }
    for (const at of [0, 4, 5, 6, 8, 24]) {
      const bad = source.slice(0);
      new Uint8Array(bad)[at] ^= 255;
      assert.throws(() => parsePcmAudioRecord(bad));
    }
  }
  for (const at of [28, 29, 30, 31, 32, 36, 38, 40]) {
    const bad = cfg.slice(0);
    if (at === 40) new Uint8Array(bad).fill(0, 40);
    else new Uint8Array(bad)[at] ^= 255;
    assert.throws(() => parsePcmAudioRecord(bad));
  }
});
test('PCM port owner: burst stays one posted command and one owned latest packet', async () => {
  const port = new Port(),
    sender = new PcmPortSender(port);
  try {
    const [cfg, first] = records(0, 0, true);
    assert.equal(sender.record(cfg), true);
    assert.equal(sender.record(first), true);
    for (let index = 1; index < 100; index++) {
      const packet = records(index, index + 1)[0];
      assert.equal(sender.record(packet), true);
      new Uint8Array(packet).fill(255); // Pending sample copy must be independent.
    }
    assert.equal(port.sent.length, 1);
    assert.equal(sender.snapshot().inFlight, 1);
    assert.equal(sender.snapshot().pendingPacketBytes, 3840);
    assert.equal(sender.snapshot().replacedPackets, 99);
    port.ack(1);
    assert.equal(port.sent.length, 2);
    assert.equal(port.sent[1].packet.timestampUs, 1980000n);
    assert.equal(port.sent[1].packet.discontinuity, true);
    assert.ok(
      new Uint8Array(port.sent[1].packet.pcm).every((value) => value === 99),
    );
    assert.equal(sender.snapshot().pendingPacketBytes, 0);
    port.ack(2);
    assert.equal(sender.snapshot().inFlight, 0);
  } finally {
    await sender.close();
  }
});
test('PCM port owner: new epoch replaces pending old audio and precedes its first packet', async () => {
  const port = new Port(),
    sender = new PcmPortSender(port);
  try {
    for (const record of records(0, 0, true))
      assert.equal(sender.record(record), true);
    for (const record of records(1, 2, true, 2n))
      assert.equal(sender.record(record), true);
    assert.equal(sender.snapshot().resetDiscardedPackets, 1);
    assert.equal(port.sent.length, 1);
    port.ack(1);
    assert.equal(port.sent[1].type, 'config');
    assert.equal(port.sent[1].epoch, 2n);
    port.ack(2);
    assert.equal(port.sent[2].type, 'packet');
    assert.equal(port.sent[2].packet.epoch, 2n);
    assert.equal(port.sent[2].packet.discontinuity, true);
    port.ack(3);
  } finally {
    await sender.close();
  }
});
test('PCM port owner: bad sequence, clock, boundary and stale ACK close ownership', async () => {
  for (const fault of ['sequence', 'clock', 'boundary', 'ack', 'empty-ack']) {
    const port = new Port(),
      failures = [];
    let cleanups = 0;
    const sender = new PcmPortSender(port, {
      onFailure: (reason) => failures.push(reason),
      cleanup: () => cleanups++,
    });
    for (const record of records(0, 0, true)) sender.record(record);
    if (fault === 'sequence') sender.record(records(1, 3)[0]);
    if (fault === 'clock') sender.record(records(0, 2)[0]);
    if (fault === 'boundary') {
      const [cfg, pcm] = records(1, 2, true);
      sender.record(cfg);
      new DataView(pcm).setUint16(6, 0);
      sender.record(pcm);
    }
    if (fault === 'ack') port.ack(99);
    if (fault === 'empty-ack') {
      port.ack(1);
      port.ack(2);
      port.onmessage({ data: { type: 'ack', accepted: true } });
    }
    await sender.close();
    await sender.close();
    assert.equal(sender.snapshot().closed, true);
    assert.equal(sender.snapshot().pendingPacketBytes, 0);
    assert.equal(port.closed, true);
    assert.equal(cleanups, 1);
    assert.equal(failures.length, 1);
    assert.equal(sender.record(records(1, 2)[0]), false);
    port.ack(1);
  }
});
test('PCM port owner: stalled command deadline releases bounded data and late ACKs', async () => {
  const port = new Port(),
    failures = [];
  const sender = new PcmPortSender(port, {
    timeoutMs: 15,
    onFailure: (reason) => failures.push(reason),
  });
  for (const record of records(0, 0, true)) sender.record(record);
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.deepEqual(failures, ['deadline']);
  assert.equal(sender.snapshot().closed, true);
  assert.equal(sender.snapshot().pendingPacketBytes, 0);
  assert.equal(port.closed, true);
  port.ack(1);
  assert.equal(sender.snapshot().acknowledged, 0);
  await sender.close();
});
test('PCM port owner: stats requests coalesce and validate fixed bounded snapshots', async () => {
  const port = new Port(),
    sender = new PcmPortSender(port);
  try {
    sender.record(records(0, 0, true)[0]);
    for (let at = 0; at < 100; at++) assert.equal(sender.requestStats(), true);
    assert.equal(port.sent.length, 1);
    port.ack(1);
    assert.equal(port.sent[1].type, 'stats');
    const stats = {
      configurations: 1,
      packets: 0,
      playedFrames: 0,
      underflowFrames: 0,
      underflows: 0,
      bufferingSilenceFrames: 0,
      overflowSkippedFrames: 0,
      resetDiscardedFrames: 0,
      invalidCalls: 0,
      highWaterFrames: 0,
      queuedFrames: 0,
      buffering: true,
    };
    port.ack(2, { stats });
    assert.deepEqual(sender.snapshot().remote, stats);
    sender.snapshot().remote.queuedFrames = 5000;
    assert.equal(sender.snapshot().remote.queuedFrames, 0);
    sender.requestStats();
    port.ack(3, { stats: { ...stats, queuedFrames: 5761 } });
    assert.equal(sender.snapshot().closed, true);
  } finally {
    await sender.close();
  }
});

test('PCM port owner: posting and port-close faults still finish exclusive resource cleanup', async () => {
  const port = new Port(),
    failures = [];
  let cleaned = 0;
  port.postMessage = () => {
    throw new Error('fixture posting failure');
  };
  port.close = () => {
    port.closed = true;
    throw new Error('fixture close failure');
  };
  const sender = new PcmPortSender(port, {
    cleanup: () => cleaned++,
    onFailure: (reason) => failures.push(reason),
  });
  assert.equal(sender.record(records(0, 0, true)[0]), false);
  await sender.close();
  assert.equal(port.closed, true);
  assert.equal(cleaned, 1);
  assert.equal(sender.snapshot().inFlight, 0);
  assert.deepEqual(failures, ['message']);
});
