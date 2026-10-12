import {
  MicrophoneSender,
  parseMicrophoneStatus,
} from './microphone-sender.js';
import { MicrophoneOpusEncoder } from './microphone-opus-encoder.js';
import { encodeMicrophoneOpusRecord } from './microphone-opus-wire.js';

/** Isolated selected codec/credit owner. No device, graph, socket or automatic permission. */
export class MicrophoneOpusSender {
  #sender;
  #api;
  #now;
  #source;
  #token;
  #encoder;
  #epoch;
  #preparation;
  #retiringCodec = false;
  constructor(backend, api, now = () => performance.now()) {
    if (
      !backend ||
      typeof backend.send !== 'function' ||
      typeof backend.revoke !== 'function' ||
      typeof now !== 'function'
    )
      throw new Error('Invalid microphone Opus sender');
    this.#api = api;
    this.#now = now;
    this.#sender = new MicrophoneSender({
      send: (record) => backend.send(record),
      revoke: () => {
        this.#token = undefined;
        try {
          this.#retire();
        } finally {
          backend.revoke();
        }
      },
      prepare: (packet, sequence, complete) =>
        this.#prepare(packet, sequence, complete),
      cancelPreparation: () => this.#retire(),
    });
  }
  get stats() {
    return this.#sender.stats;
  }
  #authorized(epoch) {
    return Boolean(
      this.#token &&
        !this.#sender.stats.closed &&
        this.#source?.granted &&
        !this.#source.retiring &&
        this.#source.source?.availability === 'ready' &&
        this.#source.source.epoch === epoch,
    );
  }
  #retire() {
    this.#preparation = undefined;
    const encoder = this.#encoder;
    this.#encoder = undefined;
    this.#epoch = undefined;
    const failed = encoder?.stats.failed;
    this.#retiringCodec = true;
    try {
      encoder?.close();
    } finally {
      this.#retiringCodec = false;
    }
    if (!failed && encoder?.stats.failed)
      throw new Error('Microphone codec retirement failed');
  }
  #prepare(packet, sequence, complete) {
    if (!this.#authorized(packet.epoch) || this.#preparation) return false;
    if (
      !this.#encoder ||
      this.#epoch !== packet.epoch ||
      this.#encoder.stats.closed
    ) {
      this.#retire();
      const encoder = new MicrophoneOpusEncoder(
        packet.epoch,
        {
          authorized: (epoch) => this.#authorized(epoch),
          receive: (unit) => {
            const preparation = this.#preparation;
            if (
              !preparation ||
              this.#encoder !== encoder ||
              unit.epoch !== preparation.epoch ||
              unit.timestampUs !== preparation.timestampUs
            )
              return false;
            const record = encodeMicrophoneOpusRecord(
              unit,
              preparation.sequence,
            );
            this.#preparation = undefined;
            preparation.complete(record, this.#now());
            // The bounded completion owns the copy and retires prediction on no-write.
            return true;
          },
          failed: () => {
            // Retirement reports a new close failure through its caller once.
            if (!this.#retiringCodec) this.#sender.fault();
          },
        },
        this.#api,
        this.#now,
      );
      if (this.#sender.stats.closed || encoder.stats.closed) {
        encoder.close();
        return false;
      }
      if (!this.#authorized(packet.epoch)) {
        encoder.close();
        // The reserved job was consumed and cancelled during construction.
        return true;
      }
      this.#encoder = encoder;
      this.#epoch = packet.epoch;
    }
    this.#preparation = {
      epoch: packet.epoch,
      timestampUs: packet.timestampUs,
      sequence,
      complete,
    };
    return this.#encoder.encode(packet);
  }
  status(value, now) {
    try {
      const source = parseMicrophoneStatus(value);
      const changed = source.source?.epoch !== this.#source?.source?.epoch;
      this.#source = source;
      if (changed || !source.granted || source.source?.availability !== 'ready')
        this.#retire();
      return this.#sender.status(value, now);
    } catch {
      this.#sender.fault();
      return false;
    }
  }
  authorize(now) {
    const token = this.#sender.authorize(now);
    if (token) this.#token = token;
    return token;
  }
  offer(token, packet, now) {
    return this.#sender.offer(token, packet, now);
  }
  acknowledge(value, now) {
    return this.#sender.acknowledge(value, now);
  }
  poll(now) {
    const result = this.#sender.poll(now);
    this.#encoder?.poll();
    return result;
  }
  revoke(token) {
    return this.#sender.revoke(token);
  }
  close() {
    this.#sender.close();
  }
}
