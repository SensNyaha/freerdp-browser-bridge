import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MicrophoneSender,
  parseMicrophoneStatus,
} from '../../apps/reference-harness/microphone-sender.js';
import { parseMicrophoneRecord } from '../../apps/reference-harness/microphone-wire.js';
const status = (
  epoch = '1',
  revision = '1',
  granted = true,
  availability = 'ready',
) => ({
  granted,
  retiring: false,
  source: { enabled: true, availability, epoch, revision, timestampUs: '0' },
});
const packet = (timestampUs = 0n, epoch = 1n, byte = 11) => ({
  epoch,
  timestampUs,
  pcm: new Uint8Array(3840).fill(byte),
});
const ack = (sequence = 1, epoch = '1', result = 'accepted') => ({
  sequence,
  epoch,
  status: result,
});
function fixture(timeout = 2000, sequence = 0) {
  const records = [],
    calls = { revoked: 0 };
  const backend = {
    send(record) {
      records.push(record.slice(0));
      return true;
    },
    revoke() {
      ++calls.revoked;
    },
  };
  const sender = new MicrophoneSender(backend, timeout, sequence);
  return {
    sender,
    backend,
    records,
    calls,
    parsed: () => records.map(parseMicrophoneRecord),
  };
}

test('browser microphone status: exact scalar shape, canonical bounded u64 and native readiness without capture permission', () => {
  assert.deepEqual(
    parseMicrophoneStatus({ granted: false, retiring: true, source: null }),
    { granted: false, retiring: true, source: undefined },
  );
  assert.equal(parseMicrophoneStatus(status()).source.epoch, 1n);
  for (const patch of [
    { granted: 1 },
    { retiring: true },
    { secret: 'not echoed' },
    { source: null, extra: true },
  ])
    assert.throws(
      () => parseMicrophoneStatus({ ...status(), ...patch }),
      /^Error: Invalid microphone sender state$/,
    );
  for (const patch of [
    { enabled: false },
    { epoch: '0' },
    { epoch: '01' },
    { epoch: '-1' },
    { epoch: '18446744073709551616' },
    { revision: '0' },
    { timestampUs: '9'.repeat(10000) },
    { availability: 'unknown' },
    { extra: true },
  ])
    assert.throws(() =>
      parseMicrophoneStatus({
        ...status(),
        source: { ...status().source, ...patch },
      }),
    );
  assert.equal(
    parseMicrophoneStatus(status('0', '1', false, 'waiting')).source.epoch,
    0n,
  );
  const f = fixture();
  assert.equal(f.sender.authorize(0), undefined);
  f.sender.status(status('0', '1', false, 'waiting'), 1);
  assert.equal(f.sender.authorize(2), undefined);
  f.sender.close();
  assert.equal(f.calls.revoked, 1);
});

test('browser microphone sender: one flight and one copied latest slot, replacement discontinuity and ordinary continuity', () => {
  const f = fixture();
  f.sender.status(status(), 0);
  const token = f.sender.authorize(0);
  assert.equal(typeof token, 'symbol');
  assert.equal(f.sender.authorize(0), undefined);
  const first = packet();
  assert.equal(f.sender.offer(token, first, 1), true);
  first.pcm.fill(0);
  assert.equal(f.parsed()[0].pcm[0], 11);
  assert.equal(f.parsed()[0].discontinuity, true);
  assert.equal(f.sender.offer(token, packet(20000n, 1n, 12), 2), false);
  const latest = packet(40000n, 1n, 13);
  f.sender.offer(token, latest, 3);
  latest.pcm.fill(0);
  assert.equal(f.sender.stats.pendingBytes, 3840);
  assert.equal(f.sender.stats.replaced, 1);
  assert.equal(f.sender.acknowledge(ack(), 4), true);
  assert.equal(f.parsed()[1].timestampUs, 40000n);
  assert.equal(f.parsed()[1].pcm[0], 13);
  assert.equal(f.parsed()[1].discontinuity, true);
  f.sender.acknowledge(ack(2), 5);
  f.sender.offer(token, packet(60000n), 6);
  assert.equal(f.parsed()[2].discontinuity, false);
  f.sender.stats.sent = 99;
  assert.equal(f.sender.stats.sent, 3);
  assert.equal(f.sender.permission, undefined); // Capability and samples are private class fields.
  f.sender.close();
  assert.equal(f.sender.stats.pendingBytes, 0);
});

