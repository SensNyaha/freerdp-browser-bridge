import { ProtocolError } from './index.js';

export const PCM_AUDIO_CONFIG_BYTES = 20;
export const PCM_AUDIO_STATE_BYTES = 40;
export const PCM_AUDIO_METADATA_BYTES = 24;
export const PCM_AUDIO_FRAMES = 960;
export const PCM_AUDIO_BYTES = PCM_AUDIO_FRAMES * 4;
export const PCM_AUDIO_PACKET_BYTES =
  PCM_AUDIO_METADATA_BYTES + PCM_AUDIO_BYTES;
const MAX_TIMESTAMP_US = 0xffffffffffffffffn - 20000n;
const availability = [
  'unavailable',
  'waiting',
  'ready',
  'suspended',
  'closed',
  'failed',
] as const;
export interface PcmAudioState {
  enabled: boolean;
  availability: (typeof availability)[number];
  revision: bigint;
  epoch: bigint;
  timestampUs: bigint;
}
function validateState(state: PcmAudioState): void {
  if (
    !state ||
    typeof state.enabled !== 'boolean' ||
    !availability.includes(state.availability) ||
    !epoch(state.revision) ||
    typeof state.epoch !== 'bigint' ||
    state.epoch < 0n ||
    state.epoch > 0xffffffffffffffffn ||
    typeof state.timestampUs !== 'bigint' ||
    state.timestampUs < 0n ||
    state.timestampUs > MAX_TIMESTAMP_US ||
    (!state.enabled &&
      (state.availability !== 'unavailable' || state.epoch !== 0n)) ||
    (state.availability === 'ready' && state.epoch === 0n)
  )
    throw new ProtocolError();
}
export function encodePcmAudioState(state: PcmAudioState): Buffer {
  validateState(state);
  const bytes = Buffer.alloc(PCM_AUDIO_STATE_BYTES);
  bytes.writeUInt16BE(1, 0);
  bytes[2] = state.enabled ? 1 : 0;
  bytes[3] = availability.indexOf(state.availability);
  bytes.writeBigUInt64BE(state.revision, 4);
  bytes.writeBigUInt64BE(state.epoch, 12);
  bytes.writeBigUInt64BE(state.timestampUs, 20);
  if (state.enabled) {
    bytes.set([2, 2, 1], 28);
    bytes.writeUInt32BE(48000, 32);
    bytes.writeUInt16BE(960, 36);
  }
  return bytes;
}
export function decodePcmAudioState(bytes: Buffer): PcmAudioState {
  if (
    bytes.length !== PCM_AUDIO_STATE_BYTES ||
    bytes.readUInt16BE(0) !== 1 ||
    bytes[2]! > 1 ||
    bytes[31] !== 0 ||
    bytes.readUInt16BE(38) !== 0
  )
    throw new ProtocolError();
  const enabled = bytes[2] === 1;
  if (
    bytes[28] !== (enabled ? 2 : 0) ||
    bytes[29] !== (enabled ? 2 : 0) ||
    bytes[30] !== (enabled ? 1 : 0) ||
    bytes.readUInt32BE(32) !== (enabled ? 48000 : 0) ||
    bytes.readUInt16BE(36) !== (enabled ? 960 : 0)
  )
    throw new ProtocolError();
  const mode = availability[bytes[3]!];
  if (!mode) throw new ProtocolError();
  const state: PcmAudioState = {
    enabled,
    availability: mode,
    revision: bytes.readBigUInt64BE(4),
    epoch: bytes.readBigUInt64BE(12),
    timestampUs: bytes.readBigUInt64BE(20),
  };
  validateState(state);
  return state;
}
/** Pure refusal rule for future status listeners; no mutable listener/worker activation. */
export function validatePcmAudioStateProgress(
  previous: PcmAudioState | undefined,
  state: PcmAudioState,
): void {
  validateState(state);
  if (previous) {
    validateState(previous);
    if (
      state.revision <= previous.revision ||
      state.epoch < previous.epoch ||
      state.timestampUs < previous.timestampUs ||
      state.enabled !== previous.enabled
    )
      throw new ProtocolError();
  }
}

