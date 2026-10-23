import { MAX_JPEG_BYTES, ProtocolError } from './index.js';

export interface CapturedFrame {
  revision: bigint;
  timestampUs: bigint;
  width: number;
  height: number;
  jpeg: Buffer | undefined;
  avc?: { config: Buffer; bytes: Buffer; keyframe: boolean };
}
export type MediaCodec = 'jpeg' | 'h264';
export interface CaptureOptions {
  codec: MediaCodec;
  forceKeyframe?: boolean;
}

/** The supported AVC record has one SPS/PPS and four-byte NAL lengths. */
export function validateAvc(
  config: Buffer,
  bytes: Buffer,
  keyframe: boolean,
): void {
  if (
    config.length < 17 ||
    config.length > 2059 ||
    config[0] !== 1 ||
    config[4] !== 0xff ||
    config[5] !== 0xe1 ||
    bytes.length < 6 ||
    bytes.length > MAX_JPEG_BYTES ||
    typeof keyframe !== 'boolean'
  )
    throw new ProtocolError();
  const spsLength = config.readUInt16BE(6);
  if (
    spsLength < 4 ||
    spsLength > 1024 ||
    spsLength > config.length - 13 ||
    config[8] !== 0x67 ||
    config[8 + spsLength] !== 1 ||
    !config.subarray(1, 4).equals(config.subarray(9, 12))
  )
    throw new ProtocolError();
  const ppsLength = config.readUInt16BE(9 + spsLength);
  if (
    ppsLength < 2 ||
    ppsLength > 1024 ||
    ppsLength !== config.length - 11 - spsLength ||
    config[11 + spsLength] !== 0x68
  )
    throw new ProtocolError();
  let vcl = false,
    idr = false,
    count = 0;
  for (let offset = 0; offset < bytes.length; ) {
    if (bytes.length - offset < 4 || ++count > 1024) throw new ProtocolError();
    const length = bytes.readUInt32BE(offset);
    offset += 4;
    const type = bytes[offset]! & 31;
    if (
      length < 2 ||
      length > bytes.length - offset ||
      bytes[offset]! & 128 ||
      ![1, 5, 6, 9].includes(type)
    )
      throw new ProtocolError();
    if (
      bytes.subarray(offset, offset + length).includes(Buffer.from([0, 0, 1]))
    )
      throw new ProtocolError();
    vcl ||= type === 1 || type === 5;
    idr ||= type === 5;
    offset += length;
  }
  if (!vcl || idr !== keyframe) throw new ProtocolError();
}
export function decodeAvcFrame(payload: Buffer): CapturedFrame {
  if (payload.length < 28 || payload.length > 28 + 2059 + MAX_JPEG_BYTES)
    throw new ProtocolError();
  const revision = payload.readBigUInt64BE(0),
    timestampUs = payload.readBigUInt64BE(8);
  const width = payload.readUInt16BE(16),
    height = payload.readUInt16BE(18);
  const status = payload[20],
    configLength = payload.readUInt16BE(22),
    length = payload.readUInt32BE(24);
  if (
    revision === 0n ||
    width < 16 ||
    width > 3840 ||
    width % 2 ||
    height < 16 ||
    height > 2160 ||
    height % 2 ||
    payload[21] !== 0 ||
    ![0, 1, 2].includes(status!) ||
    configLength > 2059 ||
    length > MAX_JPEG_BYTES ||
    payload.length !== 28 + configLength + length ||
    (status === 0 && (configLength !== 0 || length !== 0))
  )
    throw new ProtocolError();
  const frame: CapturedFrame = {
    revision,
    timestampUs,
    width,
    height,
    jpeg: undefined,
  };
  if (status !== 0) {
    const config = payload.subarray(28, 28 + configLength),
      bytes = payload.subarray(28 + configLength);
    validateAvc(config, bytes, status === 2);
    frame.avc = { config, bytes, keyframe: status === 2 };
  }
  return frame;
}
export function decodeCapturedFrame(payload: Buffer): CapturedFrame {
  if (payload.length < 24 || payload.length > MAX_JPEG_BYTES + 24)
    throw new ProtocolError();
  const revision = payload.readBigUInt64BE(0);
  const timestampUs = payload.readBigUInt64BE(8);
  const width = payload.readUInt16BE(16),
    height = payload.readUInt16BE(18);
  const codec = payload[20];
  if (
    revision === 0n ||
    width < 1 ||
    width > 7680 ||
    height < 1 ||
    height > 4320 ||
    payload.readUIntBE(21, 3) !== 0 ||
    ![0, 1].includes(codec!) ||
    (codec === 0 && payload.length !== 24) ||
    (codec === 1 &&
      (payload.length < 28 ||
        payload.readUInt16BE(24) !== 0xffd8 ||
        payload.readUInt16BE(payload.length - 2) !== 0xffd9))
  )
    throw new ProtocolError();
  return {
    revision,
    timestampUs,
    width,
    height,
    jpeg: codec === 1 ? payload.subarray(24) : undefined,
  };
}

