import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  WorkerProcess,
  OpusMediaSender,
} from '../../packages/node-bridge/dist/index.js';
import { eventually } from '../fixtures/session-worker.mjs';

test('fake private Opus recovery: sender retains issued ACK through correlated reset and fresh source epoch', async () => {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'bridge-opus-delivery-'));
  const worker = new WorkerProcess({
    workerPath: resolve(
      process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
      'fixture-audio-opus-reset' + (process.platform === 'win32' ? '.exe' : ''),
    ),
    runtimeRoot,
  });
  let latestConfig,
    audioCount = 0,
    sender,
    detach;
  worker.on('audio', (event) => {
    audioCount++;
    if (event.type === 'config') latestConfig = { ...event.config };
  });
  try {
    await worker.start();
    await worker.connect({
      target: { host: 'reset-valid' },
      auth: {},
      media: { audioOutput: 'opus' },
    });
    await eventually(() => audioCount === 3);
    sender = new OpusMediaSender({
      state: worker.audioState,
      config: latestConfig,
    });
    detach = (event) => assert.equal(sender.offer(event), true);
    worker.on('audio', detach);
    const records = [];
    const consumer = (bytes) => {
      assert.ok(records.length < 8);
      records.push(Buffer.from(bytes));
      return true;
    };
    assert.equal(sender.pump(0, consumer), 'sent');
    assert.equal(sender.resetEpoch, 1n);
    assert.equal(await worker.resetAudio(sender.resetEpoch), 'scheduled');
    await eventually(() => audioCount === 7);
    assert.equal(sender.resetEpoch, undefined);
    assert.equal(sender.snapshot().inFlight, 1);
    assert.equal(sender.pump(1, consumer), 'blocked');
    assert.equal(sender.acknowledge(records[0].readUInt32BE(12), 2), true);
    for (let now = 3; now <= 7; now += 2) {
      assert.equal(sender.pump(now, consumer), 'sent');
      assert.equal(
        sender.acknowledge(records.at(-1).readUInt32BE(12), now + 1),
        true,
      );
    }
    assert.deepEqual(
      records.map((r) => [r[5], r.readUInt32BE(12)]),
      [
        [9, 0],
        [9, 1],
        [3, 2],
        [4, 3],
      ],
    );
    assert.equal(records[2].readBigUInt64BE(40), 2n);
    assert.equal(records[3].readBigUInt64BE(16), 20000n);
    assert.equal(records[3].readUInt16BE(6), 2);
    assert.deepEqual(records[3].subarray(28), Buffer.from([0xfc, 0xff, 0xfe]));
    await worker.ping();
    assert.equal(sender.snapshot().pendingPacketBytes, 0);
  } finally {
    if (detach) worker.off('audio', detach);
    sender?.close();
    await worker.close();
    assert.deepEqual(await readdir(runtimeRoot), []);
    await rm(runtimeRoot, { recursive: true, force: true, maxRetries: 3 });
  }
});
