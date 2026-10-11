import { ProtocolError } from './index.js';
import {
  PCM_AUDIO_PACKET_BYTES,
  encodePcmAudioPacket,
  decodePcmAudioPacket,
  PCM_AUDIO_STATE_BYTES,
  encodePcmAudioState,
  decodePcmAudioState,
  validatePcmAudioStateProgress,
  type PcmAudioState,
} from './audio.js';

export const MICROPHONE_PCM_BYTES = PCM_AUDIO_PACKET_BYTES;
export const MICROPHONE_RESULT_BYTES = 4;
export const MICROPHONE_STATE_BYTES = PCM_AUDIO_STATE_BYTES;
export type MicrophoneState = PcmAudioState;
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

/** Private PCM input codec. Does not grant device capture permission. */
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
/** Input readiness, independent of output playback and device permission. */
export function encodeMicrophoneState(state: MicrophoneState): Buffer {
  return encodePcmAudioState(state);
}
export function decodeMicrophoneState(bytes: Buffer): MicrophoneState {
  if (!Buffer.isBuffer(bytes)) throw new ProtocolError();
  return decodePcmAudioState(bytes);
}
export function validateMicrophoneStateProgress(
  previous: MicrophoneState | undefined,
  state: MicrophoneState,
): void {
  validatePcmAudioStateProgress(previous, state);
}
