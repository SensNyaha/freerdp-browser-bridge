export const IPC_VERSION = 1;
export const HEADER_BYTES = 24;
export const MAX_CONTROL_BYTES = 4096;

export enum Kind {
  Hello = 1,
  HelloAck = 2,
  Heartbeat = 3,
  HeartbeatAck = 4,
  Shutdown = 5,
  ShutdownAck = 6,
  Error = 7,
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
      return 0;
    case Kind.Error:
      return 4;
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
    (kind !== Kind.HelloAck && length !== payloadLimit(kind))
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
  capabilities: { lifecycle: boolean; rdp: boolean };
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
  if ((capabilities & ~3) !== 0 || !(capabilities & 1))
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
    (Boolean(capabilities & 2) && !freeRdpVersion)
  )
    throw new ProtocolError();
  return {
    protocolVersion: IPC_VERSION,
    capabilities: { lifecycle: true, rdp: Boolean(capabilities & 2) },
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
