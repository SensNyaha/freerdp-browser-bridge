const MAX_EPOCH = 0xffffffffffffffffn;
const SAMPLE_FRAMES = 960;
const AGE_FRAMES = 5760;
const ACK_FRAMES = 96000;
const validFrame = (frame) =>
  Number.isSafeInteger(frame) &&
  frame >= 0 &&
  frame <= Number.MAX_SAFE_INTEGER - ACK_FRAMES;
const signed = (value) =>
  Math.round(Math.max(-1, Math.min(1, value)) * (value < 0 ? 32768 : 32767));

/** Fixed 48 kHz capture packetizer. No device, permission, resampler or timer. */
export class MicrophoneCapture {
  #post;
  #collector = new Uint8Array(3840);
  #view = new DataView(this.#collector.buffer);
  #latest = new Uint8Array(3840);
  #pending;
  #flight;
  #epoch;
  #lastEpoch = 0n;
  #sequence = 0;
  #collected = 0;
  #start;
  #expected;
  #observed;
  #closed = false;
  #busy = false;
  #counts = {
    packets: 0,
    replaced: 0,
    expired: 0,
    discardedFrames: 0,
    faults: 0,
  };
  constructor(post) {
    if (typeof post !== 'function')
      throw new Error('Invalid microphone capture');
    this.#post = post;
  }
  get stats() {
    return {
      ...this.#counts,
      closed: this.#closed,
      collectedFrames: this.#collected,
      pendingBytes: this.#pending ? 3840 : 0,
      inFlight: Boolean(this.#flight),
    };
  }
  #count(key, value = 1) {
    this.#counts[key] = Math.min(
      Number.MAX_SAFE_INTEGER,
      this.#counts[key] + value,
    );
  }
  #clear() {
    this.#count('discardedFrames', this.#collected + (this.#pending ? 960 : 0));
    this.#collected = 0;
    this.#pending = undefined;
    this.#start = undefined;
    this.#collector.fill(0);
    this.#latest.fill(0);
  }
  close() {
    if (this.#closed) return;
    this.#closed = true;
    this.#epoch = undefined;
    this.#flight = undefined;
    this.#clear();
  }
  #fault() {
    if (!this.#closed) this.#count('faults');
    this.close();
    return false;
  }
  #clock(frame) {
    if (this.#closed) return false;
    if (
      !validFrame(frame) ||
      (this.#observed !== undefined && frame < this.#observed)
    )
      return this.#fault();
    this.#observed = frame;
    if (this.#flight && frame >= this.#flight.deadline) return this.#fault();
    if (this.#pending && frame >= this.#pending.start + AGE_FRAMES) {
      this.#count('expired');
      this.#pending = undefined;
      this.#latest.fill(0);
    }
    return true;
  }
  configure(epoch, frame) {
    if (!this.#clock(frame)) return false;
    if (this.#busy) return this.#fault();
    if (
      typeof epoch !== 'bigint' ||
      epoch <= this.#lastEpoch ||
      epoch > MAX_EPOCH
    )
      return this.#fault();
    this.#clear();
    this.#lastEpoch = epoch;
    this.#epoch = epoch;
    this.#expected = undefined;
    return true;
  }
  pause(frame) {
    if (!this.#clock(frame)) return false;
    if (this.#busy) return this.#fault();
    this.#clear();
    this.#epoch = undefined;
    this.#expected = undefined;
    return true;
  }
  acknowledge(id, frame) {
    if (!this.#clock(frame)) return false;
    if (
      this.#busy ||
      !Number.isInteger(id) ||
      !this.#flight ||
      id !== this.#flight.id
    )
      return this.#fault();
    this.#flight = undefined;
    return this.#flush(frame);
  }
  poll(frame) {
    return this.#clock(frame) && this.#flush(frame);
  }
  #flush(frame) {
    if (
      this.#closed ||
      this.#flight ||
      !this.#pending ||
      !this.#epoch ||
      this.#busy
    )
      return !this.#closed;
    if (this.#sequence === 0xffffffff) return this.#fault();
    const pending = this.#pending;
    const pcm = this.#latest.slice().buffer;
    const packet = {
      id: this.#sequence + 1,
      epoch: pending.epoch,
      timestampUs: (BigInt(pending.start) * 1000000n) / 48000n,
      pcm,
    };
    this.#pending = undefined;
    this.#latest.fill(0);
    this.#flight = { id: packet.id, deadline: frame + ACK_FRAMES };
    this.#busy = true;
    try {
      this.#post(packet); // MessagePort host must transfer/consume this one packet synchronously.
      this.#sequence = packet.id;
      this.#count('packets');
      return !this.#closed;
    } catch {
      return this.#fault();
    } finally {
      this.#busy = false;
    }
  }
  render(channels, frame) {
    if (!this.#clock(frame)) return false;
    if (this.#busy || !Array.isArray(channels) || channels.length > 2)
      return this.#fault();
    if (!this.#epoch) return true;
    if (channels.length === 0) {
      this.#clear();
      this.#expected = undefined;
      return true;
    }
    const left = channels[0],
      right = channels[1] ?? left;
    if (
      !(left instanceof Float32Array) ||
      !(right instanceof Float32Array) ||
      left.length < 1 ||
      left.length > 2048 ||
      left.length !== right.length ||
      !validFrame(frame + left.length)
    )
      return this.#fault();
    // Validate the entire bounded quantum before admitting any sample.
    for (let at = 0; at < left.length; ++at)
      if (!Number.isFinite(left[at]) || !Number.isFinite(right[at]))
        return this.#fault();
    if (this.#expected !== undefined && frame !== this.#expected) {
      if (frame < this.#expected) return this.#fault();
      this.#clear();
    }
    this.#expected = frame + left.length;
    for (let at = 0; at < left.length; ++at) {
      if (this.#collected === 0) this.#start = frame + at;
      const offset = this.#collected * 4;
      this.#view.setInt16(offset, signed(left[at]), true);
      this.#view.setInt16(offset + 2, signed(right[at]), true);
      if (++this.#collected !== SAMPLE_FRAMES) continue;
      if (this.#pending) this.#count('replaced');
      this.#latest.set(this.#collector);
      this.#pending = { epoch: this.#epoch, start: this.#start };
      this.#collected = 0;
      this.#collector.fill(0);
      if (!this.#flush(frame + at + 1)) return false;
    }
    this.#observed = frame + left.length;
    return true;
  }
}
