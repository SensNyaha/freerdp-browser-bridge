import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TOUCH_INPUT_BYTES,
  validTouchInput,
  encodeTouchInput,
  decodeTouchInput,
  Kind,
  encodePacket,
  decodeHeader,
  PacketDecoder,
  ProtocolError,
  encodeTouchRequest,
  decodeTouchState,
} from '../../packages/protocol/dist/index.js';

const canonical = Buffer.from('00010100010203040000123400000567', 'hex');
const event = { action: 'begin', contactId: 0x01020304, x: 0x1234, y: 0x567 };

test('touch: independent fixed v1 network-order vectors and four action values', () => {
  assert.equal(TOUCH_INPUT_BYTES, 16);
  assert.deepEqual(encodeTouchInput(event), canonical);
  assert.deepEqual(decodeTouchInput(canonical), event);
  for (const [index, action] of [
    'begin',
    'update',
    'end',
    'cancel',
  ].entries()) {
    const literal = Buffer.from(canonical);
    literal[2] = index + 1;
    assert.deepEqual(encodeTouchInput({ ...event, action }), literal);
    assert.deepEqual(decodeTouchInput(literal), { ...event, action });
  }
  assert.deepEqual(
    decodeTouchInput(Buffer.from('00010100000000000000000000000000', 'hex')),
    { action: 'begin', contactId: 0, x: 0, y: 0 },
  );
  const high = { action: 'cancel', contactId: 0x7fffffff, x: 7679, y: 4319 };
  const literal = Buffer.from('000104007fffffff00001dff000010df', 'hex');
  assert.deepEqual(encodeTouchInput(high), literal);
  assert.deepEqual(decodeTouchInput(literal), high);
});
test('touch v2: generation ownership and readiness metadata use independent vectors', () => {
  assert.equal(
    encodeTouchRequest(event, 3n).toString('hex'),
    '000201000102030400001234000005670000000000000003',
  );
  for (const generation of [0n, -1n, 0x10000000000000000n, 3])
    assert.throws(() => encodeTouchRequest(event, generation), ProtocolError);
  const p = Buffer.from(
    '000101000000000000000001000000000000000307800438000a000100000000',
    'hex',
  );
  assert.deepEqual(decodeTouchState(p), {
    revision: 1n,
    generation: 3n,
    width: 1920,
    height: 1080,
    maxContacts: 10,
    enabled: true,
    availability: 'ready',
  });
  for (const offset of [0, 2, 3, 20, 22, 24, 26, 28]) {
    const bad = Buffer.from(p);
    bad[offset] = 255;
    assert.throws(() => decodeTouchState(bad), ProtocolError);
  }
  for (let n = 0; n < 32; n++)
    assert.throws(() => decodeTouchState(p.subarray(0, n)), ProtocolError);
  const suspended = Buffer.from(p);
  suspended.writeUInt16BE(0, 24);
  suspended.writeUInt16BE(2, 26);
  assert.equal(decodeTouchState(suspended).availability, 'suspended');
});

test('touch: invalid types, shape, signed IDs and coordinates fail before record allocation', () => {
  const inherited = Object.assign(Object.create(event), {
    a: 1,
    b: 2,
    c: 3,
    d: 4,
  });
  for (const invalid of [
    null,
    undefined,
    [],
    'begin',
    1,
    {},
    inherited,
    { ...event, extra: true },
    { action: 'begin', contactId: 1, x: 1 },
    ...['', 'hover', 'pen', 1, null].map((action) => ({ ...event, action })),
    ...[-1, 0x80000000, 0xffffffff, 1.5, NaN, Infinity, '1', null].map(
      (contactId) => ({ ...event, contactId }),
    ),
    ...[-1, 7680, 0xffffffff, 1.5, NaN, Infinity, '1', null].map((x) => ({
      ...event,
      x,
    })),
    ...[-1, 4320, 0xffffffff, 1.5, NaN, Infinity, '1', null].map((y) => ({
      ...event,
      y,
    })),
  ]) {
    assert.equal(validTouchInput(invalid), false);
    assert.throws(() => encodeTouchInput(invalid), ProtocolError);
  }
  assert.equal(validTouchInput(event), true);
});

test('touch: all version/action/reserved byte values, truncation and body overflow reject safely', () => {
  for (let length = 0; length < 16; length++)
    assert.throws(
      () => decodeTouchInput(canonical.subarray(0, length)),
      ProtocolError,
    );
  assert.throws(
    () => decodeTouchInput(Buffer.concat([canonical, Buffer.from([0])])),
    ProtocolError,
  );
  assert.throws(() => decodeTouchInput(null), ProtocolError);
  for (let offset = 0; offset < 4; offset++) {
    for (let value = 0; value <= 255; value++) {
      const literal = Buffer.from(canonical);
      literal[offset] = value;
      const valid =
        offset === 2 ? value >= 1 && value <= 4 : value === canonical[offset];
      if (valid) assert.doesNotThrow(() => decodeTouchInput(literal));
      else assert.throws(() => decodeTouchInput(literal), ProtocolError);
    }
  }
  for (const [offset, value] of [
    [4, 0x80000000],
    [4, 0xffffffff],
    [8, 7680],
    [8, 0xffffffff],
    [12, 4320],
    [12, 0xffffffff],
  ]) {
    const literal = Buffer.from(canonical);
    literal.writeUInt32BE(value, offset);
    assert.throws(() => decodeTouchInput(literal), ProtocolError);
  }
});

test('touch: RWI1 exact-length rejection precedes body allocation; fragmented records preserve IDs', () => {
  const packet = {
    kind: Kind.InputTouch,
    requestId: 0xffffffffffffffffn,
    payload: canonical,
  };
  const wire = encodePacket(packet);
  assert.equal(
    wire.toString('hex'),
    '525749310001001f00000000ffffffffffffffff00000010' +
      canonical.toString('hex'),
  );
  assert.deepEqual(decodeHeader(wire.subarray(0, 24)), {
    kind: Kind.InputTouch,
    requestId: packet.requestId,
    length: 16,
  });
  const decoder = new PacketDecoder();
  const received = [];
  for (const byte of wire)
    decoder.push(Buffer.from([byte]), (value) => received.push(value));
  decoder.finish();
  assert.deepEqual(received, [packet]);
  for (const length of [0, 1, 12, 15, 17, 4096, 0x80000000, 0xffffffff]) {
    const header = Buffer.from(wire.subarray(0, 24));
    header.writeUInt32BE(length, 20);
    assert.throws(() => decodeHeader(header), ProtocolError);
    assert.throws(
      () => new PacketDecoder().push(header, () => assert.fail()),
      ProtocolError,
    );
  }
  for (const length of [15, 17])
    assert.throws(
      () => encodePacket({ ...packet, payload: Buffer.alloc(length) }),
      ProtocolError,
    );
});