test('browser microphone sender: explicit no-write preserves only latest candidate, with absolute 120 ms unsent expiry', () => {
  const f = fixture();
  f.sender.status(status(), 0);
  const token = f.sender.authorize(0);
  f.backend.send = () => false;
  const input = packet();
  assert.equal(f.sender.offer(token, input, 1), false);
  input.pcm.fill(0);
  assert.equal(f.sender.stats.inFlight, false);
  assert.equal(f.sender.stats.pendingBytes, 3840);
  f.sender.poll(120);
  assert.equal(f.sender.stats.pendingBytes, 3840);
  f.sender.poll(121);
  assert.equal(f.sender.stats.pendingBytes, 0);
  f.backend.send = (record) => {
    f.records.push(record.slice(0));
    return true;
  };
  assert.equal(f.sender.poll(122), false);
  assert.equal(f.records.length, 0);
  f.sender.offer(token, packet(20000n), 123);
  assert.equal(f.parsed()[0].sequence, 1);
  assert.equal(f.parsed()[0].discontinuity, true);
  f.sender.close();
});

test('browser microphone sender: source epoch drops old pending bytes, preserves issued ACK and forces fresh discontinuity', () => {
  const f = fixture();
  f.sender.status(status(), 0);
  const token = f.sender.authorize(0);
  f.sender.offer(token, packet(), 1);
  f.sender.offer(token, packet(20000n), 2);
  f.sender.status(status('2', '2'), 3);
  assert.equal(f.sender.stats.pendingBytes, 0);
  assert.equal(f.sender.offer(token, packet(40000n, 1n), 4), false);
  f.sender.offer(token, packet(0n, 2n), 5);
  f.sender.acknowledge(ack(1, '1', 'stale'), 6);
  assert.equal(f.parsed()[1].epoch, 2n);
  assert.equal(f.parsed()[1].discontinuity, true);
  f.sender.status(status('2', '2', false), 7);
  assert.equal(f.calls.revoked, 1);
  assert.equal(f.sender.offer(token, packet(20000n, 2n), 8), false);
  f.sender.acknowledge(ack(2, '2'), 9);
  f.sender.status(status('2', '2', true), 10);
  const next = f.sender.authorize(10);
  assert.notEqual(next, token);
  assert.equal(f.sender.revoke(token), false);
  f.sender.close();
});

test('browser microphone sender: permission revoke cannot be bypassed by unrelated ready metadata or an old callback', () => {
  const f = fixture();
  f.sender.status(status(), 0);
  const token = f.sender.authorize(0);
  f.sender.offer(token, packet(), 1);
  f.sender.revoke(token);
  f.sender.acknowledge(ack(), 2);
  f.sender.status(status('1', '2'), 3);
  assert.equal(f.sender.authorize(4), undefined);
  f.sender.status(status('2', '3', false), 5);
  f.sender.status(status('2', '3', true), 6);
  const fresh = f.sender.authorize(7);
  assert.equal(typeof fresh, 'symbol');
  assert.equal(f.sender.offer(token, packet(0n, 2n), 8), false);
  assert.equal(f.sender.offer(fresh, packet(0n, 2n), 9), true);
  assert.equal(f.parsed()[1].sequence, 2);
  assert.equal(f.parsed()[1].discontinuity, true);
  f.sender.close();
});

