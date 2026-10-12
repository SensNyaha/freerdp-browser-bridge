export * from './media.js';
export * from './input.js';
export * from './cursor.js';
export * from './display.js';
export * from './touch.js';
export * from './audio.js';
export * from './opus.js';
export * from './audio-reset.js';
export * from './microphone.js';
export * from './microphone-opus.js';
import {
  MICROPHONE_OPUS_MIN_BYTES,
  MICROPHONE_OPUS_MAX_BYTES,
} from './microphone-opus.js';
import {
  MICROPHONE_PCM_BYTES,
  MICROPHONE_RESULT_BYTES,
  MICROPHONE_STATE_BYTES,
} from './microphone.js';
import {
  AUDIO_RESET_REQUEST_BYTES,
  AUDIO_RESET_RESULT_BYTES,
} from './audio-reset.js';
import {
  OPUS_AUDIO_MIN_PACKET_BYTES,
  OPUS_AUDIO_MAX_PACKET_BYTES,
} from './opus.js';
import {
  PCM_AUDIO_CONFIG_BYTES,
  PCM_AUDIO_PACKET_BYTES,
  PCM_AUDIO_STATE_BYTES,
} from './audio.js';
import { TOUCH_INPUT_BYTES } from './touch.js';
import { DISPLAY_UPDATE_BYTES } from './display.js';
import { CURSOR_METADATA_BYTES, MAX_CURSOR_BYTES } from './cursor.js';
export const IPC_VERSION = 1;
export const HEADER_BYTES = 24;
export const MAX_CONTROL_BYTES = 4096;
export const MAX_JPEG_BYTES = 8 * 1024 * 1024;

export enum Kind {
  Hello = 1,
  HelloAck = 2,
  Heartbeat = 3,
  HeartbeatAck = 4,
  Shutdown = 5,
  ShutdownAck = 6,
  Error = 7,
  Configure = 8,
  ConfigureAck = 9,
  Secret = 10,
  SecretAck = 11,
  Connect = 12,
  ConnectAck = 13,
  State = 14,
  Certificate = 15,
  CertificateDecision = 16,
  CertificateDecisionAck = 17,
  Capture = 18,
  Frame = 19,
  CaptureAvc = 20,
  FrameAvc = 21,
  Input = 22,
  InputAck = 23,
  PipelineStats = 24,
  PipelineStatsAck = 25,
  CursorUpdate = 26,
  DisplayUpdate = 27,
  DisplayResize = 28,
  DisplayResizeResult = 29,
  InputText = 30,
  InputTouch = 31,
  TouchUpdate = 32,
  AudioConfig = 33,
  AudioPcm = 34,
  AudioState = 35,
  AudioOpus = 36, // Experimental private profile; public media remains gated.
  AudioReset = 37,
  AudioResetResult = 38,
  MicrophonePcm = 39,
  MicrophoneResult = 40,
  MicrophoneState = 41,
  MicrophoneReset = 42,
  MicrophoneResetResult = 43,
  MicrophoneOpus = 44, // Prepared envelope; no selected worker dispatch.
}

export interface Packet {
  kind: Kind;
  requestId: bigint;
  payload: Buffer;
}

export class ProtocolError extends Error {
  readonly code = 'IPC_PROTOCOL_ERROR';
  constructor() {
    super('Invalid worker IPC record');
  }
}

