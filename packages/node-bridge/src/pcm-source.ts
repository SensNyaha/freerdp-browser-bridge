import {
  Kind,
  ProtocolError,
  decodePcmAudioState,
  validatePcmAudioStateProgress,
  decodePcmAudioConfig,
  decodePcmAudioPacket,
  validatePcmAudioConfig,
  validatePcmAudioPacket,
  type PcmAudioState,
  type PcmAudioConfig,
  type PcmAudioPacket,
} from '@freerdp-bridge/protocol';

export type PcmSourceEvent =
  | { type: 'state'; state: PcmAudioState }
  | { type: 'config'; config: PcmAudioConfig }
  | { type: 'packet'; packet: PcmAudioPacket };

/** Serialized IPC/backend validation. Retains scalar metadata, never PCM packets. */
export class PcmSource {
  private state: PcmAudioState | undefined;
  private config: PcmAudioConfig | undefined;
  private configuredEpoch = 0n;
  private timestamp: bigint | undefined;
  private boundary = true;

  get current(): PcmAudioState | undefined {
    return this.state ? { ...this.state } : undefined;
  }
  get configuration(): PcmAudioConfig | undefined {
    return this.config ? { ...this.config } : undefined;
  }
  accept(kind: Kind, bytes: Buffer): PcmSourceEvent {
    if (kind === Kind.AudioState)
      return this.acceptEvent({
        type: 'state',
        state: decodePcmAudioState(bytes),
      });
    if (kind === Kind.AudioConfig)
      return this.acceptEvent({
        type: 'config',
        config: decodePcmAudioConfig(bytes),
      });
    if (kind === Kind.AudioPcm)
      return this.acceptEvent({
        type: 'packet',
        packet: decodePcmAudioPacket(bytes),
      });
    throw new ProtocolError();
  }
  acceptEvent(event: PcmSourceEvent): PcmSourceEvent {
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
      validatePcmAudioConfig(config);
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
    validatePcmAudioPacket(packet);
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
    return { type: 'packet', packet: { ...packet } }; // PCM borrows caller storage during dispatch.
  }
}