test('browser microphone sender: refusal never replays sent samples and stale/unavailable waits for fresh source status', () => {
  for (const result of ['busy', 'invalid', 'stale', 'unavailable']) {
    const f = fixture();
    f.sender.status(status(), 0);
    const token = f.sender.authorize(0);
    f.sender.offer(token, packet(), 1);
    f.sender.offer(token, packet(20000n), 2);
    f.sender.acknowledge(ack(1, '1', result), 3);
    if (['stale', 'unavailable'].includes(result)) {
      assert.equal(f.records.length, 1);
      assert.equal(f.sender.stats.pendingBytes, 0);
      assert.equal(f.sender.offer(token, packet(40000n), 4), false);
      f.sender.status(status('1', '2'), 5);
      f.sender.offer(token, packet(60000n), 6);
    }
    assert.equal(f.parsed()[1].sequence, 2);
    assert.equal(f.parsed()[1].discontinuity, true);
    assert.notEqual(f.parsed()[1].timestampUs, 0n);
    assert.equal(f.sender.stats.refused, 1);
    f.sender.close();
  }
});

test('browser microphone sender: exact deadline, clock regression, malformed/replayed ACK/state/sample and sequence exhaustion close once', () => {
  for (const mode of [
    'deadline',
    'clock',
    'ack',
    'replay',
    'state',
    'sample',
    'sequence',
    'uncertain',
    'unknown-send',
  ]) {
    const f = fixture(25, mode === 'sequence' ? 0xffffffff : 0);
    f.sender.status(status(), 0);
    const token = f.sender.authorize(0);
    if (mode === 'uncertain')
      f.backend.send = () => {
        throw new Error('private transport diagnostic');
      };
    if (mode === 'unknown-send') f.backend.send = () => undefined;
    f.sender.offer(token, packet(), 1);
    if (mode === 'deadline') {
      f.sender.poll(25);
      assert.equal(f.sender.stats.closed, false);
      f.sender.poll(26);
    }
    if (mode === 'clock') f.sender.poll(0);
    if (mode === 'ack') f.sender.acknowledge(ack(2), 2);
    if (mode === 'replay') {
      f.sender.acknowledge(ack(), 2);
      f.sender.acknowledge(ack(), 3);
    }
    if (mode === 'state') f.sender.status(status('2', '1'), 2);
    if (mode === 'sample')
      f.sender.offer(
        token,
        { ...packet(20000n), pcm: new Uint8Array(3841) },
        2,
      );
    assert.equal(f.sender.stats.closed, true, mode);
    assert.equal(f.calls.revoked, 1);
    f.sender.close();
    assert.equal(f.calls.revoked, 1);
    assert.equal(f.sender.stats.pendingBytes, 0);
    assert.equal(f.sender.authorize(3), undefined);
  }
});

test('browser microphone sender: reentrant capture uses the free latest slot; revoke/close/state callbacks cannot resurrect stale samples', () => {
  for (const mode of ['capture', 'epoch', 'revoke', 'close', 'ack']) {
    const f = fixture();
    f.sender.status(status(), 0);
    const token = f.sender.authorize(0);
    f.backend.send = (record) => {
      f.records.push(record.slice(0));
      if (mode === 'capture') f.sender.offer(token, packet(20000n, 1n, 12), 2);
      if (mode === 'epoch') {
        f.sender.status(status('2', '2'), 2);
        f.sender.offer(token, packet(0n, 2n), 3);
      }
      if (mode === 'revoke') f.sender.revoke(token);
      if (mode === 'close') f.sender.close();
      if (mode === 'ack') f.sender.acknowledge(ack(), 2);
      return true;
    };
    f.sender.offer(token, packet(), 1);
    if (mode === 'capture' || mode === 'epoch') {
      assert.equal(f.sender.stats.pendingBytes, 3840);
      f.backend.send = (record) => {
        f.records.push(record.slice(0));
        return true;
      };
      f.sender.acknowledge(ack(), 4);
      assert.equal(f.records.length, 2);
      assert.equal(f.parsed()[1].epoch, mode === 'epoch' ? 2n : 1n);
    }
    if (mode === 'revoke') {
      f.sender.acknowledge(ack(), 4);
      assert.equal(f.sender.authorize(5), undefined);
    }
    if (mode === 'close' || mode === 'ack')
      assert.equal(f.sender.stats.closed, true);
    f.sender.close();
  }
});