function payloadLimit(kind: number): number {
  switch (kind) {
    case Kind.Hello:
      return 8;
    case Kind.HelloAck:
      return MAX_CONTROL_BYTES;
    case Kind.Heartbeat:
    case Kind.HeartbeatAck:
    case Kind.Shutdown:
    case Kind.ShutdownAck:
    case Kind.ConfigureAck:
    case Kind.SecretAck:
    case Kind.Connect:
    case Kind.ConnectAck:
    case Kind.CertificateDecisionAck:
    case Kind.InputAck:
    case Kind.PipelineStats:
      return 0;
    case Kind.Error:
    case Kind.DisplayResize:
    case Kind.DisplayResizeResult:
      return 4;
    case Kind.AudioResetResult:
    case Kind.MicrophoneResetResult:
      return AUDIO_RESET_RESULT_BYTES;
    case Kind.MicrophoneResult:
      return MICROPHONE_RESULT_BYTES;
    case Kind.MicrophonePcm:
      return MICROPHONE_PCM_BYTES;
    case Kind.MicrophoneState:
      return MICROPHONE_STATE_BYTES;
    case Kind.DisplayUpdate:
      return DISPLAY_UPDATE_BYTES;
    case Kind.PipelineStatsAck:
      return 64;
    case Kind.CursorUpdate:
      return CURSOR_METADATA_BYTES + MAX_CURSOR_BYTES;
    case Kind.Configure:
      return 2048;
    case Kind.Secret:
      return 4096;
    case Kind.State:
      return 8;
    case Kind.Certificate:
      return 42;
    case Kind.CertificateDecision:
      return 41;
    case Kind.Capture:
      return 8;
    case Kind.Frame:
      return MAX_JPEG_BYTES + 24;
    case Kind.CaptureAvc:
    case Kind.Input:
      return 12;
    case Kind.AudioReset:
    case Kind.MicrophoneReset:
      return AUDIO_RESET_REQUEST_BYTES;
    case Kind.InputText:
      return 512;
    case Kind.InputTouch:
      return 24;
    case Kind.TouchUpdate:
      return 32;
    case Kind.AudioConfig:
      return PCM_AUDIO_CONFIG_BYTES;
    case Kind.AudioPcm:
      return PCM_AUDIO_PACKET_BYTES;
    case Kind.AudioState:
      return PCM_AUDIO_STATE_BYTES;
    case Kind.AudioOpus:
      return OPUS_AUDIO_MAX_PACKET_BYTES;
    case Kind.MicrophoneOpus:
      return MICROPHONE_OPUS_MAX_BYTES;
    case Kind.FrameAvc:
      return MAX_JPEG_BYTES + 2059 + 28;
    default:
      throw new ProtocolError();
  }
}

export function decodeHeader(header: Buffer): {
  kind: Kind;
  requestId: bigint;
  length: number;
} {
  if (
    header.length !== HEADER_BYTES ||
    !header.subarray(0, 4).equals(Buffer.from('RWI1')) ||
    header.readUInt16BE(4) !== IPC_VERSION ||
    header.readUInt32BE(8) !== 0
  ) {
    throw new ProtocolError();
  }
  const kind = header.readUInt16BE(6);
  const length = header.readUInt32BE(20);
  if (
    length > payloadLimit(kind) ||
    (kind === Kind.MicrophoneState && header.readBigUInt64BE(12) !== 0n) ||
    (![
      Kind.HelloAck,
      Kind.Configure,
      Kind.Secret,
      Kind.Frame,
      Kind.FrameAvc,
      Kind.CursorUpdate,
      Kind.InputText,
      Kind.InputTouch,
      Kind.AudioOpus,
      Kind.MicrophoneOpus,
    ].includes(kind) &&
      length !== payloadLimit(kind)) ||
    (kind === Kind.Frame && length < 24) ||
    (kind === Kind.FrameAvc && length < 28) ||
    (kind === Kind.CursorUpdate && length < CURSOR_METADATA_BYTES) ||
    (kind === Kind.InputText && (length === 0 || length % 2 !== 0)) ||
    (kind === Kind.InputTouch &&
      length !== TOUCH_INPUT_BYTES &&
      length !== 24) ||
    (kind === Kind.AudioOpus &&
      (length < OPUS_AUDIO_MIN_PACKET_BYTES ||
        header.readBigUInt64BE(12) !== 0n)) ||
    (kind === Kind.MicrophoneOpus && length < MICROPHONE_OPUS_MIN_BYTES) ||
    ((kind === Kind.AudioReset ||
      kind === Kind.AudioResetResult ||
      kind === Kind.MicrophonePcm ||
      kind === Kind.MicrophoneResult ||
      kind === Kind.MicrophoneReset ||
      kind === Kind.MicrophoneResetResult ||
      kind === Kind.MicrophoneOpus) &&
      header.readBigUInt64BE(12) === 0n)
  ) {
    throw new ProtocolError();
  }
  return { kind, requestId: header.readBigUInt64BE(12), length };
}

