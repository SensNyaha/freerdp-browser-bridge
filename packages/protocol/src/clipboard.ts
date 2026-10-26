import { isUtf8 } from 'node:buffer';
import { ProtocolError } from './index.js';
import { decodeClipboardHtmlItem } from './clipboard-html.js';

export const CLIPBOARD_METADATA_BYTES = 24;
export const CLIPBOARD_MAX_TEXT_BYTES = 16 * 1024 * 1024;
export const CLIPBOARD_MAX_RECORD_BYTES =
  CLIPBOARD_METADATA_BYTES + CLIPBOARD_MAX_TEXT_BYTES;
export type ClipboardOperation =
  | 'read'
  | 'set'
  | 'revoke'
  | 'read-html'
  | 'set-html';
const operations: readonly ClipboardOperation[] = [
  'read',
  'set',
  'revoke',
  'read-html',
  'set-html',
];
export function isClipboardRead(op: ClipboardOperation): boolean {
  return op === 'read' || op === 'read-html';
}
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
  html?: true;
  remoteHtml?: boolean;
  localHtmlAccepted?: boolean;
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
    (s.revision === 0n && (s.remoteText || s.remotePending)) ||
    (s.html !== undefined && s.html !== true) ||
    (s.html === true &&
      (typeof s.remoteHtml !== 'boolean' ||
        typeof s.localHtmlAccepted !== 'boolean')) ||
    (s.html === undefined &&
      (s.remoteHtml !== undefined || s.localHtmlAccepted !== undefined)) ||
    ((!s.html || !s.ready || !s.fromServer || s.revision === 0n) &&
      s.remoteHtml) ||
    ((!s.html || !s.ready || !s.toServer || !s.localAccepted) &&
      s.localHtmlAccepted)
  )
    throw new ProtocolError();
}
/** Validate immutable UTF-8 and its normalized terminated UTF-16 size without a string copy. */
export function validateClipboardText(
  bytes: Buffer,
  maximum = CLIPBOARD_MAX_TEXT_BYTES,
): void {
  if (
    !Buffer.isBuffer(bytes) ||
    !Number.isInteger(maximum) ||
    maximum < 1 ||
    maximum > CLIPBOARD_MAX_TEXT_BYTES ||
    bytes.length > maximum ||
    maximum < 2 ||
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
    if (utf16 > maximum) throw new ProtocolError();
  }
}
function identity(c: ClipboardCommand): void {
  u64(c.generation, true);
  u64(c.revision, isClipboardRead(c.operation));
  if (
    !operations.includes(c.operation) ||
    (!isClipboardRead(c.operation) && c.revision !== 0n) ||
    !Buffer.isBuffer(c.text)
  )
    throw new ProtocolError();
}
function command(c: ClipboardCommand): void {
  identity(c);
  if (c.operation === 'set-html') {
    const item = decodeClipboardHtmlItem(c.text);
    if (item.context || item.selection) throw new ProtocolError();
  } else if (c.operation === 'set') validateClipboardText(c.text);
  else if (c.text.length) throw new ProtocolError();
}
function result(r: ClipboardResult): void {
  identity(r);
  if (!clipboardStatuses.includes(r.status)) throw new ProtocolError();
  if (r.operation === 'read-html' && r.status === 'accepted')
    decodeClipboardHtmlItem(r.text);
  else if (r.operation === 'read' && r.status === 'accepted')
    validateClipboardText(r.text);
  else if (r.text.length) throw new ProtocolError();
}
function header(b: Buffer): void {
  if (
    !Buffer.isBuffer(b) ||
    b.length < CLIPBOARD_METADATA_BYTES ||
    b.length > CLIPBOARD_MAX_RECORD_BYTES ||
    b.readUInt16BE(0) !==
      (b.readUInt16BE(2) >= 4 ? 3 : b.readUInt16BE(2) === 3 ? 2 : 1) ||
    b.readUInt16BE(6) !== 0
  )
    throw new ProtocolError();
}
function encode(c: ClipboardCommand, status: number): Buffer {
  const b = Buffer.alloc(CLIPBOARD_METADATA_BYTES + c.text.length);
  b.writeUInt16BE(
    c.operation === 'read-html' || c.operation === 'set-html'
      ? 3
      : c.operation === 'revoke'
        ? 2
        : 1,
    0,
  );
  b.writeUInt16BE(operations.indexOf(c.operation) + 1, 2);
  b.writeUInt16BE(status, 4);
  b.writeBigUInt64BE(c.generation, 8);
  b.writeBigUInt64BE(c.revision, 16);
  c.text.copy(b, CLIPBOARD_METADATA_BYTES);
  return b;
}
function decode(b: Buffer): ClipboardCommand {
  const op = b.readUInt16BE(2);
  const operation = operations[op - 1];
  if (!operation) throw new ProtocolError();
  return {
    operation,
    generation: b.readBigUInt64BE(8),
    revision: b.readBigUInt64BE(16),
    text: b.subarray(CLIPBOARD_METADATA_BYTES),
  };
}
export function encodeClipboardState(s: ClipboardState): Buffer {
  validateClipboardState(s);
  const b = Buffer.alloc(CLIPBOARD_METADATA_BYTES);
  b.writeUInt16BE(s.html ? 3 : 1, 0);
  b.writeUInt16BE(
    Number(s.ready) |
      (Number(s.toServer) << 1) |
      (Number(s.fromServer) << 2) |
      (Number(s.remoteText) << 3) |
      (Number(s.localAccepted) << 4) |
      (Number(s.localPending) << 5) |
      (Number(s.remotePending) << 6) |
      (Number(s.html === true) << 7) |
      (Number(s.remoteHtml === true) << 8) |
      (Number(s.localHtmlAccepted === true) << 9),
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
    (b.readUInt16BE(0) === 1
      ? b.readUInt16BE(2) > 127
      : b.readUInt16BE(0) !== 3 ||
        b.readUInt16BE(2) > 1023 ||
        !(b.readUInt16BE(2) & 128))
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
    ...(f & 128
      ? {
          html: true as const,
          remoteHtml: Boolean(f & 256),
          localHtmlAccepted: Boolean(f & 512),
        }
      : {}),
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