/** RWB1 envelope from PROTOCOL.md. JPEG access units are complete independent keyframes. */
export function encodeJpegRecords(
  frame: CapturedFrame,
  sequence: number,
  config: boolean,
): Buffer[] {
  if (
    !frame.jpeg ||
    frame.jpeg.length < 4 ||
    frame.jpeg.length > MAX_JPEG_BYTES ||
    frame.jpeg.readUInt16BE(0) !== 0xffd8 ||
    frame.jpeg.readUInt16BE(frame.jpeg.length - 2) !== 0xffd9 ||
    !Number.isInteger(frame.width) ||
    frame.width < 1 ||
    frame.width > 7680 ||
    !Number.isInteger(frame.height) ||
    frame.height < 1 ||
    frame.height > 4320 ||
    typeof frame.timestampUs !== 'bigint' ||
    frame.timestampUs < 0n ||
    frame.timestampUs > 0xffffffffffffffffn ||
    !Number.isInteger(sequence) ||
    sequence < 0 ||
    sequence > 0xfffffffe
  )
    throw new ProtocolError();
  const record = (
    type: number,
    flags: number,
    payload: Buffer,
    seq: number,
  ): Buffer => {
    return mediaRecord(frame.timestampUs, type, flags, payload, seq);
  };
  const records: Buffer[] = [];
  if (config) {
    const payload = Buffer.alloc(8);
    payload[0] = 1;
    payload[1] = 2; // Config schema 1; JPEG codec 2 (AVC reserved 1).
    payload.writeUInt16BE(frame.width, 2);
    payload.writeUInt16BE(frame.height, 4);
    records.push(record(1, 2, payload, sequence++));
  }
  records.push(record(2, 1 | (config ? 2 : 0), frame.jpeg, sequence));
  return records;
}

function mediaRecord(
  timestampUs: bigint,
  type: number,
  flags: number,
  payload: Buffer,
  sequence: number,
): Buffer {
  const header = Buffer.alloc(28);
  header.write('RWB1');
  header[4] = 1;
  header[5] = type;
  header.writeUInt16BE(flags, 6);
  header.writeUInt32BE(1, 8);
  header.writeUInt32BE(sequence, 12);
  header.writeBigUInt64BE(timestampUs, 16);
  header.writeUInt32BE(payload.length, 24);
  return Buffer.concat([header, payload]);
}
export function encodeAvcRecords(
  frame: CapturedFrame,
  sequence: number,
  config: boolean,
): Buffer[] {
  if (
    !frame.avc ||
    !Number.isInteger(frame.width) ||
    frame.width < 16 ||
    frame.width > 3840 ||
    frame.width % 2 ||
    !Number.isInteger(frame.height) ||
    frame.height < 16 ||
    frame.height > 2160 ||
    frame.height % 2 ||
    typeof frame.timestampUs !== 'bigint' ||
    frame.timestampUs < 0n ||
    frame.timestampUs > 0xffffffffffffffffn ||
    !Number.isInteger(sequence) ||
    sequence < 0 ||
    sequence > 0xfffffffe ||
    (config && !frame.avc.keyframe)
  )
    throw new ProtocolError();
  validateAvc(frame.avc.config, frame.avc.bytes, frame.avc.keyframe);
  const records: Buffer[] = [];
  if (config) {
    const payload = Buffer.alloc(8 + frame.avc.config.length);
    payload[0] = 1;
    payload[1] = 1;
    payload.writeUInt16BE(frame.width, 2);
    payload.writeUInt16BE(frame.height, 4);
    frame.avc.config.copy(payload, 8);
    records.push(mediaRecord(frame.timestampUs, 1, 2, payload, sequence++));
  }
  records.push(
    mediaRecord(
      frame.timestampUs,
      2,
      (frame.avc.keyframe ? 1 : 0) | (config ? 2 : 0),
      frame.avc.bytes,
      sequence,
    ),
  );
  return records;
}
