import test from 'node:test';
import assert from 'node:assert/strict';
import { MicrophoneSender } from '../../apps/reference-harness/microphone-sender.js';
import {
  encodeMicrophoneOpusRecord,
  parseMicrophoneOpusRecord,
} from '../../apps/reference-harness/microphone-opus-wire.js';
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
const pcm = (timestampUs = 0n, epoch = 1n, byte = 7) => ({
  epoch,
  timestampUs,
  pcm: new Uint8Array(3840).fill(byte),
});
const ack = (sequence = 1, epoch = '1', status = 'accepted') => ({
  sequence,
  epoch,
  status,
});
function fixture() {
  const jobs = [],
    sent = [],
    counts = { cancel: 0, revoke: 0 };
  const backend = {
    send: (record) => {
      sent.push(record);
      return true;
    },
    revoke: () => {
      ++counts.revoke;
    },
    cancelPreparation: () => {
      ++counts.cancel;
    },
    prepare: (packet, sequence, finish) => {
      jobs.push({
        packet,
        sequence,
        finish,
        copied: new Uint8Array(packet.pcm),
      });
      return true;
    },
  };
  const sender = new MicrophoneSender(backend);
  sender.status(status(), 0);
  const token = sender.authorize(0);
  const record = (job, patch = {}) =>
    encodeMicrophoneOpusRecord(
      {
        ...job.packet,
        lookaheadFrames: 312,
        encoded: new Uint8Array([0xfc, 0xff, 0xfe]),
        ...patch,
      },
      job.sequence,
    );
  return { sender, backend, jobs, sent, counts, token, record };
}

test('microphone preparation: one copied/wiped codec job precedes one actual send/ACK, latest PCM is coalesced before encoding', () => {
  const f = fixture(),
    original = pcm();
  assert.equal(f.sender.offer(f.token, original, 0), true);
  assert.equal(original.pcm[0], 7);
  assert.equal(f.jobs[0].copied[0], 7);
  assert.equal(
    f.jobs[0].packet.pcm.every((v) => v === 0),
    true,
  );
  assert.equal(Object.isFrozen(f.jobs[0].packet), true);
  assert.equal(f.sender.stats.preparing, true);
  assert.equal(f.sender.stats.sent, 0);
  f.sender.offer(f.token, pcm(20000n), 1);
  f.sender.offer(f.token, pcm(40000n), 2);
  assert.equal(f.jobs.length, 1);
  assert.equal(f.sender.stats.pendingBytes, 3840);
  assert.equal(f.jobs[0].finish(f.record(f.jobs[0]), 3), true);
  assert.equal(f.sender.stats.preparing, false);
  assert.equal(f.sender.stats.sent, 1);
  assert.equal(f.sender.stats.inFlight, true);
  assert.equal(f.jobs.length, 1);
  f.sender.acknowledge(ack(), 4);
  assert.equal(f.jobs.length, 2);
  assert.equal(f.jobs[1].packet.timestampUs, 40000n);
  assert.equal(f.jobs[1].packet.discontinuity, true);
  f.jobs[1].finish(f.record(f.jobs[1]), 5);
  assert.equal(parseMicrophoneOpusRecord(f.sent[1]).sequence, 2);
  f.sender.acknowledge(ack(2), 6);
  assert.equal(f.sender.stats.accepted, 2);
  f.sender.close();
});

test('microphone preparation: epoch change cancels only unissued work, late output cannot write or acknowledge a newer job', () => {
  const f = fixture();
  f.sender.offer(f.token, pcm(), 0);
  const old = f.jobs[0];
  f.sender.status(status('2', '2'), 1);
  assert.equal(f.counts.cancel, 1);
  assert.equal(f.sender.stats.inFlight, false);
  f.sender.offer(f.token, pcm(0n, 2n), 2);
  assert.equal(f.jobs[1].sequence, 2);
  assert.equal(old.finish(f.record(old), 3), false);
  assert.equal(f.sent.length, 0);
  assert.equal(f.sender.stats.closed, false);
  f.jobs[1].finish(f.record(f.jobs[1]), 4);
  f.sender.acknowledge(ack(2, '2'), 5);
  assert.equal(f.sender.stats.accepted, 1);
  f.sender.close();
});

test('microphone preparation: issued old epoch remains owned until its real ACK; only then can new epoch encode', () => {
  const f = fixture();
  f.sender.offer(f.token, pcm(), 0);
  f.jobs[0].finish(f.record(f.jobs[0]), 1);
  f.sender.status(status('2', '2'), 2);
  assert.equal(f.counts.cancel, 0);
  f.sender.offer(f.token, pcm(0n, 2n), 3);
  assert.equal(f.jobs.length, 1);
  f.sender.acknowledge(ack(1, '1', 'stale'), 4);
  assert.equal(f.jobs.length, 2);
  assert.equal(f.jobs[1].packet.epoch, 2n);
  assert.equal(f.jobs[1].packet.discontinuity, true);
  f.sender.close();
});

