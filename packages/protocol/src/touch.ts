import { ProtocolError } from './index.js';

export const TOUCH_INPUT_BYTES = 16;
export interface TouchInput {
  action: 'begin' | 'update' | 'end' | 'cancel';
  contactId: number;
  x: number;
  y: number;
}
const actions = ['begin', 'update', 'end', 'cancel'] as const;
const integer = (value: unknown, maximum: number): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= maximum;

/** Record shape/bounds only; contact transitions and readiness belong to the owner. */
export function validTouchInput(value: unknown): value is TouchInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  const keys = Object.keys(event);
  return (
    keys.length === 4 &&
    keys.every((key) => ['action', 'contactId', 'x', 'y'].includes(key)) &&
    typeof event.action === 'string' &&
    actions.some((action) => action === event.action) &&
    integer(event.contactId, 0x7fffffff) &&
    integer(event.x, 7679) &&
    integer(event.y, 4319)
  );
}
export function encodeTouchInput(event: TouchInput): Buffer {
  if (!validTouchInput(event)) throw new ProtocolError();
  const payload = Buffer.alloc(TOUCH_INPUT_BYTES);
  payload.writeUInt16BE(1, 0);
  payload[2] = actions.indexOf(event.action) + 1;
  payload.writeUInt32BE(event.contactId, 4);
  payload.writeUInt32BE(event.x, 8);
  payload.writeUInt32BE(event.y, 12);
  return payload;
}
export function decodeTouchInput(payload: Buffer): TouchInput {
  if (
    !Buffer.isBuffer(payload) ||
    payload.length !== TOUCH_INPUT_BYTES ||
    payload.readUInt16BE(0) !== 1 ||
    payload[3] !== 0
  )
    throw new ProtocolError();
  const action = actions[(payload[2] ?? 0) - 1];
  if (!action) throw new ProtocolError();
  const event = {
    action,
    contactId: payload.readUInt32BE(4),
    x: payload.readUInt32BE(8),
    y: payload.readUInt32BE(12),
  };
  if (!validTouchInput(event)) throw new ProtocolError();
  return event;
}
export function encodeTouchRequest(
  event: TouchInput,
  generation: bigint,
): Buffer {
  if (
    typeof generation !== 'bigint' ||
    generation <= 0n ||
    generation > 0xffffffffffffffffn
  )
    throw new ProtocolError();
  const record = encodeTouchInput(event);
  const p = Buffer.alloc(24);
  record.copy(p);
  p.writeUInt16BE(2, 0);
  p.writeBigUInt64BE(generation, 16);
  return p;
}
export interface TouchState {
  revision: bigint;
  generation: bigint;
  width: number;
  height: number;
  maxContacts: number;
  enabled: boolean;
  availability:
    | 'unavailable'
    | 'ready'
    | 'suspended'
    | 'draining'
    | 'handshake'
    | 'incompatible';
}
export function decodeTouchState(p: Buffer): TouchState {
  if (
    p.length !== 32 ||
    p.readUInt16BE(0) !== 1 ||
    p[2]! > 1 ||
    p[3] !== 0 ||
    p.readUInt32BE(28) !== 0
  )
    throw new ProtocolError();
  const availability = (
    [
      'unavailable',
      'ready',
      'suspended',
      'draining',
      'handshake',
      'incompatible',
    ] as const
  )[p.readUInt16BE(26)];
  const state = {
    revision: p.readBigUInt64BE(4),
    generation: p.readBigUInt64BE(12),
    width: p.readUInt16BE(20),
    height: p.readUInt16BE(22),
    maxContacts: p.readUInt16BE(24),
    enabled: p[2] === 1,
  };
  if (!availability) throw new ProtocolError();
  const value = { ...state, availability };
  validateTouchState(value);
  return value;
}
/** Trusted backend metadata must satisfy the same bounds as native IPC. */
export function validateTouchState(state: TouchState): void {
  const u64 = (value: unknown) =>
    typeof value === 'bigint' && value > 0n && value <= 0xffffffffffffffffn;
  if (
    !state ||
    !u64(state.revision) ||
    !u64(state.generation) ||
    !integer(state.width, 7680) ||
    state.width === 0 ||
    !integer(state.height, 4320) ||
    state.height === 0 ||
    typeof state.enabled !== 'boolean' ||
    ![
      'unavailable',
      'ready',
      'suspended',
      'draining',
      'handshake',
      'incompatible',
    ].includes(state.availability) ||
    (!state.enabled && state.availability !== 'unavailable') ||
    (state.availability === 'ready'
      ? !integer(state.maxContacts, 10) || state.maxContacts === 0
      : state.maxContacts !== 0)
  )
    throw new ProtocolError();
}
