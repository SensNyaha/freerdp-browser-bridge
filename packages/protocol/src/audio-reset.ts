import { ProtocolError } from './index.js';

export const AUDIO_RESET_REQUEST_BYTES = 12;
export const AUDIO_RESET_RESULT_BYTES = 4;
const results = ['scheduled', 'stale', 'unavailable', 'busy'] as const;
export type AudioResetResult = (typeof results)[number];

export function encodeAudioReset(expectedEpoch: bigint): Buffer {
  if (
    typeof expectedEpoch !== 'bigint' ||
    expectedEpoch <= 0n ||
    expectedEpoch > 0xffffffffffffffffn
  )
    throw new ProtocolError();
  const bytes = Buffer.alloc(AUDIO_RESET_REQUEST_BYTES);
  bytes[0] = 1;
  bytes.writeBigUInt64BE(expectedEpoch, 4);
  return bytes;
}
export function decodeAudioReset(bytes: Buffer): bigint {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length !== AUDIO_RESET_REQUEST_BYTES ||
    bytes[0] !== 1 ||
    bytes[1] !== 0 ||
    bytes[2] !== 0 ||
    bytes[3] !== 0
  )
    throw new ProtocolError();
  const epoch = bytes.readBigUInt64BE(4);
  if (epoch === 0n) throw new ProtocolError();
  return epoch;
}
export function encodeAudioResetResult(result: AudioResetResult): Buffer {
  const code = results.indexOf(result);
  if (code < 0) throw new ProtocolError();
  return Buffer.from([1, code, 0, 0]);
}
export function decodeAudioResetResult(bytes: Buffer): AudioResetResult {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length !== AUDIO_RESET_RESULT_BYTES ||
    bytes[0] !== 1 ||
    bytes[2] !== 0 ||
    bytes[3] !== 0
  )
    throw new ProtocolError();
  const result = results[bytes[1]!];
  if (!result) throw new ProtocolError();
  return result;
}
