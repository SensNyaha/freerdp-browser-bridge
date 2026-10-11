import { encodeMicrophoneRecord } from './microphone-wire.js';
const MAX = 0xffffffffffffffffn;
const MAX_TIMESTAMP = MAX - 20000n;
const availability = [
  'unavailable',
  'waiting',
  'ready',
  'suspended',
  'closed',
  'failed',
];
const results = ['accepted', 'stale', 'unavailable', 'busy', 'invalid'];
const invalid = () => new Error('Invalid microphone sender state');
const exact = (value, keys) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));
const decimal = (value, minimum, maximum) => {
  if (
    typeof value !== 'string' ||
    value.length > 20 ||
    !/^(0|[1-9][0-9]*)$/.test(value)
  )
    throw invalid();
  const number = BigInt(value);
  if (number < minimum || number > maximum) throw invalid();
  return number;
};
export function parseMicrophoneStatus(value) {
  if (
    !exact(value, ['granted', 'retiring', 'source']) ||
    typeof value.granted !== 'boolean' ||
    typeof value.retiring !== 'boolean' ||
    (value.granted && value.retiring)
  )
    throw invalid();
  let source;
  if (value.source !== null) {
    const item = value.source;
    if (
      !exact(item, [
        'enabled',
        'availability',
        'revision',
        'epoch',
        'timestampUs',
      ]) ||
      item.enabled !== true ||
      !availability.includes(item.availability)
    )
      throw invalid();
    source = {
      enabled: true,
      availability: item.availability,
      revision: decimal(item.revision, 1n, MAX),
      epoch: decimal(item.epoch, 0n, MAX),
      timestampUs: decimal(item.timestampUs, 0n, MAX_TIMESTAMP),
    };
    if (source.availability === 'ready' && source.epoch === 0n) throw invalid();
  }
  return { granted: value.granted, retiring: value.retiring, source };
}

