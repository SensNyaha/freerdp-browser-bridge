import {
  MicrophoneSender,
  parseMicrophoneStatus,
} from './microphone-sender.js';
import { MicrophoneOpusSender } from './microphone-opus-sender.js';
const exact = (value, keys) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));
const invalid = () => new Error('Invalid microphone media client');
export function validateMicrophoneProfile(value) {
  if (
    !exact(value, [
      'codec',
      'sourceStatus',
      'streamId',
      'sampleRate',
      'channels',
      'frames',
      'maxPayloadBytes',
      'maxInFlight',
      'packetTimeoutMs',
      'stopTimeoutMs',
    ]) ||
    !['pcm', 'opus'].includes(value.codec) ||
    value.sourceStatus !== true ||
    value.streamId !== 4 ||
    value.sampleRate !== 48000 ||
    value.channels !== 2 ||
    value.frames !== 960 ||
    value.maxPayloadBytes !== (value.codec === 'opus' ? 1315 : 3876) ||
    value.maxInFlight !== 1 ||
    value.packetTimeoutMs !== 2000 ||
    value.stopTimeoutMs !== 4000
  )
    throw invalid();
  return { ...value };
}

/** Negotiated media command/packet ownership. Does not acquire a device or start a graph. */
export class MicrophoneMediaClient {
  #backend;
  #sender;
  #now;
  #observed;
  #latest;
  #sequence = 0;
  #start;
  #stop;
  #requested = false;
  #active = false;
  #token;
  #closed = false;
  #timer;
  #failed = false;
  #writing = false;
  constructor(backend, profile, now = () => performance.now(), codecApi) {
    const selected = validateMicrophoneProfile(profile);
    if (
      !backend ||
      typeof backend.write !== 'function' ||
      typeof backend.changed !== 'function' ||
      typeof backend.failed !== 'function' ||
      typeof now !== 'function'
    )
      throw invalid();
    this.#backend = backend;
    this.#now = now;
    const senderBackend = {
      send: (record) => backend.write(record),
      revoke: () => {
        this.#token = undefined;
        this.#active = false;
        if (!this.#closed) void this.stop().catch(() => {});
      },
    };
    this.#sender =
      selected.codec === 'opus'
        ? new MicrophoneOpusSender(senderBackend, codecApi, now)
        : new MicrophoneSender(senderBackend);
    this.#timer = setInterval(() => this.poll(), 20);
  }
  get stats() {
    return {
      ...this.#sender.stats,
      closed: this.#closed,
      failed: this.#failed,
      starting: Boolean(this.#start),
      stopping: Boolean(this.#stop),
      active: this.#active,
    };
  }
  get source() {
    return this.#latest
      ? {
          ...this.#latest,
          source: this.#latest.source ? { ...this.#latest.source } : undefined,
        }
      : undefined;
  }
  get sender() {
    const snapshot = () => this.#sender.stats;
    return {
      offer: (token, packet, now) =>
        this.authorized(token, packet?.epoch)
          ? this.#sender.offer(token, packet, now)
          : false,
      poll: (now) => this.#sender.poll(now),
      revoke: (token) => this.#sender.revoke(token),
      get stats() {
        return snapshot();
      },
    };
  }
  #clock() {
    const now = this.#now();
    if (
      !Number.isFinite(now) ||
      now < 0 ||
      now > Number.MAX_SAFE_INTEGER - 4000 ||
      (this.#observed !== undefined && now < this.#observed)
    )
      throw invalid();
    this.#observed = now;
    if (
      (this.#start && now >= this.#start.deadline) ||
      (this.#stop && now >= this.#stop.deadline)
    )
      throw invalid();
    return now;
  }
  #fault() {
    if (this.#closed) return;
    this.#failed = true;
    this.close();
    try {
      this.#backend.failed();
    } catch {
      /* Enclosing owner still owns socket/device cleanup. */
    }
  }
  #finish(pending, value) {
    pending.resolve(value);
  }
  #command(type, pending) {
    if (this.#writing) throw invalid();
    if (this.#sequence === 0xffffffff) {
      this.#fault();
      return false;
    }
    pending.id = ++this.#sequence;
    let written;
    this.#writing = true;
    try {
      written = this.#backend.write(
        JSON.stringify({ v: 1, type, data: { requestSeq: pending.id } }),
      );
    } finally {
      this.#writing = false;
    }
    if (written !== true) {
      this.#fault();
      return false;
    }
    return !this.#closed;
  }
  start(epoch) {
    if (
      this.#closed ||
      this.#start ||
      this.#stop ||
      this.#requested ||
      this.#active ||
      this.#sender.stats.inFlight ||
      this.#latest?.granted ||
      this.#latest?.retiring ||
      this.#latest?.source?.availability !== 'ready' ||
      this.#latest.source.epoch !== epoch
    )
      return Promise.resolve(false);
    let resolve;
    const promise = new Promise((done) => {
      resolve = done;
    });
    try {
      const pending = {
        id: 0,
        epoch,
        resolve,
        promise,
        cancelled: false,
        deadline: this.#clock() + 2000,
      };
      this.#start = pending;
      this.#requested = true;
      this.#command('microphone.start', pending);
    } catch {
      this.#fault();
      resolve(false);
    }
    return promise;
  }
  stop() {
    if (this.#stop) return this.#stop.promise;
    if (this.#closed)
      return this.#failed ? Promise.reject(invalid()) : Promise.resolve();
    if (
      !this.#requested &&
      !this.#active &&
      !this.#start &&
      !this.#token &&
      !this.#latest?.granted &&
      !this.#latest?.retiring
    )
      return Promise.resolve();
    let resolve, reject;
    const promise = new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    });
    void promise.catch(() => {});
    try {
      const pending = {
        id: 0,
        resolve,
        reject,
        promise,
        deadline: this.#clock() + 4000,
      };
      this.#stop = pending;
      this.#requested = false;
      this.#active = false;
      if (this.#start) {
        this.#start.cancelled = true;
        this.#finish(this.#start, false);
      }
      const token = this.#token;
      this.#token = undefined;
      if (token) this.#sender.revoke(token);
      this.#command('microphone.stop', pending);
    } catch {
      this.#fault();
      reject(invalid());
    }
    return promise;
  }
  authorize(epoch) {
    if (
      this.#closed ||
      !this.#active ||
      this.#start ||
      this.#stop ||
      this.#token ||
      !this.#latest?.granted ||
      this.#latest.source?.availability !== 'ready' ||
      this.#latest.source.epoch !== epoch
    )
      return undefined;
    try {
      this.#token = this.#sender.authorize(this.#clock());
      return this.#token;
    } catch {
      this.#fault();
      return undefined;
    }
  }
  authorized(token, epoch) {
    return (
      !this.#closed &&
      this.#active &&
      !this.#stop &&
      Boolean(token) &&
      token === this.#token &&
      this.#latest?.granted === true &&
      this.#latest.source?.availability === 'ready' &&
      this.#latest.source.epoch === epoch
    );
  }
  message(message) {
    if (
      !message ||
      typeof message.type !== 'string' ||
      !message.type.startsWith('microphone.')
    )
      return false;
    if (this.#closed) return true;
    try {
      if (this.#writing) throw invalid();
      const now = this.#clock();
      if (
        !exact(message, ['v', 'type', 'seq', 'ts', 'data']) ||
        message.v !== 1 ||
        !Number.isInteger(message.seq) ||
        message.seq < 0 ||
        message.seq > 0xffffffff ||
        !Number.isSafeInteger(message.ts) ||
        message.ts < 0
      )
        throw invalid();
      const data = message.data;
      if (message.type === 'microphone.state') {
        const latest = parseMicrophoneStatus(data);
        if (latest.granted && !this.#requested && !this.#start && !this.#stop)
          throw invalid();
        this.#latest = latest;
        this.#sender.status(data, now);
        if (this.#sender.stats.closed) throw invalid();
        if (
          !latest.granted ||
          latest.retiring ||
          latest.source?.availability !== 'ready'
        )
          this.#active = false;
        this.#backend.changed(this.source);
      } else if (message.type === 'microphone.ack') {
        this.#sender.acknowledge(data, now);
        if (this.#sender.stats.closed) throw invalid();
      } else if (message.type === 'microphone.result') {
        if (
          !exact(data, ['requestSeq', 'status']) ||
          !Number.isInteger(data.requestSeq) ||
          !['started', 'busy', 'stopped'].includes(data.status)
        )
          throw invalid();
        if (this.#start?.id === data.requestSeq) {
          const pending = this.#start;
          if (!['started', 'busy'].includes(data.status)) throw invalid();
          this.#start = undefined;
          const accepted =
            data.status === 'started' &&
            !pending.cancelled &&
            !this.#stop &&
            this.#requested &&
            this.#latest?.granted &&
            this.#latest.source?.availability === 'ready' &&
            this.#latest.source.epoch === pending.epoch;
          if (data.status === 'busy') this.#requested = false;
          this.#active = Boolean(accepted);
          this.#finish(pending, this.#active);
          if (data.status === 'started' && !accepted)
            void this.stop().catch(() => {});
        } else if (this.#stop?.id === data.requestSeq) {
          if (
            data.status !== 'stopped' ||
            this.#latest?.granted ||
            this.#latest?.retiring
          )
            throw invalid();
          const pending = this.#stop;
          this.#stop = undefined;
          pending.resolve();
        } else throw invalid();
      } else throw invalid();
    } catch {
      this.#fault();
    }
    return true;
  }
  poll() {
    if (this.#closed) return false;
    try {
      const now = this.#clock();
      if (
        (this.#start && now >= this.#start.deadline) ||
        (this.#stop && now >= this.#stop.deadline)
      ) {
        this.#fault();
        return false;
      }
      this.#sender.poll(now);
      if (this.#sender.stats.closed) {
        this.#fault();
        return false;
      }
      return true;
    } catch {
      this.#fault();
      return false;
    }
  }
  close() {
    if (this.#closed) return;
    this.#closed = true;
    this.#requested = false;
    this.#active = false;
    this.#token = undefined;
    clearInterval(this.#timer);
    if (this.#start) this.#finish(this.#start, false);
    if (this.#stop) this.#stop.reject(invalid());
    this.#start = undefined;
    this.#stop = undefined;
    this.#latest = undefined;
    this.#sender.close();
  }
}
