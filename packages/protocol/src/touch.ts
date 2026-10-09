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
