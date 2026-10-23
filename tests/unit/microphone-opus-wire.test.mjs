import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ProtocolError,
  decodeHeader,
  encodeMicrophoneOpus,
  decodeMicrophoneOpus,
  encodeMicrophoneOpusRecord,
  decodeMicrophoneOpusRecord,
  decodeMicrophonePcm,
  decodeOpusAudioPacket,
} from '../../packages/protocol/dist/index.js';
const browser = await import(
  'data:text/javascript;base64,' +
    (await readFile('apps/reference-harness/microphone-opus-wire.js')).toString(
      'base64',
    )
);
const golden = () =>
  Buffer.from(
    '52574231010a0002000000040000000100000000000f42400000000f010203040506070801380000fcfffe',
    'hex',
  );
const privateGolden = () =>
  Buffer.from('010203c000000138010203040506070800000000000f4240fcfffe', 'hex');
const ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const webPacket = (p) => ({ ...p, encoded: new Uint8Array(p.encoded) });

test('microphone Opus: independent public/private vectors preserve delay and borrowed compressed bytes', () => {
  const bytes = golden(),
    packet = decodeMicrophoneOpusRecord(bytes);
  assert.equal(packet.epoch, 0x0102030405060708n);
  assert.equal(packet.timestampUs, 1000000n);
  assert.equal(packet.lookaheadFrames, 312);
  assert.equal(packet.discontinuity, true);
  assert.equal(packet.sequence, 1);
  assert.deepEqual(encodeMicrophoneOpusRecord(packet, 1), bytes);
  assert.deepEqual(
    Buffer.from(browser.encodeMicrophoneOpusRecord(webPacket(packet), 1)),
    bytes,
  );
  const raw = ab(bytes),
    web = browser.parseMicrophoneOpusRecord(raw);
  assert.deepEqual({ ...web, encoded: Buffer.from(web.encoded) }, packet);
  assert.deepEqual(encodeMicrophoneOpus(packet), privateGolden());
  const input = privateGolden(),
    projected = decodeMicrophoneOpus(input);
  assert.deepEqual(encodeMicrophoneOpus(projected), input);
  bytes[41] = 17;
  assert.equal(packet.encoded[1], 17);
  new Uint8Array(raw)[41] = 19;
  assert.equal(web.encoded[1], 19);
  input[25] = 21;
  assert.equal(projected.encoded[1], 21);
  assert.throws(() => decodeMicrophonePcm(input), ProtocolError);
  assert.throws(() => decodeOpusAudioPacket(input), ProtocolError);
  const header = Buffer.alloc(24);
  header.write('RWI1');
  header.writeUInt16BE(1, 4);
  header.writeUInt16BE(45, 6);
  header.writeBigUInt64BE(1n, 12);
  header.writeUInt32BE(27, 20);
  assert.throws(() => decodeHeader(header), ProtocolError); // Unknown envelope kind.
});

test('microphone Opus: public framing bounds length before fields and refuses direction/profile/reserved/correlation claims', () => {
  const original = golden();
  const refuse = (b) => {
    assert.throws(() => decodeMicrophoneOpusRecord(b), ProtocolError);
    assert.throws(
      () => browser.parseMicrophoneOpusRecord(ab(b)),
      /Invalid microphone Opus record/,
    );
  };
  for (let n = 0; n < original.length; n++) refuse(original.subarray(0, n));
  for (const n of [44, 1316, 4096]) {
    const b = Buffer.alloc(n);
    original.copy(b);
    refuse(b);
  }
  for (const at of [0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 24, 25, 26, 27, 38, 39]) {
    const b = Buffer.from(original);
    b[at] ^= 1;
    refuse(b);
  }
  for (const flags of [1, 3, 4, 0xffff]) {
    const b = Buffer.from(original);
    b.writeUInt16BE(flags, 6);
    refuse(b);
  }
  for (const [at, n] of [
    [12, 4],
    [28, 8],
  ]) {
    const b = Buffer.from(original);
    b.fill(0, at, at + n);
    refuse(b);
  }
  for (const delay of [961, 65535]) {
    const b = Buffer.from(original);
    b.writeUInt16BE(delay, 36);
    refuse(b);
  }
  const over = Buffer.from(original);
  over.writeBigUInt64BE(0xffffffffffffffffn - 19999n, 16);
  refuse(over);
  for (const value of [null, {}, new Uint8Array(original)])
    assert.throws(() => decodeMicrophoneOpusRecord(value), ProtocolError);
  for (const value of [
    null,
    {},
    new Uint8Array(original),
    new SharedArrayBuffer(43),
  ])
    assert.throws(
      () => browser.parseMicrophoneOpusRecord(value),
      /Invalid microphone Opus record/,
    );
});