export function encodePacket(packet: Packet): Buffer {
  if (packet.requestId < 0n || packet.requestId > 0xffffffffffffffffn)
    throw new ProtocolError();
  const header = Buffer.alloc(HEADER_BYTES);
  header.write('RWI1');
  header.writeUInt16BE(IPC_VERSION, 4);
  header.writeUInt16BE(packet.kind, 6);
  header.writeBigUInt64BE(packet.requestId, 12);
  header.writeUInt32BE(packet.payload.length, 20);
  decodeHeader(header);
  return Buffer.concat([header, packet.payload]);
}

/** Incremental framed-stream parser; allocates payload only after validating the header. */
export class PacketDecoder {
  private header = Buffer.alloc(HEADER_BYTES);
  private headerUsed = 0;
  private body: Buffer | undefined;
  private bodyUsed = 0;
  private current: ReturnType<typeof decodeHeader> | undefined;
  private failed = false;

  push(chunk: Buffer, onPacket: (packet: Packet) => void): void {
    if (this.failed) throw new ProtocolError();
    let offset = 0;
    try {
      while (offset < chunk.length) {
        if (!this.current) {
          const copied = Math.min(
            HEADER_BYTES - this.headerUsed,
            chunk.length - offset,
          );
          chunk.copy(this.header, this.headerUsed, offset, offset + copied);
          this.headerUsed += copied;
          offset += copied;
          if (this.headerUsed !== HEADER_BYTES) continue;
          this.current = decodeHeader(this.header);
          this.body = Buffer.alloc(this.current.length);
        }
        const current = this.current;
        const body = this.body!;
        const copied = Math.min(
          body.length - this.bodyUsed,
          chunk.length - offset,
        );
        chunk.copy(body, this.bodyUsed, offset, offset + copied);
        this.bodyUsed += copied;
        offset += copied;
        if (this.bodyUsed === body.length) {
          this.current = undefined;
          this.body = undefined;
          this.headerUsed = 0;
          this.bodyUsed = 0;
          onPacket({
            kind: current.kind,
            requestId: current.requestId,
            payload: body,
          });
        }
      }
    } catch (error) {
      this.failed = true;
      throw error;
    }
  }

  finish(): void {
    if (this.failed || this.headerUsed !== 0 || this.current)
      throw new ProtocolError();
  }
}

export function helloPayload(): Buffer {
  const payload = Buffer.alloc(8);
  payload.writeUInt16BE(IPC_VERSION, 0);
  payload.writeUInt16BE(IPC_VERSION, 2);
  return payload;
}

export interface WorkerBuild {
  protocolVersion: number;
  capabilities: {
    lifecycle: boolean;
    rdp: boolean;
    connectCore: boolean;
    jpegCapture: boolean;
    h264Capture: boolean;
    basicInput: boolean;
    unicodeInput: boolean;
    pipelineStats: boolean;
    cursor: boolean;
    videoQuality: boolean;
    displayControl: boolean;
    touchInput: boolean;
    pcmOutput: boolean;
    opusOutput: boolean;
    audioReset: boolean;
    pcmInput: boolean;
    microphoneReset: boolean;
    opusInput: boolean;
    penInput: false;
  };
  bridgeVersion: string;
  gitCommit: string;
  freeRdpVersion: string | null;
  targetFreeRdpVersion: string;
  os: string;
  arch: string;
  transport: string;
}