/** Preparatory RWB1 AUDIO_STATE type 9, stream 3; no worker/media activation. */
export function encodePcmAudioStateRecord(
  state: PcmAudioState,
  sequence: number,
): Buffer {
  validateState(state);
  if (!Number.isInteger(sequence) || sequence < 0 || sequence > 0xffffffff)
    throw new ProtocolError();
  const payload = encodePcmAudioState(state);
  const header = Buffer.alloc(28);
  header.write('RWB1');
  header[4] = 1;
  header[5] = 9;
  header.writeUInt16BE(2, 6);
  header.writeUInt32BE(3, 8);
  header.writeUInt32BE(sequence, 12);
  header.writeBigUInt64BE(state.timestampUs, 16);
  header.writeUInt32BE(PCM_AUDIO_STATE_BYTES, 24);
  return Buffer.concat([header, payload]);
}
export function decodePcmAudioStateRecord(bytes: Buffer): {
  state: PcmAudioState;
  sequence: number;
} {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length !== 28 + PCM_AUDIO_STATE_BYTES ||
    bytes.readUInt32BE(0) !== 0x52574231 ||
    bytes[4] !== 1 ||
    bytes[5] !== 9 ||
    bytes.readUInt16BE(6) !== 2 ||
    bytes.readUInt32BE(8) !== 3 ||
    bytes.readUInt32BE(24) !== PCM_AUDIO_STATE_BYTES
  )
    throw new ProtocolError();
  const state = decodePcmAudioState(bytes.subarray(28));
  if (state.timestampUs !== bytes.readBigUInt64BE(16))
    throw new ProtocolError();
  return { state, sequence: bytes.readUInt32BE(12) };
}

