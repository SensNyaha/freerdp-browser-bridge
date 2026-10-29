import { isUtf8 } from 'node:buffer';
import { ProtocolError } from './index.js';

export const FILE_METADATA_BYTES = 40;
export const FILE_CHUNK_BYTES = 65536;
export const FILE_MAX_RECORD_BYTES = FILE_METADATA_BYTES + FILE_CHUNK_BYTES;
const maximum = (1n << 63n) - 1n;
const maximumId = (1n << 64n) - 1n;
const operations = [
  'initialize',
  'begin-upload',
  'write',
  'commit',
  'abort',
  'open-download',
  'read',
  'close-download',
  'list',
  'mkdir',
  'remove',
  'retire',
] as const;
const statuses = [
  'ok',
  'invalid',
  'missing',
  'exists',
  'denied',
  'busy',
  'limit',
  'disk-full',
  'unavailable',
  'retired',
  'retained',
  'io',
  'not-empty',
] as const;
export type FileOperation = (typeof operations)[number];
export type FileStatus = (typeof statuses)[number];
/** Private worker record. These IDs are not browser IDs or authorization. */
export interface FileRecord {
  operation: FileOperation;
  status: FileStatus;
  flags: number;
  id: bigint;
  argument: bigint;
  value: bigint;
  data: Buffer;
}
export interface NativeFileEntry {
  id: bigint;
  parent: bigint;
  bytes: bigint;
  directory: boolean;
  name: string;
}
export function validFileName(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !value.length ||
    value.length > 255 ||
    Buffer.byteLength(value) > 255 ||
    /[\u0000-\u001f\u007f/\\:<>"|?*\ud800-\udfff]/u.test(value) ||
    value === '.' ||
    value === '..' ||
    /[. ]$/.test(value)
  )
    return false;
  const base = value
    .split('.')[0]!
    .replace(/ +$/, '')
    .replace(/[a-z]/g, (c) => c.toUpperCase());
  return !/^(CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|COM[0-9¹²³]|LPT[0-9¹²³])$/.test(
    base,
  );
}
function bigint(value: unknown, limit = maximumId): value is bigint {
  return typeof value === 'bigint' && value >= 0n && value <= limit;
}
export function decodeFilePage(record: FileRecord): NativeFileEntry[] {
  if (
    record.operation !== 'list' ||
    record.status !== 'ok' ||
    !bigint(record.argument, 64n) ||
    record.value !== 0n
  )
    throw new ProtocolError();
  const entries: NativeFileEntry[] = [];
  let offset = 0;
  let previous = 0n;
  for (let i = 0; i < Number(record.argument); i++) {
    if (record.data.length - offset < 32) throw new ProtocolError();
    const id = record.data.readBigUInt64BE(offset),
      parent = record.data.readBigUInt64BE(offset + 8),
      bytes = record.data.readBigUInt64BE(offset + 16),
      kind = record.data.readUInt16BE(offset + 24),
      length = record.data.readUInt16BE(offset + 26);
    if (
      id <= previous ||
      (entries.length > 0 && parent !== entries[0]!.parent) ||
      bytes > maximum ||
      kind > 1 ||
      (kind === 1 && bytes !== 0n) ||
      record.data.readUInt32BE(offset + 28) ||
      !length ||
      length > 255 ||
      length > record.data.length - offset - 32
    )
      throw new ProtocolError();
    const encoded = record.data.subarray(offset + 32, offset + 32 + length);
    if (!isUtf8(encoded)) throw new ProtocolError();
    const name = encoded.toString('utf8');
    if (!validFileName(name)) throw new ProtocolError();
    entries.push({ id, parent, bytes, directory: kind === 1, name });
    previous = id;
    offset += 32 + length;
  }
  if (
    offset !== record.data.length ||
    (record.id !== 0n && (!entries.length || record.id !== previous))
  )
    throw new ProtocolError();
  return entries;
}
function validate(record: FileRecord, response: boolean): void {
  const {
    operation: op,
    status,
    flags,
    id,
    argument: arg,
    value,
    data,
  } = record;
  if (
    !operations.includes(op) ||
    !statuses.includes(status) ||
    !Number.isInteger(flags) ||
    !bigint(id) ||
    !bigint(arg) ||
    !bigint(value) ||
    !Buffer.isBuffer(data) ||
    data.length > FILE_CHUNK_BYTES
  )
    throw new ProtocolError();
  if (response) {
    if (flags !== 0) throw new ProtocolError();
    if (status !== 'ok') {
      if (data.length || arg > maximum || value > maximum)
        throw new ProtocolError();
      return;
    }
    if (op === 'list') {
      decodeFilePage(record);
      return;
    }
    if (op === 'read') {
      if (
        !id ||
        arg > maximum ||
        value !== BigInt(data.length) ||
        value > maximum - arg
      )
        throw new ProtocolError();
      return;
    }
    if (data.length) throw new ProtocolError();
    if (op === 'initialize' || op === 'retire') {
      if (id !== 0n || arg !== 0n || value !== 0n) throw new ProtocolError();
      return;
    }
    if (!id) throw new ProtocolError();
    switch (op) {
      case 'begin-upload':
      case 'mkdir':
        if (value !== 0n) throw new ProtocolError();
        break;
      case 'write':
        if (arg > maximum || value > BigInt(FILE_CHUNK_BYTES) || value > arg)
          throw new ProtocolError();
        break;
      case 'commit':
      case 'open-download':
        if (arg !== 0n || value > maximum) throw new ProtocolError();
        break;
      default:
        if (arg !== 0n || value !== 0n) throw new ProtocolError();
    }
    return;
  }
  if (
    status !== 'ok' ||
    (flags !== 0 && (!['commit', 'initialize'].includes(op) || flags !== 1))
  )
    throw new ProtocolError();
  let valid = false;
  switch (op) {
    case 'initialize':
      valid = !data.length && id <= maximum && arg <= id && value <= 65536n;
      break;
    case 'begin-upload':
    case 'mkdir':
      valid =
        arg === 0n && value === 0n && data.length > 0 && data.length <= 255;
      break;
    case 'write':
      valid =
        id !== 0n &&
        arg <= maximum &&
        value === 0n &&
        data.length > 0 &&
        BigInt(data.length) <= maximum - arg;
      break;
    case 'commit':
      valid = id !== 0n && arg <= maximum && value === 0n && !data.length;
      break;
    case 'abort':
    case 'open-download':
    case 'close-download':
    case 'remove':
      valid = id !== 0n && arg === 0n && value === 0n && !data.length;
      break;
    case 'read':
      valid =
        id !== 0n &&
        arg <= maximum &&
        value > 0n &&
        value <= BigInt(FILE_CHUNK_BYTES) &&
        value <= maximum - arg &&
        !data.length;
      break;
    case 'list':
      valid = value > 0n && value <= 64n && !data.length;
      break;
    case 'retire':
      valid = id === 0n && arg === 0n && value === 0n && !data.length;
      break;
  }
  if (!valid) throw new ProtocolError();
}
/** Returned data borrows the bounded input. Wipe its owner after consumption. */
export function decodeFileRecord(bytes: Buffer, response: boolean): FileRecord {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length < FILE_METADATA_BYTES ||
    bytes.length > FILE_MAX_RECORD_BYTES ||
    bytes.readUInt16BE(0) !== 1 ||
    bytes.readUInt32BE(36) ||
    bytes.readUInt32BE(32) !== bytes.length - FILE_METADATA_BYTES
  )
    throw new ProtocolError();
  const operation = operations[bytes.readUInt16BE(2) - 1],
    status = statuses[bytes.readUInt16BE(4)];
  if (operation === undefined || status === undefined)
    throw new ProtocolError();
  const result = {
    operation,
    status,
    flags: bytes.readUInt16BE(6),
    id: bytes.readBigUInt64BE(8),
    argument: bytes.readBigUInt64BE(16),
    value: bytes.readBigUInt64BE(24),
    data: bytes.subarray(FILE_METADATA_BYTES),
  };
  validate(result, response);
  return result;
}
export function encodeFileRecord(
  record: FileRecord,
  response: boolean,
): Buffer {
  validate(record, response);
  const bytes = Buffer.alloc(FILE_METADATA_BYTES + record.data.length);
  bytes.writeUInt16BE(1);
  bytes.writeUInt16BE(operations.indexOf(record.operation) + 1, 2);
  bytes.writeUInt16BE(statuses.indexOf(record.status), 4);
  bytes.writeUInt16BE(record.flags, 6);
  bytes.writeBigUInt64BE(record.id, 8);
  bytes.writeBigUInt64BE(record.argument, 16);
  bytes.writeBigUInt64BE(record.value, 24);
  bytes.writeUInt32BE(record.data.length, 32);
  record.data.copy(bytes, FILE_METADATA_BYTES);
  return bytes;
}