export function decodeBuild(payload: Buffer): WorkerBuild {
  if (payload.length < 4 || payload.readUInt16BE(0) !== IPC_VERSION)
    throw new ProtocolError();
  const capabilities = payload.readUInt16BE(2);
  if (
    (capabilities & ~65535) !== 0 ||
    !(capabilities & 1) ||
    ((capabilities & 65528) !== 0 && (capabilities & 4) === 0) ||
    ((capabilities & 16384) !== 0 && (capabilities & 12288) === 0) ||
    ((capabilities & 3072) !== 0 && (capabilities & 32) === 0)
  )
    throw new ProtocolError();
  let offset = 4;
  const string = (): string => {
    if (offset + 2 > payload.length) throw new ProtocolError();
    const length = payload.readUInt16BE(offset);
    offset += 2;
    if (offset + length > payload.length || length > 256)
      throw new ProtocolError();
    const result = new TextDecoder('utf-8', { fatal: true }).decode(
      payload.subarray(offset, offset + length),
    );
    offset += length;
    return result;
  };
  const bridgeVersion = string();
  const gitCommit = string();
  const freeRdpVersion = string() || null;
  const targetFreeRdpVersion = string();
  const os = string();
  const arch = string();
  const transport = string();
  // Optional fixed schema-1 extension; old peers have no trailing bytes.
  let extensions = 0;
  if (offset !== payload.length) {
    if (
      payload.length - offset !== 8 ||
      payload.readUInt16BE(offset) !== 1 ||
      payload.readUInt16BE(offset + 2) !== 0
    )
      throw new ProtocolError();
    extensions = payload.readUInt32BE(offset + 4);
    if (
      (extensions & ~3) !== 0 ||
      ((extensions & 1) !== 0 && !(capabilities & 32768)) ||
      ((extensions & 2) !== 0 && (!(extensions & 1) || !(capabilities & 4)))
    )
      throw new ProtocolError();
    offset += 8;
  }
  if (
    offset !== payload.length ||
    (Boolean(capabilities & 6) && !freeRdpVersion)
  )
    throw new ProtocolError();
  return {
    protocolVersion: IPC_VERSION,
    capabilities: {
      lifecycle: true,
      rdp: Boolean(capabilities & 2),
      connectCore: Boolean(capabilities & 4),
      jpegCapture: Boolean(capabilities & 8),
      h264Capture: Boolean(capabilities & 16),
      basicInput: Boolean(capabilities & 32),
      unicodeInput: Boolean(capabilities & 1024),
      pipelineStats: Boolean(capabilities & 64),
      cursor: Boolean(capabilities & 128),
      videoQuality: Boolean(capabilities & 256),
      displayControl: Boolean(capabilities & 512),
      touchInput: Boolean(capabilities & 2048),
      pcmOutput: Boolean(capabilities & 4096),
      opusOutput: Boolean(capabilities & 8192),
      audioReset: Boolean(capabilities & 16384),
      pcmInput: Boolean(capabilities & 32768),
      microphoneReset: Boolean(extensions & 1),
      opusInput: Boolean(extensions & 2),
      penInput: false,
    },
    bridgeVersion,
    gitCommit,
    freeRdpVersion,
    targetFreeRdpVersion,
    os,
    arch,
    transport,
  };
}

export type SessionState =
  | 'created'
  | 'starting'
  | 'connecting'
  | 'awaiting-user'
  | 'connected'
  | 'reconnecting'
  | 'closing'
  | 'closed'
  | 'failed';

export interface BridgeFailure {
  code: string;
  message: string;
  retryable: boolean;
}
export interface PipelineStats {
  rdpChecks: number;
  paints: number;
  encodedFrames: number;
  encodeMeanUs: number;
  encodeP95Us: number;
  encodeMaxUs: number;
  maxReadBatch: number;
  maxReadBatchUs: number;
}
export function decodePipelineStats(payload: Buffer): PipelineStats {
  if (payload.length !== 64) throw new ProtocolError();
  const values = Array.from({ length: 8 }, (_, i) =>
    Number(payload.readBigUInt64BE(i * 8)),
  );
  if (values.some((value) => !Number.isSafeInteger(value)))
    throw new ProtocolError();
  const [
    rdpChecks,
    paints,
    encodedFrames,
    encodeMeanUs,
    encodeP95Us,
    encodeMaxUs,
    maxReadBatch,
    maxReadBatchUs,
  ] = values as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (
    encodeMeanUs > encodeMaxUs ||
    encodeP95Us > encodeMaxUs ||
    maxReadBatch > rdpChecks
  )
    throw new ProtocolError();
  return {
    rdpChecks,
    paints,
    encodedFrames,
    encodeMeanUs,
    encodeP95Us,
    encodeMaxUs,
    maxReadBatch,
    maxReadBatchUs,
  };
}

export interface DeviceCapability {
  name: string;
  supported: boolean;
  origins: Array<'bridge-host' | 'browser-virtual' | 'companion'>;
  requires: string[];
  policy: 'disabled-by-default' | 'enabled';
}