export interface PcmAudioConfig {
  epoch: bigint;
  codec: 'pcm';
  sampleRate: 48000;
  channels: 2;
  sampleFormat: 's16le';
  packetFrames: 960;
}
export interface PcmAudioPacket {
  epoch: bigint;
  timestampUs: bigint;
  frames: number;
  silenceFrames: number;
  discontinuity: boolean;
  pcm: Buffer;
}
function epoch(value: bigint): boolean {
  return (
    typeof value === 'bigint' && value > 0n && value <= 0xffffffffffffffffn
  );
}
function validateConfig(config: PcmAudioConfig): void {
  if (
    !config ||
    !epoch(config.epoch) ||
    config.codec !== 'pcm' ||
    config.sampleRate !== 48000 ||
    config.channels !== 2 ||
    config.sampleFormat !== 's16le' ||
    config.packetFrames !== 960
  )
    throw new ProtocolError();
}
function validatePacket(packet: PcmAudioPacket): void {
  if (
    !packet ||
    !epoch(packet.epoch) ||
    typeof packet.timestampUs !== 'bigint' ||
    packet.timestampUs < 0n ||
    packet.timestampUs > MAX_TIMESTAMP_US ||
    !Number.isInteger(packet.frames) ||
    packet.frames < 0 ||
    packet.frames > 960 ||
    !Number.isInteger(packet.silenceFrames) ||
    packet.silenceFrames < 0 ||
    packet.silenceFrames > 960 ||
    packet.frames + packet.silenceFrames !== 960 ||
    typeof packet.discontinuity !== 'boolean' ||
    !Buffer.isBuffer(packet.pcm) ||
    packet.pcm.length !== PCM_AUDIO_BYTES
  )
    throw new ProtocolError();
  for (let at = packet.frames * 4; at < packet.pcm.length; at++)
    if (packet.pcm[at] !== 0) throw new ProtocolError();
}
export function encodePcmAudioConfig(config: PcmAudioConfig): Buffer {
  validateConfig(config);
  const bytes = Buffer.alloc(PCM_AUDIO_CONFIG_BYTES);
  bytes.set([1, 2, 2, 1]); // schema 1, PCM codec 2, stereo, S16LE 1.
  bytes.writeUInt32BE(48000, 4);
  bytes.writeUInt16BE(960, 8);
  bytes.writeBigUInt64BE(config.epoch, 12);
  return bytes;
}
export function decodePcmAudioConfig(bytes: Buffer): PcmAudioConfig {
  if (
    bytes.length !== PCM_AUDIO_CONFIG_BYTES ||
    bytes[0] !== 1 ||
    bytes[1] !== 2 ||
    bytes[2] !== 2 ||
    bytes[3] !== 1 ||
    bytes.readUInt32BE(4) !== 48000 ||
    bytes.readUInt16BE(8) !== 960 ||
    bytes.readUInt16BE(10) !== 0 ||
    !epoch(bytes.readBigUInt64BE(12))
  )
    throw new ProtocolError();
  return {
    epoch: bytes.readBigUInt64BE(12),
    codec: 'pcm',
    sampleRate: 48000,
    channels: 2,
    sampleFormat: 's16le',
    packetFrames: 960,
  };
}
export function encodePcmAudioPacket(packet: PcmAudioPacket): Buffer {
  validatePacket(packet);
  const bytes = Buffer.alloc(PCM_AUDIO_PACKET_BYTES);
  bytes[0] = 1;
  bytes[1] = packet.discontinuity ? 2 : 0;
  bytes.writeUInt16BE(packet.frames, 2);
  bytes.writeUInt16BE(packet.silenceFrames, 4);
  bytes.writeBigUInt64BE(packet.epoch, 8);
  bytes.writeBigUInt64BE(packet.timestampUs, 16);
  packet.pcm.copy(bytes, PCM_AUDIO_METADATA_BYTES);
  return bytes;
}
/** PCM bytes borrow the validated input storage. */
export function decodePcmAudioPacket(bytes: Buffer): PcmAudioPacket {
  if (
    bytes.length !== PCM_AUDIO_PACKET_BYTES ||
    bytes[0] !== 1 ||
    (bytes[1] !== 0 && bytes[1] !== 2) ||
    bytes.readUInt16BE(6) !== 0
  )
    throw new ProtocolError();
  const packet: PcmAudioPacket = {
    epoch: bytes.readBigUInt64BE(8),
    timestampUs: bytes.readBigUInt64BE(16),
    frames: bytes.readUInt16BE(2),
    silenceFrames: bytes.readUInt16BE(4),
    discontinuity: bytes[1] === 2,
    pcm: bytes.subarray(PCM_AUDIO_METADATA_BYTES),
  };
  validatePacket(packet);
  return packet;
}
/** RWB1 audio stream 3; config carries the epoch, packet payload is only PCM. */
export function encodePcmAudioRecords(
  config: PcmAudioConfig,
  packet: PcmAudioPacket,
  sequence: number,
  includeConfig: boolean,
): Buffer[] {
  validateConfig(config);
  validatePacket(packet);
  if (
    config.epoch !== packet.epoch ||
    typeof includeConfig !== 'boolean' ||
    !Number.isInteger(sequence) ||
    sequence < 0 ||
    sequence > (includeConfig ? 0xfffffffe : 0xffffffff)
  )
    throw new ProtocolError();
  const record = (type: number, flags: number, payload: Buffer): Buffer => {
    const header = Buffer.alloc(28);
    header.write('RWB1');
    header[4] = 1;
    header[5] = type;
    header.writeUInt16BE(flags, 6);
    header.writeUInt32BE(3, 8);
    header.writeUInt32BE(sequence++, 12);
    header.writeBigUInt64BE(packet.timestampUs, 16);
    header.writeUInt32BE(payload.length, 24);
    return Buffer.concat([header, payload]);
  };
  const records: Buffer[] = [];
  if (includeConfig) records.push(record(3, 2, encodePcmAudioConfig(config)));
  records.push(
    record(4, includeConfig || packet.discontinuity ? 2 : 0, packet.pcm),
  );
  return records;
}