test('microphone Opus: private metadata and maximum/minimum compressed sizes retain exact bounded profile', () => {
  const original = privateGolden();
  for (let n = 0; n < 26; n++)
    assert.throws(
      () => decodeMicrophoneOpus(original.subarray(0, n)),
      ProtocolError,
    );
  const over = Buffer.alloc(1300);
  original.copy(over);
  assert.throws(() => decodeMicrophoneOpus(over), ProtocolError);
  for (const at of [0, 1, 2, 3, 4, 5]) {
    const b = Buffer.from(original);
    b[at] ^= 255;
    assert.throws(() => decodeMicrophoneOpus(b), ProtocolError);
  }
  for (const delay of [961, 65535]) {
    const b = Buffer.from(original);
    b.writeUInt16BE(delay, 6);
    assert.throws(() => decodeMicrophoneOpus(b), ProtocolError);
  }
  for (const length of [2, 1275])
    for (const delay of [0, 960]) {
      const packet = {
        ...decodeMicrophoneOpus(original),
        encoded: Buffer.alloc(length, 0xfc),
        epoch: 0xffffffffffffffffn,
        timestampUs: 0xffffffffffffffffn - 20000n,
        lookaheadFrames: delay,
        discontinuity: false,
      };
      const priv = encodeMicrophoneOpus(packet);
      assert.equal(priv.length, 24 + length);
      assert.deepEqual(decodeMicrophoneOpus(priv), packet);
      for (const seq of [1, 0xffffffff]) {
        const record = encodeMicrophoneOpusRecord(packet, seq);
        assert.equal(record.length, 40 + length);
        assert.deepEqual(decodeMicrophoneOpusRecord(record), {
          ...packet,
          sequence: seq,
        });
        assert.deepEqual(
          Buffer.from(
            browser.encodeMicrophoneOpusRecord(webPacket(packet), seq),
          ),
          record,
        );
        assert.equal(
          browser.parseMicrophoneOpusRecord(ab(record)).lookaheadFrames,
          delay,
        );
      }
    }
});

test('microphone Opus: every TOC agrees across private/Node/browser grammars without entropy decoding', () => {
  const allowed = [0x0c, 0x2c, 0x4c, 0x6c, 0x7c, 0x9c, 0xbc, 0xdc, 0xfc];
  for (let toc = 0; toc < 256; toc++) {
    const p = privateGolden(),
      r = golden();
    p[24] = toc;
    r[40] = toc;
    if (allowed.includes(toc)) {
      assert.doesNotThrow(() => decodeMicrophoneOpus(p));
      assert.doesNotThrow(() => decodeMicrophoneOpusRecord(r));
      assert.doesNotThrow(() => browser.parseMicrophoneOpusRecord(ab(r)));
    } else {
      assert.throws(() => decodeMicrophoneOpus(p), ProtocolError);
      assert.throws(() => decodeMicrophoneOpusRecord(r), ProtocolError);
      assert.throws(
        () => browser.parseMicrophoneOpusRecord(ab(r)),
        /Invalid microphone Opus record/,
      );
    }
  }
});

test('microphone Opus: encoders reject invalid source fields and shared/detached storage before copying', () => {
  const packet = decodeMicrophoneOpus(privateGolden());
  for (const fields of [
    { epoch: 0n },
    { epoch: -1n },
    { epoch: 1n << 64n },
    { epoch: 1 },
    { timestampUs: -1n },
    { timestampUs: 0xffffffffffffffffn - 19999n },
    { timestampUs: 1 },
    { discontinuity: 1 },
    { lookaheadFrames: -1 },
    { lookaheadFrames: 961 },
    { lookaheadFrames: 0.5 },
    { lookaheadFrames: null },
  ]) {
    assert.throws(
      () => encodeMicrophoneOpus({ ...packet, ...fields }),
      ProtocolError,
    );
    assert.throws(
      () => encodeMicrophoneOpusRecord({ ...packet, ...fields }, 1),
      ProtocolError,
    );
    assert.throws(
      () =>
        browser.encodeMicrophoneOpusRecord(
          { ...webPacket(packet), ...fields },
          1,
        ),
      /Invalid microphone Opus record/,
    );
  }
  for (const size of [0, 1, 1276]) {
    const bad = { ...packet, encoded: Buffer.alloc(size, 0xfc) };
    assert.throws(() => encodeMicrophoneOpus(bad), ProtocolError);
    assert.throws(() => encodeMicrophoneOpusRecord(bad, 1), ProtocolError);
    assert.throws(
      () => browser.encodeMicrophoneOpusRecord(webPacket(bad), 1),
      /Invalid microphone Opus record/,
    );
  }
  for (const seq of [0, -1, 0x100000000, 1.1, null]) {
    assert.throws(() => encodeMicrophoneOpusRecord(packet, seq), ProtocolError);
    assert.throws(
      () => browser.encodeMicrophoneOpusRecord(webPacket(packet), seq),
      /Invalid microphone Opus record/,
    );
  }
  const shared = new SharedArrayBuffer(3);
  new Uint8Array(shared).set([0xfc, 0xff, 0xfe]);
  assert.throws(
    () => encodeMicrophoneOpus({ ...packet, encoded: Buffer.from(shared) }),
    ProtocolError,
  );
  assert.throws(
    () =>
      browser.encodeMicrophoneOpusRecord(
        { ...packet, encoded: new Uint8Array(shared) },
        1,
      ),
    /Invalid microphone Opus record/,
  );
  const detached = new Uint8Array([0xfc, 0xff, 0xfe]);
  structuredClone(detached.buffer, { transfer: [detached.buffer] });
  assert.throws(
    () =>
      browser.encodeMicrophoneOpusRecord({ ...packet, encoded: detached }, 1),
    /Invalid microphone Opus record/,
  );
  const before = Buffer.from(packet.encoded),
    web = webPacket(packet);
  encodeMicrophoneOpus(packet).fill(0);
  encodeMicrophoneOpusRecord(packet, 1).fill(0);
  new Uint8Array(browser.encodeMicrophoneOpusRecord(web, 1)).fill(0);
  assert.deepEqual(packet.encoded, before);
  assert.deepEqual(Buffer.from(web.encoded), before);
});