test('microphone preparation: capture age expires at 120 ms before write; cancelled input is never replayed', () => {
  const f = fixture();
  f.sender.offer(f.token, pcm(), 0);
  f.sender.poll(120);
  assert.equal(f.counts.cancel, 1);
  assert.equal(f.sender.stats.inFlight, false);
  assert.equal(f.sender.stats.closed, false);
  assert.equal(f.jobs[0].finish(f.record(f.jobs[0]), 121), false);
  f.sender.offer(f.token, pcm(20000n), 122);
  assert.equal(f.jobs.length, 2);
  assert.equal(f.jobs[1].packet.discontinuity, true);
  f.jobs[1].finish(f.record(f.jobs[1]), 123);
  assert.equal(f.sent.length, 1);
  f.sender.close();
});

test('microphone preparation: explicit no-write retires predictive preparation and permits only latest fresh discontinuity', () => {
  const f = fixture();
  f.backend.send = () => false;
  f.sender.offer(f.token, pcm(), 0);
  f.sender.offer(f.token, pcm(20000n), 1);
  assert.equal(f.jobs[0].finish(f.record(f.jobs[0]), 2), false);
  assert.equal(f.counts.cancel, 1);
  assert.equal(f.sender.stats.sent, 0);
  assert.equal(f.jobs.length, 2);
  assert.equal(f.jobs[1].packet.timestampUs, 20000n);
  assert.equal(f.jobs[1].packet.discontinuity, true);
  f.backend.send = (record) => {
    f.sent.push(record);
    return true;
  };
  f.jobs[1].finish(f.record(f.jobs[1]), 3);
  assert.equal(f.sent.length, 1);
  f.sender.close();
});

test('microphone preparation: early ACK, synchronous output, malformed correlation and uncertain send fail closed without retry', () => {
  for (const mode of [
    'early-ack',
    'synchronous',
    'malformed',
    'epoch',
    'pts',
    'flags',
    'throw-send',
    'duplicate',
  ]) {
    const f = fixture();
    if (mode === 'synchronous')
      f.sender = new MicrophoneSender({
        ...f.backend,
        prepare: (packet, sequence, finish) => {
          finish(
            encodeMicrophoneOpusRecord(
              {
                ...packet,
                lookaheadFrames: 312,
                encoded: new Uint8Array([0xfc, 0xff]),
              },
              sequence,
            ),
            0,
          );
          return true;
        },
      });
    if (mode === 'synchronous') {
      f.sender.status(status(), 0);
      f.token = f.sender.authorize(0);
    }
    f.sender.offer(f.token, pcm(), 0);
    if (mode === 'early-ack') f.sender.acknowledge(ack(), 1);
    else if (mode !== 'synchronous') {
      if (mode === 'throw-send')
        f.backend.send = () => {
          throw new Error('private-sample-sentinel');
        };
      const patch =
        mode === 'epoch'
          ? { epoch: 2n }
          : mode === 'pts'
            ? { timestampUs: 1n }
            : mode === 'flags'
              ? { discontinuity: false }
              : {};
      f.jobs[0].finish(
        mode === 'malformed'
          ? new ArrayBuffer(1316)
          : f.record(f.jobs[0], patch),
        1,
      );
      if (mode === 'duplicate') f.jobs[0].finish(f.record(f.jobs[0]), 2);
    }
    assert.equal(f.sender.stats.closed, true, mode);
    assert.equal(f.sender.stats.faults, 1, mode);
    assert.equal(f.counts.revoke, 1, mode);
    assert.equal(f.sent.length, mode === 'duplicate' ? 1 : 0, mode);
    assert.equal(f.sender.offer(f.token, pcm(20000n), 3), false);
  }
});

test('microphone preparation: revoke cancels only unissued input; asynchronous cancellation cannot authorize another operation', () => {
  const f = fixture();
  f.sender.offer(f.token, pcm(), 0);
  assert.equal(f.sender.revoke(f.token), true);
  assert.equal(f.counts.cancel, 1);
  assert.equal(f.sender.stats.inFlight, false);
  assert.equal(f.jobs[0].finish(f.record(f.jobs[0]), 1), false);
  f.sender.close();
  const late = fixture();
  late.backend.cancelPreparation = () => Promise.resolve();
  const sender = new MicrophoneSender(late.backend);
  sender.status(status(), 0);
  const token = sender.authorize(0);
  sender.offer(token, pcm(), 0);
  sender.poll(120);
  assert.equal(sender.stats.closed, true);
  assert.equal(sender.stats.faults, 1);
  assert.throws(
    () =>
      new MicrophoneSender({
        send: () => true,
        revoke: () => {},
        prepare: () => true,
      }),
  );
});
