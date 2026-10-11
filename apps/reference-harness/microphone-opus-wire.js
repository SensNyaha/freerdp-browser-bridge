const invalid = () => new Error('Invalid microphone Opus record');
const configs = [1, 5, 9, 13, 15, 19, 23, 27, 31];
function validate(packet, sequence) {
  if (
    !packet ||
    typeof packet.epoch !== 'bigint' ||
    packet.epoch < 1n ||
    packet.epoch > 0xffffffffffffffffn ||
    typeof packet.timestampUs !== 'bigint' ||
    packet.timestampUs < 0n ||
    packet.timestampUs > 0xffffffffffffffffn - 20000n ||
    typeof packet.discontinuity !== 'boolean' ||
    !Number.isInteger(packet.lookaheadFrames) ||
    packet.lookaheadFrames < 0 ||
    packet.lookaheadFrames > 960 ||
    !(packet.encoded instanceof Uint8Array) ||
    !(packet.encoded.buffer instanceof ArrayBuffer) ||
    packet.encoded.length < 2 ||
    packet.encoded.length > 1275 ||
    (packet.encoded[0] & 7) !== 4 ||
    !configs.includes(packet.encoded[0] >>> 3) ||
    !Number.isInteger(sequence) ||
    sequence < 1 ||
    sequence > 0xffffffff
  )
    throw invalid();
}
/** Standalone prepared codec: no capture, socket or retained packet. */
export function encodeMicrophoneOpusRecord(packet, sequence) {
  validate(packet, sequence);
  const bytes = new ArrayBuffer(40 + packet.encoded.length),
    view = new DataView(bytes);
  view.setUint32(0, 0x52574231);
  view.setUint8(4, 1);
  view.setUint8(5, 10);
  view.setUint16(6, packet.discontinuity ? 2 : 0);
  view.setUint32(8, 4);
  view.setUint32(12, sequence);
  view.setBigUint64(16, packet.timestampUs);
  view.setUint32(24, bytes.byteLength - 28);
  view.setBigUint64(28, packet.epoch);
  view.setUint16(36, packet.lookaheadFrames);
  new Uint8Array(bytes, 40).set(packet.encoded);
  return bytes;
}
/** Encoded bytes borrow the validated record; authority/clock progress belong to the owner. */
export function parseMicrophoneOpusRecord(bytes) {
  if (
    !(bytes instanceof ArrayBuffer) ||
    bytes.byteLength < 42 ||
    bytes.byteLength > 1315
  )
    throw invalid();
  const view = new DataView(bytes),
    flags = view.getUint16(6);
  if (
    view.getUint32(0) !== 0x52574231 ||
    view.getUint8(4) !== 1 ||
    view.getUint8(5) !== 10 ||
    ![0, 2].includes(flags) ||
    view.getUint32(8) !== 4 ||
    view.getUint32(24) !== bytes.byteLength - 28 ||
    view.getUint16(38) !== 0
  )
    throw invalid();
  const packet = {
    epoch: view.getBigUint64(28),
    timestampUs: view.getBigUint64(16),
    discontinuity: flags === 2,
    sequence: view.getUint32(12),
    lookaheadFrames: view.getUint16(36),
    encoded: new Uint8Array(bytes, 40),
  };
  validate(packet, packet.sequence);
  return packet;
}
