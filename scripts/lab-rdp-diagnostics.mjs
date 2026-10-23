const fields = [
  ['stage', 11n],
  ['channel', 0xffffffffn],
  ['receive', 1n],
  ['assembly', 1n],
  ['registry', 1n],
  ['plugins', 1n],
  ['reserved', 67108864n],
  ['active', 32n],
  ['abandoned', 0xffffffffffffffffn],
];
const literals = fields.map(([name], index) =>
  Buffer.from((index === 0 ? 'bridge.rdp.failure v=1 ' : '') + name + '='),
);

/** Recognize one fixed numeric record without retaining any upstream text. */
export class LabRdpDiagnostics {
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
      throw new Error('LAB_DIAGNOSTIC_INPUT_INVALID');
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
        if (++this.#digits <= 20 && this.#number <= fields[this.#field][1])
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
        this.#draft[fields[this.#field][0]] =
          this.#field === fields.length - 1
            ? this.#number.toString()
            : Number(this.#number);
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
