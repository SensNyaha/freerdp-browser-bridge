const CONFIG = {
  codec: 'opus',
  sampleRate: 48000,
  numberOfChannels: 2,
  bitrate: 64000,
  opus: { frameDuration: 20000, complexity: 5 },
};
const CONFIGS = [1, 5, 9, 13, 15, 19, 23, 27, 31];
const MAX_PTS = BigInt(Number.MAX_SAFE_INTEGER - 20000);
const invalid = () => new Error('Invalid microphone Opus input');
const browserApi = {
  encoder: (callbacks) => new AudioEncoder(callbacks),
  data: (options) => new AudioData(options),
};

/** Isolated codec owner. No device/permission/socket; caller owns epoch and network credit. */
export class MicrophoneOpusEncoder {
  #epoch;
  #backend;
  #api;
  #now;
  #observed;
  #codec;
  #generation = 0;
  #flight;
  #lastPts;
  #lookahead;
  #encoding = false;
  #closed = false;
  #failed = false;
  #timer;
  #samples = new Float32Array(1920);
  #bytes = new Uint8Array(1275);
  #counts = { inputs: 0, encoded: 0, delivered: 0, faults: 0 };
  constructor(epoch, backend, api = browserApi, now = () => performance.now()) {
    if (
      typeof epoch !== 'bigint' ||
      epoch <= 0n ||
      epoch > 0xffffffffffffffffn ||
      !backend ||
      ['authorized', 'receive', 'failed'].some(
        (key) => typeof backend[key] !== 'function',
      ) ||
      !api ||
      typeof api.encoder !== 'function' ||
      typeof api.data !== 'function' ||
      typeof now !== 'function'
    )
      throw invalid();
    this.#epoch = epoch;
    this.#backend = backend;
    this.#api = api;
    this.#now = now;
    try {
      this.#create();
    } catch {
      this.#fault();
    }
    if (!this.#closed) this.#timer = setInterval(() => this.poll(), 20);
  }
  get stats() {
    return {
      ...this.#counts,
      closed: this.#closed,
      failed: this.#failed,
      inFlight: Boolean(this.#flight),
      lookaheadFrames: this.#lookahead,
    };
  }
  #count(key) {
    this.#counts[key] = Math.min(
      Number.MAX_SAFE_INTEGER,
      this.#counts[key] + 1,
    );
  }
  #clock() {
    const now = this.#now();
    if (
      !Number.isFinite(now) ||
      now < 0 ||
      now > Number.MAX_SAFE_INTEGER - 2000 ||
      (this.#observed !== undefined && now < this.#observed) ||
      (this.#flight && now >= this.#flight.deadline)
    )
      throw invalid();
    this.#observed = now;
    return now;
  }
  #create() {
    if (this.#generation === Number.MAX_SAFE_INTEGER) throw invalid();
    const generation = ++this.#generation;
    const old = this.#codec;
    this.#codec = undefined;
    if (old && old.state !== 'closed') old.close();
    const codec = this.#api.encoder({
      output: (chunk, metadata) => this.#output(generation, chunk, metadata),
      error: () => {
        if (!this.#closed && generation === this.#generation) this.#fault();
      },
    });
    if (this.#closed || generation !== this.#generation) {
      codec.close();
      return;
    }
    this.#codec = codec;
    codec.configure({ ...CONFIG, opus: { ...CONFIG.opus } });
    if (codec.state !== 'configured') throw invalid();
    this.#lookahead = undefined;
  }
  #description(metadata) {
    const config = metadata?.decoderConfig;
    if (!config) {
      if (this.#lookahead === undefined) throw invalid();
      return;
    }
    if (
      config.codec !== 'opus' ||
      config.sampleRate !== 48000 ||
      config.numberOfChannels !== 2
    )
      throw invalid();
    const buffer = config.description;
    let bytes;
    if (buffer instanceof ArrayBuffer) bytes = new Uint8Array(buffer);
    else if (ArrayBuffer.isView(buffer) && buffer.buffer instanceof ArrayBuffer)
      bytes = new Uint8Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength,
      );
    if (
      !bytes ||
      bytes.length !== 19 ||
      [79, 112, 117, 115, 72, 101, 97, 100, 1, 2].some(
        (byte, index) => bytes[index] !== byte,
      ) ||
      bytes[16] !== 0 ||
      bytes[17] !== 0 ||
      bytes[18] !== 0
    )
      throw invalid();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      delay = view.getUint16(10, true);
    if (
      delay > 960 ||
      view.getUint32(12, true) !== 48000 ||
      (this.#lookahead !== undefined && this.#lookahead !== delay)
    )
      throw invalid();
    this.#lookahead = delay;
  }
  #output(generation, chunk, metadata) {
    if (this.#closed || generation !== this.#generation) return;
    try {
      this.#clock();
      if (this.#backend.authorized(this.#epoch) !== true) {
        this.close();
        return;
      }
      const flight = this.#flight;
      if (
        this.#encoding ||
        !flight ||
        chunk.timestamp !== Number(flight.pts) ||
        (chunk.duration !== undefined && chunk.duration !== 20000) ||
        !Number.isInteger(chunk.byteLength) ||
        chunk.byteLength < 2 ||
        chunk.byteLength > 1275
      )
        throw invalid();
      this.#description(metadata);
      const bytes = this.#bytes.subarray(0, chunk.byteLength);
      chunk.copyTo(bytes);
      if (
        this.#closed ||
        generation !== this.#generation ||
        this.#flight !== flight
      )
        return;
      if ((bytes[0] & 7) !== 4 || !CONFIGS.includes(bytes[0] >>> 3))
        throw invalid();
      this.#count('encoded');
      const accepted = this.#backend.receive({
        epoch: this.#epoch,
        timestampUs: flight.pts,
        discontinuity: flight.discontinuity,
        lookaheadFrames: this.#lookahead,
        encoded: bytes,
      });
      if (accepted !== true) throw invalid();
      this.#count('delivered');
      this.#flight = undefined;
      if (!this.#closed && this.#backend.authorized(this.#epoch) !== true)
        this.close();
    } catch {
      this.#fault();
    } finally {
      this.#bytes.fill(0);
    }
  }
  encode(packet) {
    if (this.#closed || this.#flight || this.#encoding) return false;
    let data;
    try {
      const now = this.#clock();
      if (this.#backend.authorized(this.#epoch) !== true) {
        this.close();
        return false;
      }
      if (
        !packet ||
        packet.epoch !== this.#epoch ||
        typeof packet.timestampUs !== 'bigint' ||
        packet.timestampUs < 0n ||
        packet.timestampUs > MAX_PTS ||
        typeof packet.discontinuity !== 'boolean' ||
        !(packet.pcm instanceof Uint8Array) ||
        packet.pcm.byteLength !== 3840 ||
        !(packet.pcm.buffer instanceof ArrayBuffer) ||
        (this.#lastPts === undefined && !packet.discontinuity) ||
        (this.#lastPts !== undefined &&
          (packet.timestampUs <= this.#lastPts ||
            (!packet.discontinuity &&
              packet.timestampUs !== this.#lastPts + 20000n)))
      )
        throw invalid();
      if (packet.discontinuity && this.#lastPts !== undefined) this.#create();
      if (this.#closed) return false;
      this.#flight = {
        pts: packet.timestampUs,
        discontinuity: packet.discontinuity,
        deadline: now + 2000,
      };
      const view = new DataView(
        packet.pcm.buffer,
        packet.pcm.byteOffset,
        packet.pcm.byteLength,
      );
      for (let frame = 0; frame < 960; ++frame) {
        this.#samples[frame] = view.getInt16(frame * 4, true) / 32768;
        this.#samples[960 + frame] = view.getInt16(frame * 4 + 2, true) / 32768;
      }
      this.#encoding = true;
      data = this.#api.data({
        format: 'f32-planar',
        sampleRate: 48000,
        numberOfFrames: 960,
        numberOfChannels: 2,
        timestamp: Number(packet.timestampUs),
        data: this.#samples,
      });
      this.#samples.fill(0);
      if (this.#closed) return false;
      this.#codec.encode(data);
      if (this.#closed) return false;
      this.#lastPts = packet.timestampUs;
      this.#count('inputs');
    } catch {
      this.#fault();
      return false;
    } finally {
      this.#encoding = false;
      this.#samples.fill(0);
      try {
        data?.close();
      } catch {
        this.#fault();
      }
    }
    return !this.#closed;
  }
  poll() {
    if (this.#closed) return false;
    try {
      this.#clock();
      if (this.#backend.authorized(this.#epoch) !== true) this.close();
      return !this.#closed;
    } catch {
      this.#fault();
      return false;
    }
  }
  #fault() {
    if (this.#failed) return;
    this.#failed = true;
    this.#count('faults');
    this.close();
    try {
      this.#backend.failed();
    } catch {
      /* Enclosing owner still controls capture/socket cleanup. */
    }
  }
  close() {
    if (this.#closed) return;
    this.#closed = true;
    clearInterval(this.#timer);
    this.#generation++;
    this.#flight = undefined;
    const codec = this.#codec;
    this.#codec = undefined;
    this.#samples.fill(0);
    this.#bytes.fill(0);
    try {
      if (codec && codec.state !== 'closed') codec.close();
    } catch {
      this.#fault();
    }
  }
}
