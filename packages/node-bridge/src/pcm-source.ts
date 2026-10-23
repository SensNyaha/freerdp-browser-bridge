import {
  Kind,
  decodePcmAudioState,
  decodePcmAudioConfig,
  decodePcmAudioPacket,
  validatePcmAudioConfig,
  validatePcmAudioPacket,
  type PcmAudioConfig,
  type PcmAudioPacket,
} from '@freerdp-bridge/protocol';
import { AudioSource, type AudioSourceEvent } from './audio-source.js';

export type PcmSourceEvent = AudioSourceEvent<PcmAudioConfig, PcmAudioPacket>;

const profile = Object.freeze({
  packetKind: Kind.AudioPcm,
  decodeState: decodePcmAudioState,
  decodeConfig: decodePcmAudioConfig,
  decodePacket: decodePcmAudioPacket,
  validateConfig: validatePcmAudioConfig,
  validatePacket: validatePcmAudioPacket,
});

/** Serialized IPC/backend validation. Retains scalar metadata, never PCM packets. */
export class PcmSource extends AudioSource<PcmAudioConfig, PcmAudioPacket> {
  constructor() {
    super(profile);
  }
}
