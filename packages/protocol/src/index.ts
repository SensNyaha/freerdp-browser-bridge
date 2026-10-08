export * from './media.js';
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
      return 0;
    case Kind.Error:
      return 4;
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
      return 12;
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
    (![
      Kind.HelloAck,
      Kind.Configure,
      Kind.Secret,
      Kind.Frame,
      Kind.FrameAvc,
    ].includes(kind) &&
      length !== payloadLimit(kind)) ||
    (kind === Kind.Frame && length < 24) ||
    (kind === Kind.FrameAvc && length < 28)
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
    (capabilities & ~31) !== 0 ||
    !(capabilities & 1) ||
    ((capabilities & 24) !== 0 && (capabilities & 4) === 0)
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
}
/** Versioned non-secret connection settings. Passwords use a separate message class. */
export function encodeConnectionSettings(c: ConnectionSettings): Buffer {
  const parts: Buffer[] = [Buffer.from([0, 1])];
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
  return Buffer.concat([...parts, fixed]);
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
