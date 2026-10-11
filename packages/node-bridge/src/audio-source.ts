import {
  Kind,
  ProtocolError,
  validatePcmAudioStateProgress,
  type PcmAudioState,
} from '@freerdp-bridge/protocol';

interface Configuration {
  epoch: bigint;
}
interface SamplePacket {
  epoch: bigint;
  timestampUs: bigint;
  discontinuity: boolean;
}
export type AudioSourceEvent<C, P> =
  | { type: 'state'; state: PcmAudioState }
  | { type: 'config'; config: C }
  | { type: 'packet'; packet: P };
export interface AudioSourceProfile<C, P> {
  readonly packetKind: Kind;
  readonly decodeState: (bytes: Buffer) => PcmAudioState;
  readonly decodeConfig: (bytes: Buffer) => C;
  readonly decodePacket: (bytes: Buffer) => P;
  readonly validateConfig: (config: C) => void;
  readonly validatePacket: (packet: P) => void;
}

/** Serialized source clock/epoch owner. Retains scalar metadata, never samples. */
export class AudioSource<C extends Configuration, P extends SamplePacket> {
  private state: PcmAudioState | undefined;
  private config: C | undefined;
  private configuredEpoch = 0n;
  private timestamp: bigint | undefined;
  private boundary = true;

  constructor(private readonly profile: AudioSourceProfile<C, P>) {}

  get current(): PcmAudioState | undefined {
    return this.state ? { ...this.state } : undefined;
  }
  get configuration(): C | undefined {
    return this.config ? { ...this.config } : undefined;
  }
  accept(kind: Kind, bytes: Buffer): AudioSourceEvent<C, P> {
    if (kind === Kind.AudioState)
      return this.acceptEvent({
        type: 'state',
        state: this.profile.decodeState(bytes),
      });
    if (kind === Kind.AudioConfig)
      return this.acceptEvent({
        type: 'config',
        config: this.profile.decodeConfig(bytes),
      });
    if (kind === this.profile.packetKind)
      return this.acceptEvent({
        type: 'packet',
        packet: this.profile.decodePacket(bytes),
      });
    throw new ProtocolError();
  }
  acceptEvent(event: AudioSourceEvent<C, P>): AudioSourceEvent<C, P> {
    if (!event) throw new ProtocolError();
    if (event.type === 'state') {
      const state = event.state;
      validatePcmAudioStateProgress(this.state, state);
      if (!state.enabled || state.epoch < this.configuredEpoch)
        throw new ProtocolError();
      this.state = { ...state };
      this.config = undefined;
      this.boundary = true;
      return { type: 'state', state: { ...state } };
    }
    if (!this.state || this.state.availability !== 'ready')
      throw new ProtocolError();
    if (event.type === 'config') {
      const config = event.config;
      this.profile.validateConfig(config);
      if (
        this.config ||
        config.epoch !== this.state.epoch ||
        config.epoch <= this.configuredEpoch
      )
        throw new ProtocolError();
      this.config = { ...config };
      this.configuredEpoch = config.epoch;
      return { type: 'config', config: { ...config } };
    }
    if (event.type !== 'packet' || !this.config) throw new ProtocolError();
    const packet = event.packet;
    this.profile.validatePacket(packet);
    if (
      packet.epoch !== this.config.epoch ||
      (this.boundary && !packet.discontinuity) ||
      (this.timestamp !== undefined &&
        (packet.timestampUs <= this.timestamp ||
          (!packet.discontinuity &&
            packet.timestampUs !== this.timestamp + 20000n)))
    )
      throw new ProtocolError();
    this.timestamp = packet.timestampUs;
    this.boundary = false;
    return { type: 'packet', packet: { ...packet } }; // Borrowed bytes only for this dispatch.
  }
}
