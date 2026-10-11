import {
  decodeMicrophoneRecord,
  encodeMicrophoneState,
  encodeMicrophoneResult,
  validateMicrophoneStateProgress,
  type MicrophoneState,
  type MicrophonePcmPacket,
  type MicrophoneResult,
  type MicrophoneRecord,
} from '@freerdp-bridge/protocol';

export interface MicrophoneIngressBackend {
  authorized(): boolean;
  source(): MicrophoneState | undefined;
  /** Must finish/reject within the supervisor deadline; borrows PCM until settlement. */
  submit(packet: MicrophonePcmPacket): Promise<MicrophoneResult>;
}
export interface MicrophoneAdmission {
  sequence: number;
  result: MicrophoneResult;
}
const increment = (value: number) =>
  Math.min(Number.MAX_SAFE_INTEGER, value + 1);

/** Preparatory lease-bound admission. No socket, device permission or native reset activation. */
export class MicrophoneIngress {
  private readonly samples = Buffer.alloc(3840);
  private previous: MicrophoneState | undefined;
  private lastSequence = 0;
  private acceptedEpoch: bigint | undefined;
  private nextTimestamp: bigint | undefined;
  private attemptedEpoch: bigint | undefined;
  private closed = false;
  private busy = false;
  private pending: Promise<MicrophoneAdmission> | undefined;
  private counters = {
    received: 0,
    accepted: 0,
    stale: 0,
    unavailable: 0,
    busy: 0,
    invalid: 0,
    faults: 0,
  };

  constructor(private readonly backend: MicrophoneIngressBackend) {
    if (
      !backend ||
      typeof backend.authorized !== 'function' ||
      typeof backend.source !== 'function' ||
      typeof backend.submit !== 'function'
    )
      throw new Error('Invalid microphone ingress backend');
  }
  get stats() {
    return { ...this.counters, closed: this.closed, inFlight: this.busy };
  }
  /** Last attempted native epoch, needed by the caller's separate reset/termination barrier. */
  get drainEpoch(): bigint | undefined {
    return this.attemptedEpoch;
  }

  private result(
    sequence: number,
    result: MicrophoneResult,
  ): MicrophoneAdmission {
    this.counters[result] = increment(this.counters[result]);
    return { sequence, result };
  }
  private authority(): MicrophoneState | undefined {
    if (this.closed) return undefined;
    if (!this.backend.authorized()) {
      this.closed = true;
      return undefined;
    }
    const value = this.backend.source();
    if (!value) return undefined;
    const { enabled, availability, revision, epoch, timestampUs } = value;
    const state = { enabled, availability, revision, epoch, timestampUs };
    encodeMicrophoneState(state);
    if (this.previous?.revision === revision) {
      if (
        this.previous.enabled !== enabled ||
        this.previous.availability !== availability ||
        this.previous.epoch !== epoch ||
        this.previous.timestampUs !== timestampUs
      )
        throw new Error('Invalid microphone source progress');
    } else validateMicrophoneStateProgress(this.previous, state);
    this.previous = state;
    if (!this.backend.authorized()) this.closed = true;
    return !this.closed && state.enabled && state.availability === 'ready'
      ? state
      : undefined;
  }

  receive(bytes: Buffer): Promise<MicrophoneAdmission> {
    let packet: MicrophoneRecord;
    try {
      packet = decodeMicrophoneRecord(bytes);
    } catch (error) {
      this.counters.invalid = increment(this.counters.invalid);
      return Promise.reject(error);
    }
    this.counters.received = increment(this.counters.received);
    if (this.closed)
      return Promise.resolve(this.result(packet.sequence, 'unavailable'));
    if (packet.sequence <= this.lastSequence)
      return Promise.resolve(this.result(packet.sequence, 'stale'));
    this.lastSequence = packet.sequence; // Consume every valid wire attempt, including busy/refused packets.
    if (this.busy) return Promise.resolve(this.result(packet.sequence, 'busy'));
    this.busy = true;
    let finish!: (result: MicrophoneAdmission) => void;
    const pending = new Promise<MicrophoneAdmission>((resolve) => {
      finish = resolve;
    });
    this.pending = pending; // Establish drain ownership before any external callback can reenter.
    void this.deliver(packet).then((result) => {
      this.samples.fill(0);
      this.busy = false;
      this.pending = undefined;
      finish(this.result(packet.sequence, result));
    });
    return pending;
  }

  private async deliver(packet: MicrophoneRecord): Promise<MicrophoneResult> {
    try {
      const state = this.authority();
      if (!state || this.closed) return 'unavailable';
      if (packet.epoch !== state.epoch) return 'stale';
      if (
        this.acceptedEpoch === packet.epoch &&
        this.nextTimestamp !== undefined &&
        packet.timestampUs <= this.nextTimestamp - 20000n
      )
        return 'invalid';
      if (
        !packet.discontinuity &&
        (this.acceptedEpoch !== packet.epoch ||
          this.nextTimestamp !== packet.timestampUs)
      )
        return 'invalid';
      this.samples.set(packet.pcm);
      packet.pcm = this.samples; // Release borrowed wire storage before asynchronous submission.
      this.attemptedEpoch = packet.epoch;
      const result = await this.backend.submit(
        Object.freeze({
          epoch: packet.epoch,
          timestampUs: packet.timestampUs,
          discontinuity: packet.discontinuity,
          pcm: packet.pcm,
        }),
      );
      encodeMicrophoneResult(result);
      const actual = this.authority();
      if (!actual || this.closed) return 'unavailable';
      if (actual.epoch !== packet.epoch) return 'stale';
      if (result === 'accepted') {
        this.acceptedEpoch = packet.epoch;
        this.nextTimestamp = packet.timestampUs + 20000n;
      }
      return result;
    } catch {
      this.counters.faults = increment(this.counters.faults);
      this.closed = true;
      return 'unavailable';
    }
  }

  /** Revoke synchronously, drain one bounded backend operation. Caller must then reset/terminate native capture. */
  close(): Promise<void> {
    this.closed = true;
    if (this.pending) return this.pending.then(() => {});
    this.samples.fill(0);
    return Promise.resolve();
  }
}
