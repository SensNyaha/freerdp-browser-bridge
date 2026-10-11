const BYTES = 3876;
const MAX_TIMESTAMP = 0xffffffffffffffffn - 20000n;
const MAX_EPOCH = 0xffffffffffffffffn;
const invalid = () => new Error('Invalid microphone record');

/** Isolated binary codec; no capture, permission, socket or retained PCM. */
export function encodeMicrophoneRecord(packet, sequence) {
  if (
    !packet ||
    typeof packet.epoch !== 'bigint' ||
    packet.epoch < 1n ||
    packet.epoch > MAX_EPOCH ||
    typeof packet.timestampUs !== 'bigint' ||
    packet.timestampUs < 0n ||
    packet.timestampUs > MAX_TIMESTAMP ||
    typeof packet.discontinuity !== 'boolean' ||
    !(packet.pcm instanceof Uint8Array) ||
    !(packet.pcm.buffer instanceof ArrayBuffer) ||
    packet.pcm.byteLength !== 3840 ||
    !Number.isInteger(sequence) ||
    sequence < 1 ||
    sequence > 0xffffffff
  )
    throw invalid();
  const bytes = new ArrayBuffer(BYTES),
    view = new DataView(bytes);
  view.setUint32(0, 0x52574231);
  view.setUint8(4, 1);
  view.setUint8(5, 7);
  view.setUint16(6, packet.discontinuity ? 2 : 0);
  view.setUint32(8, 4);
  view.setUint32(12, sequence);
  view.setBigUint64(16, packet.timestampUs);
  view.setUint32(24, 3848);
  view.setBigUint64(28, packet.epoch);
  new Uint8Array(bytes, 36).set(packet.pcm);
  return bytes;
}

/** Samples borrow validated input; consumers must enforce current lease/epoch/sequence. */
export function parseMicrophoneRecord(bytes) {
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength !== BYTES)
    throw invalid();
  const view = new DataView(bytes),
    flags = view.getUint16(6),
    sequence = view.getUint32(12);
  const epoch = view.getBigUint64(28),
    timestampUs = view.getBigUint64(16);
  if (
    view.getUint32(0) !== 0x52574231 ||
    view.getUint8(4) !== 1 ||
    view.getUint8(5) !== 7 ||
    ![0, 2].includes(flags) ||
    view.getUint32(8) !== 4 ||
    sequence === 0 ||
    view.getUint32(24) !== 3848 ||
    epoch === 0n ||
    timestampUs > MAX_TIMESTAMP
  )
    throw invalid();
  return {
    epoch,
    timestampUs,
    sequence,
    discontinuity: flags === 2,
    pcm: new Uint8Array(bytes, 36),
  };
}
