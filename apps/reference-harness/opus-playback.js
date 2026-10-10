import { parseOpusAudioRecord } from './opus-wire.js';
import { createPcmPlayback } from './pcm-playback.js';

export const OPUS_DECODER_CONFIG = Object.freeze({
  codec: 'opus',
  sampleRate: 48000,
  numberOfChannels: 2,
});
const invalid = () => new Error('Invalid Opus playback');

function metadata(bytes, type) {
  const copy = bytes.slice(0),
    view = new DataView(copy);
  if (type === 'state' && view.getUint8(30)) {
    view.setUint8(56, 2);
    view.setUint8(58, 1);
  } else if (type === 'config') {
    view.setUint8(29, 2);
    view.setUint8(31, 1);
    view.setUint16(38, 0);
  }
  return copy;
}

/** One decode/admission credit; sink owns the bounded PCM Worklet and context. */
export class OpusPlayback {
  constructor(
    sink,
    {
      timeoutMs = 2000,
      onRecordAck,
      onFailure,
      decoderFactory = (callbacks) => new AudioDecoder(callbacks),
      chunkFactory = (init) => new EncodedAudioChunk(init),
    } = {},
  ) {
    if (
      !sink ||
      typeof sink.record !== 'function' ||
      typeof sink.close !== 'function' ||
      typeof onRecordAck !== 'function' ||
      typeof decoderFactory !== 'function' ||
      typeof chunkFactory !== 'function' ||
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 10 ||
      timeoutMs > 5000
    )
      throw invalid();
    this.sink = sink;
    this.timeoutMs = timeoutMs;
    this.onRecordAck = onRecordAck;
    this.onFailure = onFailure;
    this.decoderFactory = decoderFactory;
    this.chunkFactory = chunkFactory;
    this.sequence = this.generation = this.decoded = 0;
    this.closed = false;
    this.boundary = true;
  }
  retireDecoder() {
    this.generation++;
    const decoder = this.decoder;
    this.decoder = undefined;
    if (decoder && decoder.state !== 'closed') decoder.close();
  }
  configureDecoder() {
    this.retireDecoder();
    const generation = this.generation;
    this.decoder = this.decoderFactory({
      output: (data) => this.output(data, generation),
      error: () => {
        if (!this.closed && generation === this.generation)
          this.fail('decoder');
      },
    });
    this.decoder.configure(OPUS_DECODER_CONFIG);
  }
  record(bytes) {
    if (this.closed) return false;
    try {
      const record = parseOpusAudioRecord(bytes);
      if (
        this.flight ||
        record.sequence !== this.sequence ||
        this.sequence > 0xffffffff
      )
        throw invalid();
      if (record.type === 'state') {
        const previous = this.source;
        if (
          (previous &&
            (record.revision <= previous.revision ||
              record.epoch < previous.epoch ||
              record.timestampUs < previous.timestampUs ||
              record.enabled !== previous.enabled)) ||
          (this.epoch !== undefined && record.epoch < this.epoch)
        )
          throw invalid();
        this.retireDecoder();
        this.source = record;
        this.awaitingConfig = this.boundary = true;
      } else if (record.type === 'config') {
        if (
          !this.source?.enabled ||
          this.source.availability !== 'ready' ||
          record.epoch !== this.source.epoch ||
          (this.epoch !== undefined && record.epoch < this.epoch) ||
          (this.timestamp !== undefined && record.timestampUs < this.timestamp)
        )
          throw invalid();
        this.configureDecoder();
        this.epoch = record.epoch;
        this.configTimestamp = record.timestampUs;
        this.lookaheadFrames = record.lookaheadFrames;
        this.awaitingConfig = false;
        this.boundary = true;
      } else {
        if (
          !this.source?.enabled ||
          this.source.availability !== 'ready' ||
          this.awaitingConfig ||
          !this.decoder ||
          record.timestampUs < this.configTimestamp ||
          record.timestampUs > BigInt(Number.MAX_SAFE_INTEGER) - 20000n ||
          (this.boundary && !record.discontinuity) ||
          (this.timestamp !== undefined &&
            (record.timestampUs <= this.timestamp ||
              (!record.discontinuity &&
                record.timestampUs !== this.timestamp + 20000n)))
        )
          throw invalid();
        if (record.discontinuity && !this.boundary) this.configureDecoder();
      }
      this.flight = {
        ...record,
        encoded: undefined,
        decoding: record.type === 'packet',
      };
      this.sequence++;
      this.timer = setTimeout(() => this.fail('deadline'), this.timeoutMs);
      if (record.type !== 'packet') {
        if (!this.sink.record(metadata(bytes, record.type)))
          this.fail('admission');
      } else {
        this.timestamp = record.timestampUs;
        this.boundary = false;
        if (this.decoder.decodeQueueSize !== 0) throw invalid();
        this.decoder.decode(
          this.chunkFactory({
            type: 'key',
            timestamp: Number(record.timestampUs),
            duration: 20000,
            data: record.encoded,
          }),
        );
      }
      return !this.closed;
    } catch {
      this.fail('protocol');
      return false;
    }
  }
  output(data, generation) {
    let bytes;
    try {
      if (this.closed || generation !== this.generation) return;
      const flight = this.flight;
      if (
        !flight?.decoding ||
        data.numberOfFrames !== 960 ||
        data.numberOfChannels !== 2 ||
        data.sampleRate !== 48000 ||
        !Number.isSafeInteger(data.timestamp) ||
        Math.abs(data.timestamp - Number(flight.timestampUs)) > 1
      )
        throw invalid();
      const left = new Float32Array(960),
        right = new Float32Array(960);
      data.copyTo(left, { planeIndex: 0, format: 'f32-planar' });
      data.copyTo(right, { planeIndex: 1, format: 'f32-planar' });
      bytes = new ArrayBuffer(3868);
      const view = new DataView(bytes);
      view.setUint32(0, 0x52574231);
      view.setUint8(4, 1);
      view.setUint8(5, 4);
      view.setUint16(6, flight.discontinuity ? 2 : 0);
      view.setUint32(8, 3);
      view.setUint32(12, flight.sequence);
      view.setBigUint64(16, flight.timestampUs);
      view.setUint32(24, 3840);
      for (let i = 0; i < 960; i++)
        for (let channel = 0; channel < 2; channel++) {
          const value = channel ? right[i] : left[i];
          if (!Number.isFinite(value)) throw invalid();
          const clipped = Math.max(-1, Math.min(1, value));
          view.setInt16(
            28 + i * 4 + channel * 2,
            Math.round(clipped * (clipped < 0 ? 32768 : 32767)),
            true,
          );
        }
      flight.decoding = false;
      this.decoded = Math.min(Number.MAX_SAFE_INTEGER, this.decoded + 1);
    } catch {
      this.fail('decoder');
    } finally {
      try {
        data.close();
      } catch {
        this.fail('decoder');
      }
    }
    if (bytes && !this.closed) {
      try {
        if (!this.sink.record(bytes)) this.fail('admission');
      } catch {
        this.fail('admission');
      }
    }
  }
  acknowledge(sequence) {
    if (this.closed) return;
    if (
      !this.flight ||
      this.flight.decoding ||
      sequence !== this.flight.sequence
    ) {
      this.fail('acknowledgment');
      return;
    }
    clearTimeout(this.timer);
    this.timer = this.flight = undefined;
    try {
      this.onRecordAck(sequence);
    } catch {
      this.fail('acknowledgment');
    }
  }
  requestStats() {
    return !this.closed && this.sink.requestStats();
  }
  snapshot() {
    return {
      closed: this.closed,
      decoded: this.decoded,
      lookaheadFrames: this.lookaheadFrames,
      decoding: this.flight?.decoding ? 1 : 0,
      recordInFlight: this.flight ? 1 : 0,
      playback: this.sink.snapshot(),
    };
  }
  fail(reason) {
    if (this.closed) return;
    void this.close();
    try {
      this.onFailure?.(reason);
    } catch {
      /* Observer cannot retain ownership. */
    }
  }
  close() {
    if (this.closePromise) return this.closePromise;
    this.closed = true;
    clearTimeout(this.timer);
    this.timer = this.flight = this.onRecordAck = undefined;
    try {
      this.retireDecoder();
    } catch {
      /* Continue context retirement. */
    }
    this.closePromise = Promise.resolve()
      .then(() => this.sink.close())
      .catch(() => {
        try {
          this.onFailure?.('cleanup');
        } catch {
          /* Owner stays closed. */
        }
      });
    return this.closePromise;
  }
}

/** Exclusive activated context ownership; no sockets or public selection here. */
export async function createOpusPlayback(context, options = {}) {
  let owner, sink;
  try {
    if (
      typeof AudioDecoder === 'undefined' ||
      typeof EncodedAudioChunk === 'undefined' ||
      !(await AudioDecoder.isConfigSupported(OPUS_DECODER_CONFIG)).supported
    )
      throw invalid();
    sink = await createPcmPlayback(context, {
      timeoutMs: options.timeoutMs,
      sourceStatus: true,
      recordCredit: true,
      onRecordAck: (sequence) => owner?.acknowledge(sequence),
      onFailure: (reason) => owner?.fail(reason),
    });
    if (sink.closed) throw invalid();
    owner = new OpusPlayback(sink, options);
    return owner;
  } catch {
    if (sink) await sink.close();
    else if (context?.state !== 'closed') await context?.close();
    throw invalid();
  }
}
