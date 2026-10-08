import { ProtocolError } from './index.js';
export const MAX_CURSOR_DIMENSION = 384;
export const MAX_CURSOR_BYTES = MAX_CURSOR_DIMENSION ** 2 * 4;
export const CURSOR_METADATA_BYTES = 40;
export interface CursorState {
  revision: bigint;
  shapeId: bigint;
  timestampUs: bigint;
  visible: boolean;
  default: boolean;
  positioned: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  hotX: number;
  hotY: number;
  rgba?: Buffer;
}
export function validateCursorState(state: CursorState): void {
  const u64 = (value: bigint) =>
    typeof value === 'bigint' && value >= 0n && value <= 0xffffffffffffffffn;
  if (
    !state ||
    !u64(state.revision) ||
    state.revision === 0n ||
    !u64(state.shapeId) ||
    !u64(state.timestampUs) ||
    typeof state.visible !== 'boolean' ||
    typeof state.default !== 'boolean' ||
    typeof state.positioned !== 'boolean' ||
    ![
      state.x,
      state.y,
      state.width,
      state.height,
      state.hotX,
      state.hotY,
    ].every(
      (value) => Number.isInteger(value) && value >= 0 && value <= 65535,
    ) ||
    (!state.positioned && (state.x !== 0 || state.y !== 0)) ||
    (state.default
      ? state.shapeId !== 0n ||
        state.width !== 0 ||
        state.height !== 0 ||
        state.hotX !== 0 ||
        state.hotY !== 0 ||
        Boolean(state.rgba)
      : state.shapeId === 0n ||
        state.width < 1 ||
        state.height < 1 ||
        state.width > MAX_CURSOR_DIMENSION ||
        state.height > MAX_CURSOR_DIMENSION ||
        state.hotX >= state.width ||
        state.hotY >= state.height ||
        !Buffer.isBuffer(state.rgba) ||
        state.rgba.length !== state.width * state.height * 4)
  )
    throw new ProtocolError();
}
export function decodeCursorUpdate(payload: Buffer): CursorState {
  if (
    payload.length < CURSOR_METADATA_BYTES ||
    payload.length > CURSOR_METADATA_BYTES + MAX_CURSOR_BYTES ||
    payload.readUInt16BE(0) !== 1 ||
    (payload.readUInt16BE(2) & ~15) !== 0
  )
    throw new ProtocolError();
  const flags = payload.readUInt16BE(2);
  const state: CursorState = {
    revision: payload.readBigUInt64BE(4),
    shapeId: payload.readBigUInt64BE(12),
    timestampUs: payload.readBigUInt64BE(20),
    visible: Boolean(flags & 1),
    default: Boolean(flags & 2),
    positioned: Boolean(flags & 4),
    x: payload.readUInt16BE(28),
    y: payload.readUInt16BE(30),
    width: payload.readUInt16BE(32),
    height: payload.readUInt16BE(34),
    hotX: payload.readUInt16BE(36),
    hotY: payload.readUInt16BE(38),
    ...(flags & 8 ? { rgba: Buffer.from(payload.subarray(40)) } : {}),
  };
  if (
    !state.revision ||
    (!state.positioned && (state.x !== 0 || state.y !== 0)) ||
    (state.default
      ? state.shapeId !== 0n ||
        state.width !== 0 ||
        state.height !== 0 ||
        state.hotX !== 0 ||
        state.hotY !== 0 ||
        Boolean(state.rgba)
      : state.shapeId === 0n ||
        state.width < 1 ||
        state.height < 1 ||
        state.width > MAX_CURSOR_DIMENSION ||
        state.height > MAX_CURSOR_DIMENSION ||
        state.hotX >= state.width ||
        state.hotY >= state.height) ||
    (state.rgba
      ? state.rgba.length !== state.width * state.height * 4
      : payload.length !== 40)
  )
    throw new ProtocolError();
  return state;
}
export function encodeCursorShape(
  state: CursorState,
  sequence: number,
): Buffer {
  if (
    !state.rgba ||
    state.default ||
    state.shapeId <= 0n ||
    state.shapeId > 0xffffffffffffffffn ||
    !Number.isInteger(sequence) ||
    sequence < 0 ||
    sequence > 0xffffffff ||
    ![state.width, state.height, state.hotX, state.hotY].every(
      Number.isInteger,
    ) ||
    state.width < 1 ||
    state.height < 1 ||
    state.width > MAX_CURSOR_DIMENSION ||
    state.height > MAX_CURSOR_DIMENSION ||
    state.hotX < 0 ||
    state.hotY < 0 ||
    state.hotX >= state.width ||
    state.hotY >= state.height ||
    state.rgba.length !== state.width * state.height * 4 ||
    state.timestampUs < 0n ||
    state.timestampUs > 0xffffffffffffffffn
  )
    throw new ProtocolError();
  const record = Buffer.alloc(48 + state.rgba.length);
  record.write('RWB1');
  record[4] = 1;
  record[5] = 5;
  record.writeUInt32BE(2, 8);
  record.writeUInt32BE(sequence, 12);
  record.writeBigUInt64BE(state.timestampUs, 16);
  record.writeUInt32BE(20 + state.rgba.length, 24);
  record.writeUInt16BE(1, 28);
  record.writeUInt16BE(1, 30); // schema, RGBA8
  record.writeBigUInt64BE(state.shapeId, 32);
  record.writeUInt16BE(state.width, 40);
  record.writeUInt16BE(state.height, 42);
  record.writeUInt16BE(state.hotX, 44);
  record.writeUInt16BE(state.hotY, 46);
  state.rgba.copy(record, 48);
  return record;
}
