import { MAX_JPEG_BYTES, ProtocolError } from './index.js';

export interface CapturedFrame {
  revision: bigint;
  timestampUs: bigint;
  width: number;
  height: number;
  jpeg: Buffer | undefined;
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
    const header = Buffer.alloc(28);
    header.write('RWB1');
    header[4] = 1;
    header[5] = type;
    header.writeUInt16BE(flags, 6);
    header.writeUInt32BE(1, 8);
    header.writeUInt32BE(seq, 12);
    header.writeBigUInt64BE(frame.timestampUs, 16);
    header.writeUInt32BE(payload.length, 24);
    return Buffer.concat([header, payload]);
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
