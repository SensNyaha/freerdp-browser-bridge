import { ProtocolError } from './index.js';

export const DISPLAY_UPDATE_BYTES = 32;
export interface DisplayState {
  generation: bigint;
  framebufferRevision: bigint;
  width: number;
  height: number;
  dynamicResolution: boolean;
  negotiated: boolean;
  maxWidth: number;
  maxHeight: number;
  maxArea: number;
}
export type DisplayResizeResult =
  | 'applied'
  | 'unchanged'
  | 'unavailable'
  | 'invalid'
  | 'busy'
  | 'send-failed'
  | 'timeout'
  | 'disconnected';

export function decodeDisplayState(payload: Buffer): DisplayState {
  if (payload.length !== DISPLAY_UPDATE_BYTES) throw new ProtocolError();
  const generation = payload.readBigUInt64BE(0);
  const framebufferRevision = payload.readBigUInt64BE(8);
  const width = payload.readUInt16BE(16);
  const height = payload.readUInt16BE(18);
  const flags = payload[20]!;
  const maxWidth = payload.readUInt16BE(22);
  const maxHeight = payload.readUInt16BE(24);
  const maxArea = payload.readUInt32BE(28);
  const negotiated = Boolean(flags & 2);
  if (
    !generation ||
    !framebufferRevision ||
    !width ||
    width > 7680 ||
    !height ||
    height > 4320 ||
    (flags & ~3) !== 0 ||
    payload[21] !== 0 ||
    payload.readUInt16BE(26) !== 0 ||
    (negotiated
      ? maxWidth !== 3840 ||
        maxHeight !== 2160 ||
        !maxArea ||
        maxArea > 3840 * 2160
      : maxWidth !== 0 || maxHeight !== 0 || maxArea !== 0)
  )
    throw new ProtocolError();
  return {
    generation,
    framebufferRevision,
    width,
    height,
    dynamicResolution: Boolean(flags & 1),
    negotiated,
    maxWidth,
    maxHeight,
    maxArea,
  };
}

/** Geometry outside the negotiated provider limits receives a nonfatal native result. */
export function encodeDisplayResize(width: number, height: number): Buffer {
  if (
    !Number.isInteger(width) ||
    width < 0 ||
    width > 65535 ||
    !Number.isInteger(height) ||
    height < 0 ||
    height > 65535
  )
    throw new ProtocolError();
  const bytes = Buffer.alloc(4);
  bytes.writeUInt16BE(width, 0);
  bytes.writeUInt16BE(height, 2);
  return bytes;
}
export function decodeDisplayResizeResult(
  payload: Buffer,
): DisplayResizeResult {
  if (payload.length !== 4 || payload.readUInt16BE(2) !== 0)
    throw new ProtocolError();
  const result = (
    [
      'applied',
      'unchanged',
      'unavailable',
      'invalid',
      'busy',
      'send-failed',
      'timeout',
      'disconnected',
    ] as const
  )[payload.readUInt16BE(0)];
  if (!result) throw new ProtocolError();
  return result;
}
