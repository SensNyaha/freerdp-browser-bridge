/** Only a complete versioned code-owned numeric record; retain no raw stderr. */
export function audioNegotiationDiagnostics(bytes) {
  if (!Buffer.isBuffer(bytes)) return undefined;
  const marker = bytes.indexOf(Buffer.from('bridge.audio.negotiation v=1 '));
  if (marker < 0) return undefined;
  const match = bytes
    .subarray(marker, Math.min(bytes.length, marker + 384))
    .toString('ascii')
    .match(
      /^bridge\.audio\.negotiation v=1 server=(\d{1,5}) client=(\d{1,5}) training=(\d{1,20}) waves=(\d{1,20}) writes=(\d{1,20}) completed=(\d{1,20}) cancelled=(\d{1,20}) failures=(\d{1,20})\r?\n/,
    );
  if (
    !match ||
    match
      .slice(1)
      .some(
        (value, index) =>
          BigInt(value) > (index < 2 ? 65535n : 0xffffffffffffffffn),
      )
  )
    return undefined;
  return Object.fromEntries(
    [
      'serverFormats',
      'clientFormats',
      'training',
      'waves',
      'writes',
      'completed',
      'cancelled',
      'failures',
    ].map((key, index) => [key, match[index + 1]]),
  );
}

const fields = [
  ['server', 'serverFormats', 65535n, 5],
  ['client', 'clientFormats', 65535n, 5],
  ['training', 'training', 0xffffffffffffffffn, 20],
  ['waves', 'waves', 0xffffffffffffffffn, 20],
  ['writes', 'writes', 0xffffffffffffffffn, 20],
  ['completed', 'completed', 0xffffffffffffffffn, 20],
  ['cancelled', 'cancelled', 0xffffffffffffffffn, 20],
  ['failures', 'failures', 0xffffffffffffffffn, 20],
];
const literals = fields.map(([wire], index) =>
  Buffer.from(
    (index === 0 ? 'bridge.audio.negotiation v=1 ' : '') + wire + '=',
  ),
);

/** A stderr chunk is not a record: keep only a fixed numeric draft and latest receipt. */
export class AudioNegotiationDiagnostics {
  #field = 0;
  #offset = 0;
  #number = 0n;
  #digits = 0;
  #readingNumber = false;
  #discard = false;
  #carriage = false;
  #draft = {};
  #latest;
  #reset() {
    this.#field = this.#offset = this.#digits = 0;
    this.#number = 0n;
    this.#readingNumber = this.#discard = this.#carriage = false;
    this.#draft = {};
  }
  push(bytes) {
    if (!(bytes instanceof Uint8Array))
      throw new Error('LAB_AUDIO_DIAGNOSTIC_INPUT_INVALID');
    for (const byte of bytes) {
      if (this.#discard) {
        if (byte === 10) this.#reset();
        continue;
      }
      if (this.#carriage) {
        this.#carriage = false;
        if (byte !== 10) {
          this.#discard = true;
          continue;
        }
      }
      if (!this.#readingNumber) {
        if (byte === literals[this.#field][this.#offset]) {
          if (++this.#offset === literals[this.#field].length)
            this.#readingNumber = true;
          continue;
        }
      } else if (byte >= 48 && byte <= 57) {
        this.#number = this.#number * 10n + BigInt(byte - 48);
        if (
          ++this.#digits <= fields[this.#field][3] &&
          this.#number <= fields[this.#field][2]
        )
          continue;
      } else if (
        byte === 13 &&
        this.#digits > 0 &&
        this.#field === fields.length - 1
      ) {
        this.#carriage = true;
        continue;
      } else if (
        this.#digits > 0 &&
        byte === (this.#field === fields.length - 1 ? 10 : 32)
      ) {
        this.#draft[fields[this.#field][1]] = this.#number.toString();
        if (++this.#field === fields.length) {
          this.#latest = this.#draft;
          this.#reset();
        } else {
          this.#offset = this.#digits = 0;
          this.#number = 0n;
          this.#readingNumber = false;
        }
        continue;
      }
      if (byte === 10) this.#reset();
      else this.#discard = true;
    }
  }
  snapshot() {
    return this.#latest ? { ...this.#latest } : undefined;
  }
}
