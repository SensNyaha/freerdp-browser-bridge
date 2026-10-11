import test from 'node:test';
import assert from 'node:assert/strict';
import { MicrophoneCapture } from '../../apps/reference-harness/microphone-capture.js';

const channels = (frames = 128, left = -1, right = 1) => [
  new Float32Array(frames).fill(left),
  new Float32Array(frames).fill(right),
];
function fixture() {
  const packets = [];
  const capture = new MicrophoneCapture((packet) =>
    packets.push({ ...packet, pcm: packet.pcm.slice(0) }),
  );
  assert.equal(capture.configure(1n, 0), true);
  return { capture, packets };
}
function audio(capture, start, frames, left = -1, right = 1) {
  for (let at = 0; at < frames; at += 128)
    assert.equal(
      capture.render(
        channels(Math.min(128, frames - at), left, right),
        start + at,
      ),
      true,
    );
}
const sample = (packet, at, side = 0) =>
  new DataView(packet.pcm).getInt16(at * 4 + side * 2, true);

test('microphone capture: exact 960-frame stereo packets across quanta, clipped S16LE and no mutation of caller input', () => {
  const { capture, packets } = fixture();
  const source = channels(128, -2, 2);
  capture.render(source, 0);
  assert.ok(source[0].every((value) => value === -2));
  audio(capture, 128, 832, -2, 2);
  assert.equal(packets.length, 1);
  assert.equal(packets[0].epoch, 1n);
  assert.equal(packets[0].timestampUs, 0n);
  for (let at = 0; at < 960; ++at) {
    assert.equal(sample(packets[0], at), -32768);
    assert.equal(sample(packets[0], at, 1), 32767);
  }
  capture.acknowledge(1, 960);
  audio(capture, 960, 960, -0.5, 0.5);
  assert.equal(packets[1].timestampUs, 20000n);
  assert.equal(sample(packets[1], 0), -16384);
  assert.equal(sample(packets[1], 0, 1), 16384);
  capture.stats.packets = 99;
  assert.equal(capture.stats.packets, 2);
  capture.close();
});

test('microphone capture: mono duplicates and rational frame timestamps do not accumulate rounding drift', () => {
  const packets = [];
  const capture = new MicrophoneCapture((packet) => packets.push(packet));
  capture.configure(7n, 1);
  for (let at = 0; at < 10; ++at) {
    const start = 1 + at * 960;
    capture.render([new Float32Array(960).fill(0.25)], start);
    const packet = packets[at];
    assert.equal(packet.timestampUs, (BigInt(start) * 1000000n) / 48000n);
    assert.equal(sample(packet, 959), 8192);
    assert.equal(sample(packet, 959, 1), 8192);
    capture.acknowledge(packet.id, start + 960);
  }
  assert.equal(packets[9].timestampUs, 180020n);
  capture.close();
});

test('microphone capture: held credit stores only latest full block and an incomplete collector, with absolute 120 ms expiry', () => {
  const { capture, packets } = fixture();
  audio(capture, 0, 960, 0.1, -0.1);
  for (let at = 1; at < 5; ++at)
    audio(capture, at * 960, 960, at / 10, -at / 10);
  assert.equal(packets.length, 1);
  assert.equal(capture.stats.pendingBytes, 3840);
  assert.equal(capture.stats.replaced, 3);
  capture.acknowledge(1, 4800);
  assert.equal(packets.length, 2);
  assert.equal(packets[1].timestampUs, 80000n);
  assert.equal(
    sample(packets[1], 0),
    Math.round(new Float32Array([0.4])[0] * 32767),
  );
  audio(capture, 4800, 960);
  capture.poll(10559);
  assert.equal(capture.stats.pendingBytes, 3840);
  capture.poll(10560);
  assert.equal(capture.stats.pendingBytes, 0);
  assert.equal(capture.stats.expired, 1);
  capture.acknowledge(2, 10560);
  assert.equal(packets.length, 2);
  capture.close();
});

