const FRAMES = 960;
const CAPACITY = 5760;
const START_FRAMES = 1920;
const MAX_COUNTER = Number.MAX_SAFE_INTEGER;
const MAX_TIMESTAMP = 0xffffffffffffffffn - 20000n;
function add(stats, field, amount) {
  stats[field] = Math.min(MAX_COUNTER, stats[field] + amount);
}
// Isolated 48 kHz stereo consumer; no WebSocket/MessagePort queue is owned here.
export class PcmPlaybackQueue {
  constructor() {
    this.samples = new Int16Array(CAPACITY * 2);
    this.head = this.frames = 0;
    this.buffering = true;
    this.epoch = this.timestamp = undefined;
    this.counters = {
      configurations: 0,
      packets: 0,
      playedFrames: 0,
      underflowFrames: 0,
      underflows: 0,
      bufferingSilenceFrames: 0,
      overflowSkippedFrames: 0,
      resetDiscardedFrames: 0,
      invalidCalls: 0,
      highWaterFrames: 0,
    };
  }
  clear() {
    add(this.counters, 'resetDiscardedFrames', this.frames);
    this.head = this.frames = 0;
    this.buffering = true;
    this.samples.fill(0);
  }
  disable() {
    this.clear();
    this.epoch = this.timestamp = undefined;
  }
  configure(epoch) {
    if (
      typeof epoch !== 'bigint' ||
      epoch < 1n ||
      epoch > 0xffffffffffffffffn ||
      (this.epoch !== undefined && epoch < this.epoch)
    ) {
      add(this.counters, 'invalidCalls', 1);
      return false;
    }
    this.clear();
    this.epoch = epoch;
    this.timestamp = undefined;
    add(this.counters, 'configurations', 1);
    return true;
  }
  push(packet) {
    if (
      !packet ||
      this.epoch === undefined ||
      packet.epoch !== this.epoch ||
      typeof packet.timestampUs !== 'bigint' ||
      packet.timestampUs < 0n ||
      packet.timestampUs > MAX_TIMESTAMP ||
      typeof packet.discontinuity !== 'boolean' ||
      !(packet.pcm instanceof ArrayBuffer) ||
      packet.pcm.byteLength !== FRAMES * 4 ||
      (this.timestamp !== undefined &&
        (packet.timestampUs <= this.timestamp ||
          (!packet.discontinuity &&
            packet.timestampUs !== this.timestamp + 20000n)))
    ) {
      add(this.counters, 'invalidCalls', 1);
      return false;
    }
    if (packet.discontinuity) this.clear();
    if (this.frames + FRAMES > CAPACITY) {
      const skipped = Math.min(
        this.frames,
        Math.ceil((this.frames + FRAMES - CAPACITY) / FRAMES) * FRAMES,
      );
      this.head = (this.head + skipped) % CAPACITY;
      this.frames -= skipped;
      this.buffering = true;
      add(this.counters, 'overflowSkippedFrames', skipped);
    }
    const view = new DataView(packet.pcm);
    const tail = (this.head + this.frames) % CAPACITY;
    for (let at = 0; at < FRAMES; at++) {
      const target = ((tail + at) % CAPACITY) * 2;
      this.samples[target] = view.getInt16(at * 4, true);
      this.samples[target + 1] = view.getInt16(at * 4 + 2, true);
    }
    this.frames += FRAMES;
    this.timestamp = packet.timestampUs;
    add(this.counters, 'packets', 1);
    this.counters.highWaterFrames = Math.max(
      this.counters.highWaterFrames,
      this.frames,
    );
    return true;
  }
  render(left, right) {
    if (
      !(left instanceof Float32Array) ||
      !(right instanceof Float32Array) ||
      left.length !== right.length ||
      left.length < 1 ||
      left.length > 4800
    ) {
      add(this.counters, 'invalidCalls', 1);
      return false;
    }
    left.fill(0);
    right.fill(0);
    if (this.buffering && this.frames < START_FRAMES) {
      add(this.counters, 'bufferingSilenceFrames', left.length);
      return true;
    }
    this.buffering = false;
    const count = Math.min(this.frames, left.length);
    for (let at = 0; at < count; at++) {
      const source = ((this.head + at) % CAPACITY) * 2;
      left[at] = this.samples[source] / 32768;
      right[at] = this.samples[source + 1] / 32768;
    }
    this.head = (this.head + count) % CAPACITY;
    this.frames -= count;
    add(this.counters, 'playedFrames', count);
    if (count < left.length) {
      add(this.counters, 'underflowFrames', left.length - count);
      add(this.counters, 'underflows', 1);
      this.buffering = true;
    }
    return true;
  }
  stats() {
    return {
      ...this.counters,
      queuedFrames: this.frames,
      buffering: this.buffering,
    };
  }
}