/** Isolated permission-token sender. Does not call getUserMedia, own a socket or create timers. */
export class MicrophoneSender {
  #backend;
  #timeoutMs;
  #sequence;
  #samples;
  #closed;
  #source;
  #permission;
  #flight;
  #pending;
  #observed;
  #lastOffered;
  #offeredEpoch;
  #nextTimestamp;
  #sentEpoch;
  #forceDiscontinuity;
  #waitingForState;
  #permissionBlocked;
  #busy;
  #counts;
  constructor(backend, timeoutMs = 2000, sequence = 0) {
    if (
      !backend ||
      typeof backend.send !== 'function' ||
      typeof backend.revoke !== 'function' ||
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 20 ||
      timeoutMs > 2000 ||
      !Number.isInteger(sequence) ||
      sequence < 0 ||
      sequence > 0xffffffff
    )
      throw invalid();
    this.#backend = backend;
    this.#timeoutMs = timeoutMs;
    this.#sequence = sequence;
    this.#samples = new Uint8Array(3840);
    this.#closed = false;
    this.#source = undefined;
    this.#permission = undefined;
    this.#flight = undefined;
    this.#pending = undefined;
    this.#observed = undefined;
    this.#lastOffered = undefined;
    this.#offeredEpoch = undefined;
    this.#nextTimestamp = undefined;
    this.#sentEpoch = undefined;
    this.#forceDiscontinuity = true;
    this.#waitingForState = false;
    this.#permissionBlocked = false;
    this.#busy = false;
    this.#counts = {
      offered: 0,
      sent: 0,
      accepted: 0,
      refused: 0,
      dropped: 0,
      replaced: 0,
      faults: 0,
    };
  }
  get stats() {
    return {
      ...this.#counts,
      closed: this.#closed,
      inFlight: Boolean(this.#flight),
      pendingBytes: this.#pending ? 3840 : 0,
    };
  }
  count(name) {
    this.#counts[name] = Math.min(
      Number.MAX_SAFE_INTEGER,
      this.#counts[name] + 1,
    );
  }
  clock(now) {
    if (
      !Number.isFinite(now) ||
      now < 0 ||
      now > Number.MAX_SAFE_INTEGER - this.#timeoutMs ||
      (this.#observed !== undefined && now < this.#observed)
    ) {
      this.fault();
      return false;
    }
    this.#observed = now;
    if (this.#flight && now >= this.#flight.deadline) {
      this.fault();
      return false;
    }
    return !this.#closed;
  }
  clear() {
    if (this.#pending) this.count('dropped');
    this.#pending = undefined;
    this.#samples.fill(0);
    this.#forceDiscontinuity = true;
  }
  notifyRevoke() {
    try {
      this.#backend.revoke();
    } catch {
      /* Owner must independently close device/transport resources. */
    }
  }
  fault() {
    if (this.#closed) return;
    this.count('faults');
    this.close();
  }
  close() {
    if (this.#closed) return;
    this.#closed = true;
    this.#permission = undefined;
    this.#flight = undefined;
    this.clear();
    this.#source = undefined;
    this.notifyRevoke();
  }
  ready() {
    return (
      this.#source?.granted &&
      !this.#source.retiring &&
      this.#source.source?.availability === 'ready'
    );
  }
  status(value, now) {
    if (!this.clock(now)) return false;
    try {
      const state = parseMicrophoneStatus(value),
        previous = this.#source?.source,
        next = state.source;
      if (
        previous &&
        (!next ||
          next.revision < previous.revision ||
          next.epoch < previous.epoch ||
          next.timestampUs < previous.timestampUs ||
          (next.revision === previous.revision &&
            (next.epoch !== previous.epoch ||
              next.timestampUs !== previous.timestampUs ||
              next.availability !== previous.availability)))
      )
        throw invalid();
      const changed = next?.epoch !== previous?.epoch;
      if (changed || !state.granted || next?.availability !== 'ready')
        this.clear();
      if (changed) {
        this.#lastOffered = undefined;
        this.#offeredEpoch = undefined;
      }
      const revoked = !state.granted && Boolean(this.#permission);
      if (!state.granted && this.#permission) {
        this.#permission = undefined;
      }
      if (!state.granted) this.#permissionBlocked = false;
      if (!previous || (next && next.revision > previous.revision) || changed)
        this.#waitingForState = false;
      this.#source = state;
      if (revoked) this.notifyRevoke(); // Publish all local authority before external cleanup can reenter.
      return this.pump(this.#observed);
    } catch {
      this.fault();
      return false;
    }
  }
  /** Caller must have explicit device permission and current server grant before invoking. */
  authorize(now) {
    if (
      !this.clock(now) ||
      !this.ready() ||
      this.#permission ||
      this.#permissionBlocked ||
      this.#flight ||
      this.#busy
    )
      return undefined;
    this.#permission = Symbol('microphone permission');
    this.#lastOffered = undefined;
    this.#offeredEpoch = undefined;
    return this.#permission;
  }
  revoke(token) {
    if (!token || token !== this.#permission) return false;
    this.#permission = undefined;
    this.#permissionBlocked = true;
    this.clear();
    this.notifyRevoke();
    return true;
  }
  offer(token, packet, now) {
    if (!this.clock(now)) return false;
    if (
      !token ||
      token !== this.#permission ||
      !this.ready() ||
      this.#waitingForState
    ) {
      this.count('dropped');
      return false;
    }
    try {
      if (!packet || packet.epoch !== this.#source.source.epoch) {
        this.count('dropped');
        return false;
      }
      if (
        typeof packet.timestampUs !== 'bigint' ||
        packet.timestampUs < 0n ||
        packet.timestampUs > MAX_TIMESTAMP ||
        !(packet.pcm instanceof Uint8Array) ||
        !(packet.pcm.buffer instanceof ArrayBuffer) ||
        packet.pcm.byteLength !== 3840 ||
        (this.#offeredEpoch === packet.epoch &&
          this.#lastOffered !== undefined &&
          packet.timestampUs <= this.#lastOffered)
      )
        throw invalid();
      this.count('offered');
      this.#lastOffered = packet.timestampUs;
      this.#offeredEpoch = packet.epoch;
      if (this.#pending) {
        this.count('replaced');
        this.#forceDiscontinuity = true;
      }
      this.#samples.set(packet.pcm);
      this.#pending = {
        epoch: packet.epoch,
        timestampUs: packet.timestampUs,
        token,
        expires: now + 120,
      };
      return this.pump(now);
    } catch {
      this.fault();
      return false;
    }
  }
  pump(now) {
    if (this.#pending && now >= this.#pending.expires) this.clear();
    if (
      this.#closed ||
      this.#busy ||
      this.#flight ||
      !this.#pending ||
      !this.#permission ||
      !this.ready() ||
      this.#waitingForState
    )
      return false;
    if (
      this.#pending.token !== this.#permission ||
      this.#pending.epoch !== this.#source.source.epoch
    ) {
      this.clear();
      return false;
    }
    if (this.#sequence === 0xffffffff) {
      this.fault();
      return false;
    }
    this.#busy = true;
    const pending = this.#pending;
    const flight = {
      sequence: this.#sequence + 1,
      epoch: pending.epoch,
      token: pending.token,
      deadline: now + this.#timeoutMs,
    };
    const discontinuity =
      this.#forceDiscontinuity ||
      this.#sentEpoch !== pending.epoch ||
      this.#nextTimestamp !== pending.timestampUs;
    let record;
    try {
      record = encodeMicrophoneRecord(
        { ...pending, pcm: this.#samples, discontinuity },
        flight.sequence,
      );
      this.#flight = flight; // Reserve before transport callbacks can reenter.
      this.#pending = undefined;
      this.#samples.fill(0); // The encoded record owns this submission; the latest slot is free for reentry.
      const sent = this.#backend.send(record);
      if (typeof sent !== 'boolean') throw invalid();
      if (!sent) {
        if (this.#flight === flight) this.#flight = undefined;
        if (
          !this.#closed &&
          this.#permission === pending.token &&
          this.ready() &&
          this.#source.source.epoch === pending.epoch &&
          !this.#pending
        ) {
          this.#samples.set(new Uint8Array(record, 36, 3840));
          this.#pending = pending;
        } else this.count('dropped');
        return false;
      } // Explicit no-write; keep only latest unsent state.
      this.#sequence = flight.sequence;
      this.count('sent');
      if (this.#closed || this.#permission !== pending.token) return false;
      this.#sentEpoch = pending.epoch;
      this.#nextTimestamp = pending.timestampUs + 20000n;
      this.#forceDiscontinuity = false;
      return true;
    } catch {
      this.fault();
      return false;
    } finally {
      this.#busy = false;
    }
  }
  acknowledge(value, now) {
    if (!this.clock(now)) return false;
    if (this.#busy) {
      this.fault();
      return false;
    } // Socket ACKs must arrive after the local send returns.
    try {
      if (
        !exact(value, ['sequence', 'epoch', 'status']) ||
        !Number.isInteger(value.sequence) ||
        !results.includes(value.status)
      )
        throw invalid();
      const epoch = decimal(value.epoch, 1n, MAX),
        flight = this.#flight;
      if (
        !flight ||
        value.sequence !== flight.sequence ||
        epoch !== flight.epoch
      )
        throw invalid();
      this.#flight = undefined;
      if (
        value.status === 'accepted' &&
        this.#permission === flight.token &&
        this.ready() &&
        this.#source.source.epoch === epoch
      )
        this.count('accepted');
      else {
        this.count('refused');
        this.#forceDiscontinuity = true;
      }
      if (
        (value.status === 'stale' || value.status === 'unavailable') &&
        this.#source?.source?.epoch === flight.epoch
      ) {
        this.clear();
        this.#waitingForState = true;
      }
      return this.pump(now);
    } catch {
      this.fault();
      return false;
    }
  }
  poll(now) {
    return this.clock(now) && this.pump(now);
  }
}
