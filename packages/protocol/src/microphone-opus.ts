import { ProtocolError } from './index.js';
import { validateOpusAudioPayload } from './opus.js';

export const MICROPHONE_OPUS_MIN_BYTES = 26;
export const MICROPHONE_OPUS_MAX_BYTES = 1299;
export const MICROPHONE_OPUS_MIN_RECORD_BYTES = 42;
export const MICROPHONE_OPUS_MAX_RECORD_BYTES = 1315;
export interface MicrophoneOpusPacket {
  epoch: bigint;
  timestampUs: bigint;
  discontinuity: boolean;
  lookaheadFrames: number;
  encoded: Buffer;
}
export interface MicrophoneOpusRecord extends MicrophoneOpusPacket {
  sequence: number;
}
export function validateMicrophoneOpus(packet: MicrophoneOpusPacket): void {
  if (
    !packet ||
    typeof packet.epoch !== 'bigint' ||
    packet.epoch < 1n ||
    packet.epoch > 0xffffffffffffffffn ||
    typeof packet.timestampUs !== 'bigint' ||
    packet.timestampUs < 0n ||
    packet.timestampUs > 0xffffffffffffffffn - 20000n ||
    typeof packet.discontinuity !== 'boolean' ||
    !Number.isInteger(packet.lookaheadFrames) ||
    packet.lookaheadFrames < 0 ||
    packet.lookaheadFrames > 960 ||
    !Buffer.isBuffer(packet.encoded) ||
    !(packet.encoded.buffer instanceof ArrayBuffer)
  )
    throw new ProtocolError();
  validateOpusAudioPayload(packet.encoded);
}
/** Prepared private payload only: no RWI1 kind/worker dispatch is assigned. */
export function encodeMicrophoneOpus(packet: MicrophoneOpusPacket): Buffer {
  validateMicrophoneOpus(packet);
  const bytes = Buffer.alloc(24 + packet.encoded.length);
  bytes[0] = 1;
  bytes[1] = packet.discontinuity ? 2 : 0;
  bytes.writeUInt16BE(960, 2);
  bytes.writeUInt16BE(packet.lookaheadFrames, 6);
  bytes.writeBigUInt64BE(packet.epoch, 8);
  bytes.writeBigUInt64BE(packet.timestampUs, 16);
  packet.encoded.copy(bytes, 24);
  return bytes;
}
/** Encoded storage is borrowed; this performs no entropy decoding or state admission. */
export function decodeMicrophoneOpus(bytes: Buffer): MicrophoneOpusPacket {
  if (
    !Buffer.isBuffer(bytes) ||
    !(bytes.buffer instanceof ArrayBuffer) ||
    bytes.length < MICROPHONE_OPUS_MIN_BYTES ||
    bytes.length > MICROPHONE_OPUS_MAX_BYTES ||
    bytes[0] !== 1 ||
    (bytes[1] !== 0 && bytes[1] !== 2) ||
    bytes.readUInt16BE(2) !== 960 ||
    bytes.readUInt16BE(4) !== 0
  )
    throw new ProtocolError();
  const packet = {
    epoch: bytes.readBigUInt64BE(8),
    timestampUs: bytes.readBigUInt64BE(16),
    discontinuity: bytes[1] === 2,
    lookaheadFrames: bytes.readUInt16BE(6),
    encoded: bytes.subarray(24),
  };
  validateMicrophoneOpus(packet);
  return packet;
}
/** Prepared client-to-server RWB1 type 10/stream 4. No capture/lease activation. */
export function encodeMicrophoneOpusRecord(
  packet: MicrophoneOpusPacket,
  sequence: number,
): Buffer {
  validateMicrophoneOpus(packet);
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 0xffffffff)
    throw new ProtocolError();
  const bytes = Buffer.alloc(40 + packet.encoded.length);
  bytes.write('RWB1');
  bytes[4] = 1;
  bytes[5] = 10;
  bytes.writeUInt16BE(packet.discontinuity ? 2 : 0, 6);
  bytes.writeUInt32BE(4, 8);
  bytes.writeUInt32BE(sequence, 12);
  bytes.writeBigUInt64BE(packet.timestampUs, 16);
  bytes.writeUInt32BE(12 + packet.encoded.length, 24);
  bytes.writeBigUInt64BE(packet.epoch, 28);
  bytes.writeUInt16BE(packet.lookaheadFrames, 36);
  packet.encoded.copy(bytes, 40);
  return bytes;
}
export function decodeMicrophoneOpusRecord(
  bytes: Buffer,
): MicrophoneOpusRecord {
  if (
    !Buffer.isBuffer(bytes) ||
    !(bytes.buffer instanceof ArrayBuffer) ||
    bytes.length < MICROPHONE_OPUS_MIN_RECORD_BYTES ||
    bytes.length > MICROPHONE_OPUS_MAX_RECORD_BYTES ||
    bytes.readUInt32BE(0) !== 0x52574231 ||
    bytes[4] !== 1 ||
    bytes[5] !== 10 ||
    ![0, 2].includes(bytes.readUInt16BE(6)) ||
    bytes.readUInt32BE(8) !== 4 ||
    bytes.readUInt32BE(12) === 0 ||
    bytes.readUInt32BE(24) !== bytes.length - 28 ||
    bytes.readUInt16BE(38) !== 0
  )
    throw new ProtocolError();
  const packet = {
    epoch: bytes.readBigUInt64BE(28),
    timestampUs: bytes.readBigUInt64BE(16),
    discontinuity: bytes.readUInt16BE(6) === 2,
    lookaheadFrames: bytes.readUInt16BE(36),
    sequence: bytes.readUInt32BE(12),
    encoded: bytes.subarray(40),
  };
  validateMicrophoneOpus(packet);
  return packet;
}