export interface ConnectionSettings {
  host: string;
  username: string;
  domain: string;
  port: number;
  width: number;
  height: number;
  colorDepth: number;
  security: 0 | 1 | 2;
  certificatePolicy: 0 | 1;
  minimumTls: 2 | 3;
  connectMs: number;
  tcpAckMs: number;
  dynamicResolution?: boolean;
  touch?: boolean;
  pcmOutput?: boolean;
  opusOutput?: boolean;
  pcmInput?: boolean;
  opusInput?: boolean;
  videoQuality?: {
    h264Fps: number;
    jpegFps: number;
    jpegQuality: number;
    targetBitrate: number;
    maxBitrate: number;
  };
}
/** Versioned non-secret connection settings. Passwords use a separate message class. */
export function encodeConnectionSettings(c: ConnectionSettings): Buffer {
  if (
    (c.dynamicResolution !== undefined &&
      typeof c.dynamicResolution !== 'boolean') ||
    (c.touch !== undefined && typeof c.touch !== 'boolean') ||
    (c.pcmOutput !== undefined && typeof c.pcmOutput !== 'boolean') ||
    (c.opusOutput !== undefined && typeof c.opusOutput !== 'boolean') ||
    (c.pcmInput !== undefined && typeof c.pcmInput !== 'boolean') ||
    (c.opusInput !== undefined && typeof c.opusInput !== 'boolean') ||
    (c.pcmOutput === true && c.opusOutput === true) ||
    (c.pcmInput === true && c.opusInput === true)
  )
    throw new ProtocolError();
  const schema = c.opusInput
    ? 8
    : c.pcmInput
      ? 7
      : c.opusOutput
        ? 6
        : c.pcmOutput
          ? 5
          : c.touch
            ? 4
            : c.dynamicResolution
              ? 3
              : c.videoQuality
                ? 2
                : 1;
  const parts: Buffer[] = [Buffer.from([0, schema])];
  for (const [value, maximum] of [
    [c.host, 253],
    [c.username, 256],
    [c.domain, 256],
  ] as const) {
    const bytes = Buffer.from(value, 'utf8');
    if (
      bytes.length > maximum ||
      value.includes('\0') ||
      new TextDecoder('utf-8', { fatal: true }).decode(bytes) !== value
    )
      throw new ProtocolError();
    const length = Buffer.alloc(2);
    length.writeUInt16BE(bytes.length);
    parts.push(length, bytes);
  }
  if (
    !c.host ||
    /[\s\u0000-\u001f]/u.test(c.host) ||
    !Number.isInteger(c.port) ||
    c.port < 1 ||
    c.port > 65535 ||
    !Number.isInteger(c.width) ||
    c.width < 1 ||
    c.width > 7680 ||
    !Number.isInteger(c.height) ||
    c.height < 1 ||
    c.height > 4320 ||
    ![16, 24, 32].includes(c.colorDepth) ||
    ![0, 1, 2].includes(c.security) ||
    ![0, 1].includes(c.certificatePolicy) ||
    ![2, 3].includes(c.minimumTls) ||
    !Number.isInteger(c.connectMs) ||
    c.connectMs < 100 ||
    c.connectMs > 120000 ||
    !Number.isInteger(c.tcpAckMs) ||
    c.tcpAckMs < 100 ||
    c.tcpAckMs > 120000
  )
    throw new ProtocolError();
  const fixed = Buffer.alloc(20);
  fixed.writeUInt16BE(c.port, 0);
  fixed.writeUInt16BE(c.width, 2);
  fixed.writeUInt16BE(c.height, 4);
  fixed.writeUInt16BE(c.colorDepth, 6);
  fixed[8] = c.security;
  fixed[9] = c.certificatePolicy;
  fixed[10] = c.minimumTls;
  fixed.writeUInt32BE(c.connectMs, 12);
  fixed.writeUInt32BE(c.tcpAckMs, 16);
  parts.push(fixed);
  if (c.videoQuality || schema >= 3) {
    const q = c.videoQuality ?? {
      h264Fps: 30,
      jpegFps: 20,
      jpegQuality: 80,
      targetBitrate: 4000000,
      maxBitrate: 4000000,
    };
    if (
      !Number.isInteger(q.h264Fps) ||
      q.h264Fps < 1 ||
      q.h264Fps > 30 ||
      !Number.isInteger(q.jpegFps) ||
      q.jpegFps < 1 ||
      q.jpegFps > 20 ||
      !Number.isInteger(q.jpegQuality) ||
      q.jpegQuality < 1 ||
      q.jpegQuality > 100 ||
      !Number.isInteger(q.targetBitrate) ||
      q.targetBitrate < 100000 ||
      q.targetBitrate > 20000000 ||
      !Number.isInteger(q.maxBitrate) ||
      q.maxBitrate < q.targetBitrate ||
      q.maxBitrate > 20000000
    )
      throw new ProtocolError();
    const media = Buffer.alloc(12);
    media[0] = q.h264Fps;
    media[1] = q.jpegFps;
    media[2] = q.jpegQuality;
    media.writeUInt32BE(q.targetBitrate, 4);
    media.writeUInt32BE(q.maxBitrate, 8);
    parts.push(media);
  }
  if (schema >= 3)
    parts.push(
      Buffer.from([
        0,
        0,
        0,
        (c.dynamicResolution ? 1 : 0) |
          (c.touch ? 2 : 0) |
          (c.pcmOutput ? 4 : 0) |
          (c.opusOutput ? 8 : 0) |
          (c.pcmInput ? 16 : 0) |
          (c.opusInput ? 32 : 0),
      ]),
    );
  return Buffer.concat(parts);
}

