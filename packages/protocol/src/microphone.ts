import { ProtocolError } from './index.js';
export {
  encodeAudioReset as encodeMicrophoneReset,
  decodeAudioReset as decodeMicrophoneReset,
  encodeAudioResetResult as encodeMicrophoneResetResult,
  decodeAudioResetResult as decodeMicrophoneResetResult,
  AUDIO_RESET_REQUEST_BYTES as MICROPHONE_RESET_REQUEST_BYTES,
  AUDIO_RESET_RESULT_BYTES as MICROPHONE_RESET_RESULT_BYTES,
} from './audio-reset.js';
export type { AudioResetResult as MicrophoneResetResult } from './audio-reset.js';
import {
  PCM_AUDIO_PACKET_BYTES,
  encodePcmAudioPacket,
  decodePcmAudioPacket,
  PCM_AUDIO_STATE_BYTES,
  encodePcmAudioState,
  decodePcmAudioState,
  validatePcmAudioStateProgress,
  validatePcmAudioPacket,
  type PcmAudioState,
} from './audio.js';

export const MICROPHONE_PCM_BYTES = PCM_AUDIO_PACKET_BYTES;
export const MICROPHONE_RESULT_BYTES = 4;
export const MICROPHONE_STATE_BYTES = PCM_AUDIO_STATE_BYTES;
export const MICROPHONE_RECORD_BYTES = 3876;
export interface MicrophoneRecord extends MicrophonePcmPacket {
  sequence: number;
}
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

/** Preparatory client-to-server RWB1 type 7, stream 4. No permission/lease activation. */
export function encodeMicrophoneRecord(
  packet: MicrophonePcmPacket,
  sequence: number,
): Buffer {
  if (
    !packet ||
    !Number.isInteger(sequence) ||
    sequence < 1 ||
    sequence > 0xffffffff
  )
    throw new ProtocolError();
  validatePcmAudioPacket({ ...packet, frames: 960, silenceFrames: 0 });
  const bytes = Buffer.alloc(MICROPHONE_RECORD_BYTES);
  bytes.write('RWB1');
  bytes[4] = 1;
  bytes[5] = 7;
  bytes.writeUInt16BE(packet.discontinuity ? 2 : 0, 6);
  bytes.writeUInt32BE(4, 8);
  bytes.writeUInt32BE(sequence, 12);
  bytes.writeBigUInt64BE(packet.timestampUs, 16);
  bytes.writeUInt32BE(3848, 24);
  bytes.writeBigUInt64BE(packet.epoch, 28);
  packet.pcm.copy(bytes, 36);
  return bytes;
}

/** Borrowed PCM after exact framing validation; authority/progress belong to the lease owner. */
export function decodeMicrophoneRecord(bytes: Buffer): MicrophoneRecord {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length !== MICROPHONE_RECORD_BYTES ||
    bytes.readUInt32BE(0) !== 0x52574231 ||
    bytes[4] !== 1 ||
    bytes[5] !== 7 ||
    ![0, 2].includes(bytes.readUInt16BE(6)) ||
    bytes.readUInt32BE(8) !== 4 ||
    bytes.readUInt32BE(12) === 0 ||
    bytes.readUInt32BE(24) !== 3848
  )
    throw new ProtocolError();
  const packet = {
    epoch: bytes.readBigUInt64BE(28),
    timestampUs: bytes.readBigUInt64BE(16),
    discontinuity: bytes.readUInt16BE(6) === 2,
    pcm: bytes.subarray(36),
    sequence: bytes.readUInt32BE(12),
  };
  validatePcmAudioPacket({ ...packet, frames: 960, silenceFrames: 0 });
  return packet;
}
