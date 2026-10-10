import { ProtocolError } from './index.js';

export const OPUS_AUDIO_CONFIG_BYTES = 20;
export const OPUS_AUDIO_METADATA_BYTES = 24;
export const OPUS_AUDIO_MIN_PAYLOAD_BYTES = 2;
export const OPUS_AUDIO_MAX_PAYLOAD_BYTES = 1275;
export const OPUS_AUDIO_MIN_PACKET_BYTES = 26;
export const OPUS_AUDIO_MAX_PACKET_BYTES = 1299;
const MAX_TIMESTAMP = 0xffffffffffffffffn - 20000n;
const TWENTY_MS_CONFIGS: readonly number[] = [1, 5, 9, 13, 15, 19, 23, 27, 31];

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