test('microphone capture: gaps and empty input wipe partial/latest bytes; a new epoch preserves only old issued credit', () => {
  const { capture, packets } = fixture();
  audio(capture, 0, 960);
  audio(capture, 960, 100, 0.5, -0.5);
  audio(capture, 2000, 960, 0.25, -0.25);
  assert.equal(capture.stats.discardedFrames, 100);
  capture.render([], 2960);
  assert.equal(capture.stats.pendingBytes, 0);
  assert.equal(capture.configure(2n, 2960), true);
  audio(capture, 3000, 960, 0.75, -0.75);
  assert.equal(packets.length, 1);
  capture.acknowledge(1, 3960);
  assert.equal(packets[1].epoch, 2n);
  assert.equal(packets[1].timestampUs, 62500n);
  assert.equal(sample(packets[1], 0), 24575);
  capture.pause(3960);
  audio(capture, 3960, 960);
  assert.equal(packets.length, 2);
  capture.acknowledge(2, 4920);
  assert.equal(capture.configure(3n, 4920), true);
  audio(capture, 4920, 960);
  assert.equal(packets[2].epoch, 3n);
  capture.close();
});

test('microphone capture: malformed quantum/epoch/ACK and regressing/overlapping clocks fail closed without partial admission', () => {
  for (const bad of [
    [],
    [new Float32Array(0)],
    channels(2049),
    [new Float32Array(1), new Float32Array(2)],
    [new Float64Array(1)],
    channels(128, NaN),
    channels(128, Infinity),
    [...channels(), new Float32Array(128)],
  ]) {
    if (bad.length === 0) continue; // No connected input is a valid pause, not a fabricated packet.
    const f = fixture();
    audio(f.capture, 0, 960);
    assert.equal(f.capture.render(bad, 960), false);
    assert.equal(f.packets.length, 1);
    assert.equal(f.capture.stats.closed, true);
    assert.equal(f.capture.stats.pendingBytes, 0);
    assert.equal(f.capture.stats.collectedFrames, 0);
  }
  for (const mode of [
    'epoch0',
    'epochReplay',
    'epochOverflow',
    'wrongAck',
    'duplicateAck',
    'backward',
    'overlap',
    'unsafe',
  ]) {
    const f = fixture();
    audio(f.capture, 0, 960);
    if (mode === 'epoch0') f.capture.configure(0n, 960);
    if (mode === 'epochReplay') f.capture.configure(1n, 960);
    if (mode === 'epochOverflow') f.capture.configure(1n << 64n, 960);
    if (mode === 'wrongAck') f.capture.acknowledge(2, 960);
    if (mode === 'duplicateAck') {
      f.capture.acknowledge(1, 960);
      f.capture.acknowledge(1, 960);
    }
    if (mode === 'backward') f.capture.poll(959);
    if (mode === 'overlap') f.capture.render(channels(), 959);
    if (mode === 'unsafe') f.capture.poll(Number.MAX_SAFE_INTEGER);
    assert.equal(f.capture.stats.closed, true, mode);
    assert.equal(f.capture.stats.faults, 1, mode);
    f.capture.close();
    assert.equal(f.capture.stats.faults, 1);
  }
});

test('microphone capture: exact issued deadline and throwing/reentrant post cannot retain samples or resurrect capture', () => {
  const f = fixture();
  audio(f.capture, 0, 960);
  assert.equal(f.capture.poll(96959), true);
  assert.equal(f.capture.poll(96960), false);
  for (const mode of ['throw', 'ack', 'config', 'render', 'close']) {
    let capture;
    capture = new MicrophoneCapture((packet) => {
      if (mode === 'throw') throw new Error('not exposed');
      if (mode === 'ack') capture.acknowledge(packet.id, 960);
      if (mode === 'config') capture.configure(2n, 960);
      if (mode === 'render') capture.render(channels(), 960);
      if (mode === 'close') capture.close();
    });
    capture.configure(1n, 0);
    assert.equal(capture.render(channels(960), 0), false, mode);
    assert.equal(capture.stats.closed, true, mode);
    assert.equal(capture.stats.pendingBytes, 0, mode);
    assert.equal(capture.stats.collectedFrames, 0, mode);
    assert.equal(capture.configure(3n, 1000), false, mode);
  }
});
