import { ProtocolError } from './index.js';
import {
  PCM_AUDIO_PACKET_BYTES,
  encodePcmAudioPacket,
  decodePcmAudioPacket,
} from './audio.js';

export const MICROPHONE_PCM_BYTES = PCM_AUDIO_PACKET_BYTES;
export const MICROPHONE_RESULT_BYTES = 4;
export interface MicrophonePcmPacket {
  epoch: bigint;
  timestampUs: bigint;
  discontinuity: boolean;
  pcm: Buffer;
}
const results = [
  'accepted',
  'stale',
  'unavailable',
  'busy',
  'invalid',
] as const;
export type MicrophoneResult = (typeof results)[number];

/** Preparatory private codec. No worker/permission/capture activation. */
export function encodeMicrophonePcm(packet: MicrophonePcmPacket): Buffer {
  if (!packet) throw new ProtocolError();
  return encodePcmAudioPacket({ ...packet, frames: 960, silenceFrames: 0 });
}
/** PCM borrows validated input storage; no retained decoder queue. */
export function decodeMicrophonePcm(bytes: Buffer): MicrophonePcmPacket {
  if (!Buffer.isBuffer(bytes)) throw new ProtocolError();
  const packet = decodePcmAudioPacket(bytes);
  if (packet.frames !== 960 || packet.silenceFrames !== 0)
    throw new ProtocolError();
  return {
    epoch: packet.epoch,
    timestampUs: packet.timestampUs,
    discontinuity: packet.discontinuity,
    pcm: packet.pcm,
  };
}
export function encodeMicrophoneResult(result: MicrophoneResult): Buffer {
  const code = results.indexOf(result);
  if (code < 0) throw new ProtocolError();
  return Buffer.from([1, code, 0, 0]);
}
export function decodeMicrophoneResult(bytes: Buffer): MicrophoneResult {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length !== MICROPHONE_RESULT_BYTES ||
    bytes[0] !== 1 ||
    bytes[2] !== 0 ||
    bytes[3] !== 0
  )
    throw new ProtocolError();
  const result = results[bytes[1]!];
  if (!result) throw new ProtocolError();
  return result;
}
