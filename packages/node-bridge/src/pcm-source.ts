import {
  Kind,
  ProtocolError,
  decodePcmAudioState,
  validatePcmAudioStateProgress,
  decodePcmAudioConfig,
  decodePcmAudioPacket,
  type PcmAudioState,
  type PcmAudioConfig,
  type PcmAudioPacket,
} from '@freerdp-bridge/protocol';

export type PcmSourceEvent =
  | { type: 'state'; state: PcmAudioState }
  | { type: 'config'; config: PcmAudioConfig }
  | { type: 'packet'; packet: PcmAudioPacket };

/** Serialized private IPC validation. Retains scalar metadata, never PCM packets. */
export class PcmSource {
  private state: PcmAudioState | undefined;
  private config: PcmAudioConfig | undefined;
  private configuredEpoch = 0n;
  private timestamp: bigint | undefined;
  private boundary = true;

  get current(): PcmAudioState | undefined {
    return this.state ? { ...this.state } : undefined;
  }
  accept(kind: Kind, bytes: Buffer): PcmSourceEvent {
    if (kind === Kind.AudioState) {
      const state = decodePcmAudioState(bytes);
      validatePcmAudioStateProgress(this.state, state);
      if (!state.enabled || state.epoch < this.configuredEpoch)
        throw new ProtocolError();
      this.state = state;
      this.config = undefined;
      this.boundary = true;
      return { type: 'state', state: { ...state } };
    }
    if (!this.state || this.state.availability !== 'ready')
      throw new ProtocolError();
    if (kind === Kind.AudioConfig) {
      const config = decodePcmAudioConfig(bytes);
      if (
        this.config ||
        config.epoch !== this.state.epoch ||
        config.epoch <= this.configuredEpoch
      )
        throw new ProtocolError();
      this.config = config;
      this.configuredEpoch = config.epoch;
      return { type: 'config', config: { ...config } };
    }
    if (kind !== Kind.AudioPcm || !this.config) throw new ProtocolError();
    const packet = decodePcmAudioPacket(bytes);
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
    return { type: 'packet', packet }; // PCM borrows this bounded parser record.
  }
}