export type NativeConnectionState = {
  nativeError: number;
  state: 'connecting' | 'awaiting-user' | 'connected' | 'closed' | 'failed';
  error:
    | 'NONE'
    | 'RDP_CONNECT_FAILED'
    | 'RDP_AUTHENTICATION_FAILED'
    | 'RDP_CERTIFICATE_REJECTED'
    | 'RDP_CONNECT_TIMEOUT'
    | 'RDP_PROTOCOL_ERROR'
    | 'RDP_CONNECT_CANCELLED'
    | 'RDP_DISCONNECTED';
};
export function decodeConnectionState(payload: Buffer): NativeConnectionState {
  const states = [
    'connecting',
    'awaiting-user',
    'connected',
    'closed',
    'failed',
  ] as const;
  const errors = [
    'NONE',
    'RDP_CONNECT_FAILED',
    'RDP_AUTHENTICATION_FAILED',
    'RDP_CERTIFICATE_REJECTED',
    'RDP_CONNECT_TIMEOUT',
    'RDP_PROTOCOL_ERROR',
    'RDP_CONNECT_CANCELLED',
    'RDP_DISCONNECTED',
  ] as const;
  if (payload.length !== 8) throw new ProtocolError();
  const state = states[payload.readUInt16BE(0) - 1];
  const error = errors[payload.readUInt16BE(2)];
  if (!state || !error || (state === 'failed') !== (error !== 'NONE'))
    throw new ProtocolError();
  return { state, error, nativeError: payload.readUInt32BE(4) };
}
export interface CertificatePrompt {
  challenge: string;
  fingerprint: string;
  untrusted: boolean;
  hostnameMismatch: boolean;
}
export function decodeCertificatePrompt(payload: Buffer): CertificatePrompt {
  if (
    payload.length !== 42 ||
    payload.readBigUInt64BE(0) === 0n ||
    payload.readUInt16BE(8) === 0 ||
    (payload.readUInt16BE(8) & ~3) !== 0
  )
    throw new ProtocolError();
  return {
    challenge: payload.readBigUInt64BE(0).toString(),
    fingerprint: 'sha256:' + payload.subarray(10).toString('hex'),
    untrusted: Boolean(payload.readUInt16BE(8) & 1),
    hostnameMismatch: Boolean(payload.readUInt16BE(8) & 2),
  };
}
export function encodeCertificateDecision(
  prompt: CertificatePrompt,
  accept: boolean,
): Buffer {
  if (
    !/^[1-9][0-9]{0,19}$/.test(prompt.challenge) ||
    !/^sha256:[0-9a-f]{64}$/.test(prompt.fingerprint) ||
    typeof accept !== 'boolean'
  )
    throw new ProtocolError();
  const challenge = BigInt(prompt.challenge);
  if (challenge > 0xffffffffffffffffn) throw new ProtocolError();
  const bytes = Buffer.alloc(41);
  bytes.writeBigUInt64BE(challenge);
  Buffer.from(prompt.fingerprint.slice(7), 'hex').copy(bytes, 8);
  bytes[40] = accept ? 1 : 0;
  return bytes;
}
