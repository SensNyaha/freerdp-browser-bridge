import {
  ProtocolError,
  validateOpusAudioPacket,
  encodeOpusAudioStateRecord,
  encodeOpusAudioConfigRecord,
  encodeOpusAudioPacketRecord,
  type OpusAudioState,
  type OpusAudioConfig,
  type OpusAudioPacket,
} from '@freerdp-bridge/protocol';
import { OpusSource, type OpusSourceEvent } from './opus-source.js';
import type { PcmDeliveryResult } from './pcm-delivery.js';

export interface OpusDeliverySnapshot {
  state?: OpusAudioState;
  config?: OpusAudioConfig;
}
/** Preparatory compressed transport owner. Caller schedules native recovery.
 * One receiver credit and one copied packet; no socket, timer or mode selection. */
export class OpusMediaSender {
  private readonly source = new OpusSource();
  private pendingState: OpusAudioState | undefined;
  private pendingConfig: OpusAudioConfig | undefined;
  private pendingPacket: OpusAudioPacket | undefined;
  private wireConfig: OpusAudioConfig | undefined;
  private flight:
    | { sequence: number; deadline: number; bytes: number }
    | undefined;
  private sequence: number;
  private observed: number | undefined;
  private timestamp: bigint | undefined;
  private recoveryEpoch: bigint | undefined;
  private recoveryDeadline: number | undefined;
  private busy = false;
  private closed = false;
  private failed = false;
  private readonly counters = {
    offered: 0,
    sentStates: 0,
    sentConfigs: 0,
    sentPackets: 0,
    acknowledgements: 0,
    discardedPackets: 0,
    retiredPackets: 0,
    recoveryRequests: 0,
    invalidCalls: 0,
  };
  constructor(
    initial: OpusDeliverySnapshot = {},
    private readonly timeoutMs = 2000,
    sequence = 0,
  ) {
    if (
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 20 ||
      timeoutMs > 2000 ||
      !Number.isInteger(sequence) ||
      sequence < 0 ||
      sequence > 0xffffffff ||
      (initial.config && !initial.state)
    )
      throw new ProtocolError();
    this.sequence = sequence;
    if (initial.state) this.offer({ type: 'state', state: initial.state });
    if (initial.config) this.offer({ type: 'config', config: initial.config });
    if (this.failed) throw new ProtocolError();
    if (initial.state?.availability === 'ready') this.recover();
  }
  /** Only scalar authority for the outer owner; no packet history or metrics labels. */
  get resetEpoch(): bigint | undefined {
    const state = this.source.current;
    return !this.closed &&
      this.recoveryEpoch !== undefined &&
      state?.availability === 'ready'
      ? state.epoch
      : undefined;
  }
  private count(name: keyof OpusMediaSender['counters']) {
    if (this.counters[name] < Number.MAX_SAFE_INTEGER) this.counters[name]++;
  }
  private discardPacket() {
    this.pendingPacket?.encoded.fill(0);
    this.pendingPacket = undefined;
  }
  private recover() {
    if (this.pendingPacket) this.count('discardedPackets');
    this.discardPacket();
    this.pendingConfig = this.wireConfig = undefined;
    this.recoveryEpoch = this.source.current!.epoch;
    this.recoveryDeadline = undefined;
    this.count('recoveryRequests');
  }
  private fail() {
    this.failed = true;
    this.close();
  }
  private clock(now: number): boolean {
    if (
      !Number.isSafeInteger(now) ||
      now < 0 ||
      now > Number.MAX_SAFE_INTEGER - this.timeoutMs ||
      (this.observed !== undefined && now < this.observed)
    ) {
      this.count('invalidCalls');
      return false;
    }
    this.observed = now;
    return true;
  }
  offer(event: OpusSourceEvent): boolean {
    if (this.closed || this.busy) {
      this.count('invalidCalls');
      return false;
    }
    try {
      if (event?.type === 'packet') {
        validateOpusAudioPacket(event.packet); // Bound/TOC before any owned copy.
        const state = this.source.current;
        if (
          state?.availability !== 'ready' ||
          event.packet.epoch !== state.epoch ||
          !this.source.configuration ||
          (this.timestamp !== undefined &&
            (event.packet.timestampUs <= this.timestamp ||
              (!event.packet.discontinuity &&
                event.packet.timestampUs !== this.timestamp + 20000n)))
        )
          throw new ProtocolError();
        this.timestamp = event.packet.timestampUs;
        if (this.recoveryEpoch !== undefined) {
          // Already validated source metadata, but skipped prediction is never delivered.
          this.count('discardedPackets');
          this.count('offered');
          return true;
        }
      }
      const accepted = this.source.acceptEvent(event);
      if (accepted.type === 'state') {
        if (this.pendingPacket) this.count('discardedPackets');
        this.discardPacket();
        this.pendingConfig = this.wireConfig = undefined;
        this.pendingState = accepted.state;
        if (
          this.recoveryEpoch !== undefined &&
          accepted.state.epoch > this.recoveryEpoch
        ) {
          this.recoveryEpoch = this.recoveryDeadline = undefined;
        }
      } else if (accepted.type === 'config') {
        if (this.recoveryEpoch === undefined)
          this.pendingConfig = accepted.config;
      } else if (this.pendingPacket) {
        this.recover();
        this.count('discardedPackets');
      } else {
        this.pendingPacket = {
          ...accepted.packet,
          encoded: Buffer.from(accepted.packet.encoded),
        };
      }
      this.count('offered');
      return true;
    } catch {
      this.fail();
      return false;
    }
  }
  /** True admission means bounded consumer storage owns a copy, in order. */
  pump(now: number, send: (record: Buffer) => boolean): PcmDeliveryResult {
    if (this.failed) return 'failed';
    if (this.closed) return 'closed';
    if (this.busy || typeof send !== 'function' || !this.clock(now))
      return 'invalid';
    if (this.recoveryEpoch !== undefined) {
      this.recoveryDeadline ??= now + this.timeoutMs;
      if (now >= this.recoveryDeadline) {
        this.fail();
        return 'failed';
      }
    }
    if (this.flight) {
      if (now >= this.flight.deadline) {
        this.fail();
        return 'failed';
      }
      return 'blocked';
    }
    const type = this.pendingState
      ? 'state'
      : this.pendingConfig && this.pendingPacket
        ? 'config'
        : this.pendingPacket && this.wireConfig
          ? 'packet'
          : undefined;
    if (!type) return 'idle';
    if (this.sequence > 0xffffffff) {
      this.fail();
      return 'failed';
    }
    this.busy = true;
    try {
      const record =
        type === 'state'
          ? encodeOpusAudioStateRecord(this.pendingState!, this.sequence)
          : type === 'config'
            ? encodeOpusAudioConfigRecord(
                this.pendingConfig!,
                this.pendingPacket!.timestampUs,
                this.sequence,
              )
            : encodeOpusAudioPacketRecord(this.pendingPacket!, this.sequence);
      const admitted = send(record);
      if (this.closed) return this.failed ? 'failed' : 'closed';
      if (admitted === false) return 'blocked';
      if (admitted !== true) throw new ProtocolError();
      this.flight = {
        sequence: this.sequence++,
        deadline: now + this.timeoutMs,
        bytes: record.length,
      };
      if (type === 'state') {
        this.pendingState = undefined;
        this.count('sentStates');
      } else if (type === 'config') {
        this.wireConfig = this.pendingConfig;
        this.pendingConfig = undefined;
        this.count('sentConfigs');
      } else {
        this.discardPacket();
        this.count('sentPackets');
      }
      return 'sent';
    } catch {
      this.fail();
      return 'failed';
    } finally {
      this.busy = false;
    }
  }
  acknowledge(sequence: number, now: number): boolean {
    if (this.closed || this.busy) {
      this.count('invalidCalls');
      return false;
    }
    if (!this.clock(now)) return false;
    if (
      !Number.isInteger(sequence) ||
      !this.flight ||
      sequence !== this.flight.sequence ||
      now >= this.flight.deadline
    ) {
      this.fail();
      return false;
    }
    this.flight = undefined;
    this.count('acknowledgements');
    return true;
  }
  close() {
    this.closed = true;
    if (this.pendingPacket) this.count('retiredPackets');
    this.discardPacket();
    this.pendingState = this.pendingConfig = this.wireConfig = undefined;
    this.flight = undefined;
    this.recoveryEpoch = this.recoveryDeadline = undefined;
  }
  snapshot() {
    return {
      ...this.counters,
      closed: this.closed,
      failed: this.failed,
      inFlight: this.flight ? 1 : 0,
      inFlightBytes: this.flight?.bytes ?? 0,
      pendingPacketBytes: this.pendingPacket?.encoded.length ?? 0,
      pendingState: Boolean(this.pendingState),
      pendingConfig: Boolean(this.pendingConfig),
      recoveryPending: this.recoveryEpoch !== undefined,
      nextSequence: this.sequence,
    };
  }
}
