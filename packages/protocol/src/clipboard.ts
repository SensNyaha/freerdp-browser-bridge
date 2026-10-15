import { isUtf8 } from 'node:buffer';
import { ProtocolError } from './index.js';

export const CLIPBOARD_METADATA_BYTES = 24;
export const CLIPBOARD_MAX_TEXT_BYTES = 16 * 1024 * 1024;
export const CLIPBOARD_MAX_RECORD_BYTES =
  CLIPBOARD_METADATA_BYTES + CLIPBOARD_MAX_TEXT_BYTES;
export type ClipboardOperation = 'read' | 'set';
export const clipboardStatuses = [
  'accepted',
  'refused',
  'stale',
  'unavailable',
  'busy',
  'invalid',
  'timeout',
  'disconnected',
] as const;
export type ClipboardStatus = (typeof clipboardStatuses)[number];
export interface ClipboardState {
  generation: bigint;
  revision: bigint;
  maximum: number;
  ready: boolean;
  toServer: boolean;
  fromServer: boolean;
  remoteText: boolean;
  localAccepted: boolean;
  localPending: boolean;
  remotePending: boolean;
}
export interface ClipboardCommand {
  operation: ClipboardOperation;
  generation: bigint;
  revision: bigint;
  text: Buffer;
}
export interface ClipboardResult extends ClipboardCommand {
  status: ClipboardStatus;
}
function u64(value: bigint, nonzero = false): void {
  if (
    typeof value !== 'bigint' ||
    value < (nonzero ? 1n : 0n) ||
    value > 0xffffffffffffffffn
  )
    throw new ProtocolError();
}
export function validateClipboardState(s: ClipboardState): void {
  u64(s.generation, true);
  u64(s.revision);
  if (
    !Number.isInteger(s.maximum) ||
    s.maximum < 1 ||
    s.maximum > CLIPBOARD_MAX_TEXT_BYTES ||
    [
      s.ready,
      s.toServer,
      s.fromServer,
      s.remoteText,
      s.localAccepted,
      s.localPending,
      s.remotePending,
    ].some((v) => typeof v !== 'boolean') ||
    (!s.toServer && !s.fromServer) ||
    ((!s.ready || !s.fromServer) && (s.remoteText || s.remotePending)) ||
    ((!s.ready || !s.toServer) && (s.localAccepted || s.localPending)) ||
    (s.localAccepted && s.localPending) ||
    (s.revision === 0n && (s.remoteText || s.remotePending))
  )
    throw new ProtocolError();
}
/** Validate immutable UTF-8 and its normalized terminated UTF-16 size without a string copy. */
function text(bytes: Buffer): void {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length > CLIPBOARD_MAX_TEXT_BYTES ||
    !isUtf8(bytes) ||
    bytes.includes(0)
  )
    throw new ProtocolError();
  let utf16 = 2;
  for (let i = 0; i < bytes.length; ) {
    const first = bytes[i]!;
    if (first === 13 || first === 10) {
      i += first === 13 && bytes[i + 1] === 10 ? 2 : 1;
      utf16 += 4;
    } else {
      i += first < 0x80 ? 1 : first < 0xe0 ? 2 : first < 0xf0 ? 3 : 4;
      utf16 += first < 0xf0 ? 2 : 4;
    }
    if (utf16 > CLIPBOARD_MAX_TEXT_BYTES) throw new ProtocolError();
  }
}
function identity(c: ClipboardCommand): void {
  u64(c.generation, true);
  u64(c.revision, c.operation === 'read');
  if (
    (c.operation !== 'read' && c.operation !== 'set') ||
    (c.operation === 'set' && c.revision !== 0n) ||
    !Buffer.isBuffer(c.text)
  )
    throw new ProtocolError();
}
function command(c: ClipboardCommand): void {
  identity(c);
  if (c.operation === 'set') text(c.text);
  else if (c.text.length) throw new ProtocolError();
}
function result(r: ClipboardResult): void {
  identity(r);
  if (!clipboardStatuses.includes(r.status)) throw new ProtocolError();
  if (r.operation === 'read' && r.status === 'accepted') text(r.text);
  else if (r.text.length) throw new ProtocolError();
}
function header(b: Buffer): void {
  if (
    !Buffer.isBuffer(b) ||
    b.length < CLIPBOARD_METADATA_BYTES ||
    b.length > CLIPBOARD_MAX_RECORD_BYTES ||
    b.readUInt16BE(0) !== 1 ||
    b.readUInt16BE(6) !== 0
  )
    throw new ProtocolError();
}
function encode(c: ClipboardCommand, status: number): Buffer {
  const b = Buffer.alloc(CLIPBOARD_METADATA_BYTES + c.text.length);
  b.writeUInt16BE(1, 0);
  b.writeUInt16BE(c.operation === 'read' ? 1 : 2, 2);
  b.writeUInt16BE(status, 4);
  b.writeBigUInt64BE(c.generation, 8);
  b.writeBigUInt64BE(c.revision, 16);
  c.text.copy(b, CLIPBOARD_METADATA_BYTES);
  return b;
}
function decode(b: Buffer): ClipboardCommand {
  const op = b.readUInt16BE(2);
  if (op !== 1 && op !== 2) throw new ProtocolError();
  return {
    operation: op === 1 ? 'read' : 'set',
    generation: b.readBigUInt64BE(8),
    revision: b.readBigUInt64BE(16),
    text: b.subarray(CLIPBOARD_METADATA_BYTES),
  };
}
export function encodeClipboardState(s: ClipboardState): Buffer {
  validateClipboardState(s);
  const b = Buffer.alloc(CLIPBOARD_METADATA_BYTES);
  b.writeUInt16BE(1, 0);
  b.writeUInt16BE(
    Number(s.ready) |
      (Number(s.toServer) << 1) |
      (Number(s.fromServer) << 2) |
      (Number(s.remoteText) << 3) |
      (Number(s.localAccepted) << 4) |
      (Number(s.localPending) << 5) |
      (Number(s.remotePending) << 6),
    2,
  );
  b.writeUInt32BE(s.maximum, 4);
  b.writeBigUInt64BE(s.generation, 8);
  b.writeBigUInt64BE(s.revision, 16);
  return b;
}
export function decodeClipboardState(b: Buffer): ClipboardState {
  if (
    !Buffer.isBuffer(b) ||
    b.length !== CLIPBOARD_METADATA_BYTES ||
    b.readUInt16BE(0) !== 1 ||
    b.readUInt16BE(2) > 127
  )
    throw new ProtocolError();
  const f = b.readUInt16BE(2);
  const s: ClipboardState = {
    generation: b.readBigUInt64BE(8),
    revision: b.readBigUInt64BE(16),
    maximum: b.readUInt32BE(4),
    ready: Boolean(f & 1),
    toServer: Boolean(f & 2),
    fromServer: Boolean(f & 4),
    remoteText: Boolean(f & 8),
    localAccepted: Boolean(f & 16),
    localPending: Boolean(f & 32),
    remotePending: Boolean(f & 64),
  };
  validateClipboardState(s);
  return s;
}
export function encodeClipboardCommand(c: ClipboardCommand): Buffer {
  command(c);
  return encode(c, 0);
}
/** Text is borrowed; owners copy it only after admission. */
export function decodeClipboardCommand(b: Buffer): ClipboardCommand {
  header(b);
  if (b.readUInt16BE(4) !== 0) throw new ProtocolError();
  const c = decode(b);
  command(c);
  return c;
}
export function encodeClipboardResult(r: ClipboardResult): Buffer {
  result(r);
  return encode(r, clipboardStatuses.indexOf(r.status));
}
export function decodeClipboardResult(b: Buffer): ClipboardResult {
  header(b);
  const status = clipboardStatuses[b.readUInt16BE(4)];
  if (!status) throw new ProtocolError();
  const r = { ...decode(b), status };
  result(r);
  return r;
}
