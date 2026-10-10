import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PcmPlaybackQueue } = await import(
  'data:text/javascript;base64,' +
    (await readFile('apps/reference-harness/pcm-queue.js')).toString('base64')
);

function packet(index = 0, left = -32768, right = 32767, epoch = 1n) {
  const pcm = new ArrayBuffer(3840),
    view = new DataView(pcm);
  for (let at = 0; at < 960; at++) {
    view.setInt16(at * 4, left, true);
    view.setInt16(at * 4 + 2, right, true);
  }
  return {
    epoch,
    timestampUs: BigInt(index) * 20000n,
    discontinuity: index === 0,
    pcm,
  };
}
function render(queue, frames = 128) {
  const left = new Float32Array(frames),
    right = new Float32Array(frames);
  left.fill(77);
  right.fill(77);
  assert.equal(queue.render(left, right), true);
  return { left, right };
}
test('PCM playback: 40 ms prebuffer, signed stereo extremes and variable render quantum', () => {
  const queue = new PcmPlaybackQueue();
  assert.equal(queue.configure(1n), true);
  assert.equal(queue.push(packet()), true);
  assert.deepEqual(Array.from(render(queue).left), Array(128).fill(0));
  assert.equal(queue.stats().queuedFrames, 960);
  assert.equal(queue.push(packet(1)), true);
  const first = render(queue, 1);
  assert.equal(first.left[0], -1);
  assert.equal(first.right[0], 32767 / 32768);
  const rest = render(queue, 1919);
  assert.ok(rest.left.every((value) => value === -1));
  assert.ok(rest.right.every((value) => value === 32767 / 32768));
  const silence = render(queue, 257);
  assert.ok(silence.left.every((value) => value === 0));
  assert.equal(queue.stats().underflowFrames, 257);
  assert.equal(queue.stats().bufferingSilenceFrames, 128);
  assert.equal(queue.stats().playedFrames, 1920);
  assert.equal(queue.stats().underflows, 1);
});
test('PCM playback: overflow skips old complete intervals and preserves newest bounded FIFO', () => {
  const queue = new PcmPlaybackQueue();
  queue.configure(1n);
  for (let at = 0; at < 7; at++)
    assert.equal(queue.push(packet(at, at, -at)), true);
  assert.equal(queue.stats().queuedFrames, 5760);
  assert.equal(queue.stats().overflowSkippedFrames, 960);
  assert.equal(queue.stats().highWaterFrames, 5760);
  for (let expected = 1; expected < 7; expected++) {
    const output = render(queue, 960);
    assert.ok(output.left.every((value) => value === expected / 32768));
    assert.ok(output.right.every((value) => value === -expected / 32768));
  }
  assert.equal(queue.stats().queuedFrames, 0);
});
test('PCM playback: discontinuity and configuration discard old samples while counters survive', () => {
  const queue = new PcmPlaybackQueue();
  queue.configure(1n);
  queue.push(packet());
  queue.push(packet(1));
  render(queue, 128);
  assert.equal(
    queue.push({ ...packet(10, 123, -123), discontinuity: true }),
    true,
  );
  assert.equal(queue.stats().resetDiscardedFrames, 1792);
  assert.equal(queue.stats().queuedFrames, 960);
  assert.equal(queue.configure(2n), true);
  assert.equal(queue.stats().resetDiscardedFrames, 2752);
  assert.equal(queue.push(packet(0, 10, 20, 1n)), false);
  assert.equal(queue.push(packet(0, 10, 20, 2n)), true);
  assert.equal(queue.push(packet(1, 10, 20, 2n)), true);
  assert.equal(render(queue, 1).left[0], 10 / 32768);
  queue.disable();
  assert.equal(queue.stats().queuedFrames, 0);
  assert.equal(queue.push(packet(2, 10, 20, 2n)), false);
  assert.equal(queue.stats().configurations, 2);
});
test('PCM playback: invalid epoch clock shape and quantum are atomic refusals', () => {
  const queue = new PcmPlaybackQueue();
  queue.configure(1n);
  queue.push(packet());
  queue.push(packet(1));
  for (const value of [0n, -1n, 1, 1n << 64n])
    assert.equal(queue.configure(value), false);
  for (const bad of [
    undefined,
    { ...packet(2), pcm: new ArrayBuffer(3841) },
    { ...packet(2), pcm: new Uint8Array(3840) },
    { ...packet(2), epoch: 2n },
    { ...packet(2), timestampUs: 1 },
    { ...packet(2), timestampUs: 20000n },
    { ...packet(2), timestampUs: 60000n },
    { ...packet(2), discontinuity: 1 },
    { ...packet(2), timestampUs: (1n << 64n) - 1n },
  ])
    assert.equal(queue.push(bad), false);
  assert.equal(queue.render(new Float32Array(1), new Float32Array(2)), false);
  assert.equal(
    queue.render(new Float32Array(4801), new Float32Array(4801)),
    false,
  );
  assert.equal(queue.stats().queuedFrames, 1920);
  assert.equal(render(queue, 1).left[0], -1);
});
test('PCM playback: wrapped render and insertion retain independent packet sample values', () => {
  const queue = new PcmPlaybackQueue();
  queue.configure(1n);
  for (let at = 0; at < 6; at++) queue.push(packet(at, at + 1, -(at + 1)));
  for (let at = 0; at < 5; at++)
    assert.equal(render(queue, 960).left[0], (at + 1) / 32768);
  for (let at = 6; at < 11; at++)
    assert.equal(queue.push(packet(at, at + 1, -(at + 1))), true);
  for (let at = 5; at < 11; at++) {
    const output = render(queue, 960);
    assert.ok(output.left.every((value) => value === (at + 1) / 32768));
    assert.ok(output.right.every((value) => value === -(at + 1) / 32768));
  }
  assert.equal(queue.stats().overflowSkippedFrames, 0);
  assert.equal(queue.stats().playedFrames, 10560);
});
