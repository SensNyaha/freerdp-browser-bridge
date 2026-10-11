import {
  Kind,
  decodeOpusAudioState,
  decodeOpusAudioConfig,
  decodeOpusAudioPacket,
  validateOpusAudioConfig,
  validateOpusAudioPacket,
  type OpusAudioConfig,
  type OpusAudioPacket,
} from '@freerdp-bridge/protocol';
import { AudioSource, type AudioSourceEvent } from './audio-source.js';

export type OpusSourceEvent = AudioSourceEvent<
  OpusAudioConfig,
  OpusAudioPacket
>;

const profile = Object.freeze({
  packetKind: Kind.AudioOpus,
  decodeState: decodeOpusAudioState,
  decodeConfig: decodeOpusAudioConfig,
  decodePacket: decodeOpusAudioPacket,
  validateConfig: validateOpusAudioConfig,
  validatePacket: validateOpusAudioPacket,
});

/** Isolated compressed source owner; no worker/public activation or packet queue. */
export class OpusSource extends AudioSource<OpusAudioConfig, OpusAudioPacket> {
  constructor() {
    super(profile);
  }
}
