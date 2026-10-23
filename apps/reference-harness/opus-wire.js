const MAX_TIMESTAMP = 0xffffffffffffffffn - 20000n;
const TWENTY_MS_CONFIGS = [1, 5, 9, 13, 15, 19, 23, 27, 31];
const AVAILABILITY = [
  'unavailable',
  'waiting',
  'ready',
  'suspended',
  'closed',
  'failed',
];
const invalid = () => new Error('Invalid Opus audio record');

/** Isolated RWB1 profile parser; encoded bytes borrow input until consumed/copied. */
export function parseOpusAudioRecord(bytes) {
  if (
    !(bytes instanceof ArrayBuffer) ||
    bytes.byteLength < 30 ||
    bytes.byteLength > 1303
  )
    throw invalid();
  const view = new DataView(bytes),
    type = view.getUint8(5),
    flags = view.getUint16(6);
  const timestampUs = view.getBigUint64(16),
    sequence = view.getUint32(12);
  if (
    view.getUint32(0) !== 0x52574231 ||
    view.getUint8(4) !== 1 ||
    view.getUint32(8) !== 3 ||
    view.getUint32(24) !== bytes.byteLength - 28 ||
    timestampUs > MAX_TIMESTAMP
  )
    throw invalid();
  if (type === 9) {
    if (bytes.byteLength !== 68 || flags !== 2) throw invalid();
    const enabled = view.getUint8(30),
      availability = AVAILABILITY[view.getUint8(31)],
      revision = view.getBigUint64(32),
      epoch = view.getBigUint64(40);
    if (
      view.getUint16(28) !== 1 ||
      enabled > 1 ||
      availability === undefined ||
      revision === 0n ||
      (enabled === 0 && (availability !== 'unavailable' || epoch !== 0n)) ||
      (availability === 'ready' && epoch === 0n) ||
      view.getBigUint64(48) !== timestampUs ||
      view.getUint8(56) !== (enabled ? 1 : 0) ||
      view.getUint8(57) !== (enabled ? 2 : 0) ||
      view.getUint8(58) !== 0 ||
      view.getUint8(59) !== 0 ||
      view.getUint32(60) !== (enabled ? 48000 : 0) ||
      view.getUint16(64) !== (enabled ? 960 : 0) ||
      view.getUint16(66) !== 0
    )
      throw invalid();
    return {
      type: 'state',
      enabled: enabled === 1,
      availability,
      revision,
      epoch,
      timestampUs,
      sequence,
    };
  }
  if (type === 3) {
    if (
      bytes.byteLength !== 48 ||
      flags !== 2 ||
      view.getUint8(28) !== 1 ||
      view.getUint8(29) !== 1 ||
      view.getUint8(30) !== 2 ||
      view.getUint8(31) !== 0 ||
      view.getUint32(32) !== 48000 ||
      view.getUint16(36) !== 960 ||
      view.getUint16(38) > 960 ||
      view.getBigUint64(40) === 0n
    )
      throw invalid();
    return {
      type: 'config',
      epoch: view.getBigUint64(40),
      lookaheadFrames: view.getUint16(38),
      timestampUs,
      sequence,
    };
  }
  if (
    type !== 4 ||
    (flags !== 0 && flags !== 2) ||
    (view.getUint8(28) & 7) !== 4 ||
    !TWENTY_MS_CONFIGS.includes(view.getUint8(28) >>> 3)
  )
    throw invalid();
  return {
    type: 'packet',
    timestampUs,
    sequence,
    discontinuity: flags === 2,
    encoded: new Uint8Array(bytes, 28),
  };
}
