import {
  ProtocolError,
  encodePcmAudioStateRecord,
  encodePcmAudioConfigRecord,
  encodePcmAudioRecords,
  type PcmAudioState,
  type PcmAudioConfig,
  type PcmAudioPacket,
} from '@freerdp-bridge/protocol';
import { PcmSource, type PcmSourceEvent } from './pcm-source.js';

export type PcmDeliveryResult =
  | 'idle'
  | 'sent'
  | 'blocked'
  | 'invalid'
  | 'closed'
  | 'failed';
export interface PcmDeliverySnapshot {
  state?: PcmAudioState;
  config?: PcmAudioConfig;
}
/** Preparatory ordered transport owner. One receiver credit; no socket/timer selection. */
export class PcmMediaSender {
  private readonly source = new PcmSource();
  private pendingState: PcmAudioState | undefined;
  private pendingConfig: PcmAudioConfig | undefined;
  private pendingPacket: PcmAudioPacket | undefined;
  private wireConfig: PcmAudioConfig | undefined;
  private flight:
    | { sequence: number; deadline: number; bytes: number }
    | undefined;
  private sequence: number;
  private observed: number | undefined;
  private boundary = true;
  private replay = false;
  private busy = false;
  private closed = false;
  private failed = false;
  private readonly counters = {
    offered: 0,
    sentStates: 0,
    sentConfigs: 0,
    sentPackets: 0,
    acknowledgements: 0,
    replacedPackets: 0,
    discardedPackets: 0,
    invalidCalls: 0,
  };
  constructor(
    initial: PcmDeliverySnapshot = {},
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
    if (initial.config) {
      this.offer({ type: 'config', config: initial.config });
      this.replay = true; // An attachment may join an already running source epoch.
    }
    if (this.failed) throw new ProtocolError();
  }
  private count(name: keyof PcmMediaSender['counters']) {
    if (this.counters[name] < Number.MAX_SAFE_INTEGER) this.counters[name]++;
  }
  private discardPacket() {
    if (this.pendingPacket) {
      this.pendingPacket.pcm.fill(0);
      this.pendingPacket = undefined;
    }
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
  offer(event: PcmSourceEvent): boolean {
    if (this.closed || this.busy) {
      this.count('invalidCalls');
      return false;
    }
    try {
      const incoming =
        this.replay && event?.type === 'packet'
          ? {
              type: 'packet' as const,
              packet: { ...event.packet, discontinuity: true },
            }
          : event;
      const accepted = this.source.acceptEvent(incoming);
      if (accepted.type === 'state') {
        if (this.pendingPacket) this.count('discardedPackets');
        this.discardPacket();
        this.pendingConfig = this.wireConfig = undefined;
        this.pendingState = accepted.state;
        this.boundary = true;
        this.replay = false;
      } else if (accepted.type === 'config')
        this.pendingConfig = accepted.config;
      else {
        const owned = {
          ...accepted.packet,
          pcm: Buffer.from(accepted.packet.pcm),
        };
        if (this.pendingPacket) {
          this.count('replacedPackets');
          this.boundary = true;
        }
        this.discardPacket();
        this.pendingPacket = owned;
        this.replay = false;
      }
      this.count('offered');
      return true;
    } catch {
      this.fail();
      return false;
    }
  }
  /** True admission means the consumer copied this record into bounded ordered storage. */
  pump(now: number, send: (record: Buffer) => boolean): PcmDeliveryResult {
    if (this.failed) return 'failed';
    if (this.closed) return 'closed';
    if (this.busy || typeof send !== 'function' || !this.clock(now))
      return 'invalid';
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
          ? encodePcmAudioStateRecord(this.pendingState!, this.sequence)
          : type === 'config'
            ? encodePcmAudioConfigRecord(
                this.pendingConfig!,
                this.pendingPacket!.timestampUs,
                this.sequence,
              )
            : encodePcmAudioRecords(
                this.wireConfig!,
                {
                  ...this.pendingPacket!,
                  discontinuity:
                    this.boundary || this.pendingPacket!.discontinuity,
                },
                this.sequence,
                false,
              )[0]!;
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
        this.boundary = false;
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
    this.discardPacket();
    this.pendingState = this.pendingConfig = this.wireConfig = undefined;
    this.flight = undefined;
  }
  snapshot() {
    return {
      ...this.counters,
      closed: this.closed,
      failed: this.failed,
      inFlight: this.flight ? 1 : 0,
      inFlightBytes: this.flight?.bytes ?? 0,
      pendingPacketBytes: this.pendingPacket?.pcm.length ?? 0,
      pendingState: Boolean(this.pendingState),
      pendingConfig: Boolean(this.pendingConfig),
      nextSequence: this.sequence,
    };
  }
}
