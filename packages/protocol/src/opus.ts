import { ProtocolError } from './index.js';
import {
  encodePcmAudioState,
  decodePcmAudioState,
  type PcmAudioState,
} from './audio.js';

export const OPUS_AUDIO_CONFIG_BYTES = 20;
export const OPUS_AUDIO_STATE_BYTES = 40;
export const OPUS_AUDIO_METADATA_BYTES = 24;
export const OPUS_AUDIO_MIN_PAYLOAD_BYTES = 2;
export const OPUS_AUDIO_MAX_PAYLOAD_BYTES = 1275;
export const OPUS_AUDIO_MIN_PACKET_BYTES = 26;
export const OPUS_AUDIO_MAX_PACKET_BYTES = 1299;
const MAX_TIMESTAMP = 0xffffffffffffffffn - 20000n;
const TWENTY_MS_CONFIGS: readonly number[] = [1, 5, 9, 13, 15, 19, 23, 27, 31];
export type OpusAudioState = PcmAudioState;

export interface OpusAudioConfig {
  codec: 'opus';
  epoch: bigint;
  sampleRate: 48000;
  channels: 2;
  packetFrames: 960;
  lookaheadFrames: number;
}
export interface OpusAudioPacket {
  epoch: bigint;
  timestampUs: bigint;
  frames: number;
  silenceFrames: number;
  discontinuity: boolean;
  encoded: Buffer;
}
function epoch(value: bigint): boolean {
  return (
    typeof value === 'bigint' && value > 0n && value <= 0xffffffffffffffffn
  );
}
/** Restricted bridge profile, not a general Opus entropy decoder. */
export function validateOpusAudioPayload(bytes: Buffer): void {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length < OPUS_AUDIO_MIN_PAYLOAD_BYTES ||
    bytes.length > OPUS_AUDIO_MAX_PAYLOAD_BYTES ||
    (bytes[0]! & 7) !== 4 ||
    !TWENTY_MS_CONFIGS.includes(bytes[0]! >>> 3)
  )
    throw new ProtocolError();
}
export function validateOpusAudioConfig(config: OpusAudioConfig): void {
  if (
    !config ||
    !epoch(config.epoch) ||
    config.codec !== 'opus' ||
    config.sampleRate !== 48000 ||
    config.channels !== 2 ||
    config.packetFrames !== 960 ||
    !Number.isInteger(config.lookaheadFrames) ||
    config.lookaheadFrames < 0 ||
    config.lookaheadFrames > 960
  )
    throw new ProtocolError();
}
export function validateOpusAudioPacket(packet: OpusAudioPacket): void {
  if (
    !packet ||
    !epoch(packet.epoch) ||
    typeof packet.timestampUs !== 'bigint' ||
    packet.timestampUs < 0n ||
    packet.timestampUs > MAX_TIMESTAMP ||
    !Number.isInteger(packet.frames) ||
    packet.frames < 0 ||
    packet.frames > 960 ||
    !Number.isInteger(packet.silenceFrames) ||
    packet.silenceFrames < 0 ||
    packet.silenceFrames > 960 ||
    packet.frames + packet.silenceFrames !== 960 ||
    typeof packet.discontinuity !== 'boolean'
  )
    throw new ProtocolError();
  validateOpusAudioPayload(packet.encoded);
}
export function encodeOpusAudioConfig(config: OpusAudioConfig): Buffer {
  validateOpusAudioConfig(config);
  const bytes = Buffer.alloc(OPUS_AUDIO_CONFIG_BYTES);
  bytes.set([1, 1, 2, 0]);
  bytes.writeUInt32BE(48000, 4);
  bytes.writeUInt16BE(960, 8);
  bytes.writeUInt16BE(config.lookaheadFrames, 10);
  bytes.writeBigUInt64BE(config.epoch, 12);
  return bytes;
}
export function decodeOpusAudioConfig(bytes: Buffer): OpusAudioConfig {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length !== OPUS_AUDIO_CONFIG_BYTES ||
    bytes[0] !== 1 ||
    bytes[1] !== 1 ||
    bytes[2] !== 2 ||
    bytes[3] !== 0 ||
    bytes.readUInt32BE(4) !== 48000 ||
    bytes.readUInt16BE(8) !== 960
  )
    throw new ProtocolError();
  const config: OpusAudioConfig = {
    codec: 'opus',
    epoch: bytes.readBigUInt64BE(12),
    sampleRate: 48000,
    channels: 2,
    packetFrames: 960,
    lookaheadFrames: bytes.readUInt16BE(10),
  };
  validateOpusAudioConfig(config);
  return config;
}
export function encodeOpusAudioPacket(packet: OpusAudioPacket): Buffer {
  validateOpusAudioPacket(packet); // Bound before allocation/copy.
  const bytes = Buffer.alloc(OPUS_AUDIO_METADATA_BYTES + packet.encoded.length);
  bytes[0] = 1;
  bytes[1] = packet.discontinuity ? 2 : 0;
  bytes.writeUInt16BE(packet.frames, 2);
  bytes.writeUInt16BE(packet.silenceFrames, 4);
  bytes.writeBigUInt64BE(packet.epoch, 8);
  bytes.writeBigUInt64BE(packet.timestampUs, 16);
  packet.encoded.copy(bytes, OPUS_AUDIO_METADATA_BYTES);
  return bytes;
}
/** Encoded bytes borrow input; no decoder or sample history is retained. */
export function decodeOpusAudioPacket(bytes: Buffer): OpusAudioPacket {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length < OPUS_AUDIO_MIN_PACKET_BYTES ||
    bytes.length > OPUS_AUDIO_MAX_PACKET_BYTES ||
    bytes[0] !== 1 ||
    (bytes[1] !== 0 && bytes[1] !== 2) ||
    bytes.readUInt16BE(6) !== 0
  )
    throw new ProtocolError();
  const packet: OpusAudioPacket = {
    epoch: bytes.readBigUInt64BE(8),
    timestampUs: bytes.readBigUInt64BE(16),
    frames: bytes.readUInt16BE(2),
    silenceFrames: bytes.readUInt16BE(4),
    discontinuity: bytes[1] === 2,
    encoded: bytes.subarray(OPUS_AUDIO_METADATA_BYTES),
  };
  validateOpusAudioPacket(packet);
  return packet;
}
export function encodeOpusAudioState(state: OpusAudioState): Buffer {
  const bytes = encodePcmAudioState(state); // Common source semantics validate first.
  if (state.enabled) bytes.set([1, 2, 0], 28);
  return bytes;
}
export function decodeOpusAudioState(bytes: Buffer): OpusAudioState {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length !== OPUS_AUDIO_STATE_BYTES ||
    bytes[2]! > 1 ||
    bytes[28] !== (bytes[2] ? 1 : 0) ||
    bytes[30] !== 0
  )
    throw new ProtocolError();
  const normalized = Buffer.from(bytes); // Fixed metadata only, after length/profile bounds.
  if (bytes[2]) {
    normalized[28] = 2;
    normalized[30] = 1;
  }
  return decodePcmAudioState(normalized);
}
function validateRecordTime(timestampUs: bigint, sequence: number): void {
  if (
    typeof timestampUs !== 'bigint' ||
    timestampUs < 0n ||
    timestampUs > MAX_TIMESTAMP ||
    !Number.isInteger(sequence) ||
    sequence < 0 ||
    sequence > 0xffffffff
  )
    throw new ProtocolError();
}
function record(
  type: number,
  flags: number,
  payload: Buffer,
  timestampUs: bigint,
  sequence: number,
): Buffer {
  const bytes = Buffer.alloc(28 + payload.length);
  bytes.write('RWB1');
  bytes[4] = 1;
  bytes[5] = type;
  bytes.writeUInt16BE(flags, 6);
  bytes.writeUInt32BE(3, 8);
  bytes.writeUInt32BE(sequence, 12);
  bytes.writeBigUInt64BE(timestampUs, 16);
  bytes.writeUInt32BE(payload.length, 24);
  payload.copy(bytes, 28);
  return bytes;
}
export function encodeOpusAudioConfigRecord(
  config: OpusAudioConfig,
  timestampUs: bigint,
  sequence: number,
): Buffer {
  validateOpusAudioConfig(config);
  validateRecordTime(timestampUs, sequence);
  return record(3, 2, encodeOpusAudioConfig(config), timestampUs, sequence);
}
export function encodeOpusAudioPacketRecord(
  packet: OpusAudioPacket,
  sequence: number,
): Buffer {
  validateOpusAudioPacket(packet);
  validateRecordTime(packet.timestampUs, sequence);
  return record(
    4,
    packet.discontinuity ? 2 : 0,
    packet.encoded,
    packet.timestampUs,
    sequence,
  );
}
export function encodeOpusAudioStateRecord(
  state: OpusAudioState,
  sequence: number,
): Buffer {
  if (!state) throw new ProtocolError();
  validateRecordTime(state.timestampUs, sequence);
  return record(9, 2, encodeOpusAudioState(state), state.timestampUs, sequence);
}
