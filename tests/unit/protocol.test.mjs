import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Kind,
  PacketDecoder,
  ProtocolError,
  decodeHeader,
  encodePacket,
  helloPayload,
  decodeBuild,
} from '../../packages/protocol/dist/index.js';

test('RWI1 golden network-order vector is independent of native serializer', () => {
  const packet = encodePacket({
    kind: Kind.Hello,
    requestId: 0x0102030405060708n,
    payload: helloPayload(),
  });
  assert.equal(
    packet.toString('hex'),
    '5257493100010001000000000102030405060708000000080001000100000000',
  );
});

test('fragmentation at every split and coalesced empty records', () => {
  const records = [
    { kind: Kind.Hello, requestId: 1n, payload: helloPayload() },
    { kind: Kind.Heartbeat, requestId: 2n, payload: Buffer.alloc(0) },
    {
      kind: Kind.Shutdown,
      requestId: 0xffffffffffffffffn,
      payload: Buffer.alloc(0),
    },
  ];
  const bytes = Buffer.concat(records.map(encodePacket));
  for (let i = 0; i <= bytes.length; ++i) {
    const decoder = new PacketDecoder();
    const output = [];
    decoder.push(bytes.subarray(0, i), (packet) => output.push(packet));
    decoder.push(bytes.subarray(i), (packet) => output.push(packet));
    decoder.finish();
    assert.deepEqual(output, records);
  }
  const decoder = new PacketDecoder();
  const output = [];
  for (const byte of bytes)
    decoder.push(Buffer.from([byte]), (packet) => output.push(packet));
  assert.deepEqual(output, records);
});

test('reject unknown kinds, versions, flags and lengths before payload allocation', () => {
  const good = encodePacket({
    kind: Kind.Heartbeat,
    requestId: 1n,
    payload: Buffer.alloc(0),
  });
  for (const index of [0, 4, 7, 8, 20, 23]) {
    const bad = Buffer.from(good);
    bad[index] = 255;
    const decoder = new PacketDecoder();
    assert.throws(() => decoder.push(bad, () => assert.fail()), ProtocolError);
    assert.throws(() => decoder.push(good, () => assert.fail()), ProtocolError);
  }
  assert.throws(
    () =>
      encodePacket({
        kind: Kind.HelloAck,
        requestId: 1n,
        payload: Buffer.alloc(4097),
      }),
    ProtocolError,
  );
  assert.throws(
    () =>
      encodePacket({
        kind: Kind.Hello,
        requestId: 1n,
        payload: Buffer.alloc(7),
      }),
    ProtocolError,
  );
  assert.throws(() => decodeHeader(good.subarray(0, 23)), ProtocolError);
  const highBit = Buffer.from(good);
  highBit[0] |= 128;
  assert.throws(() => decodeHeader(highBit), ProtocolError);
});

test('truncated streams and malformed build reports never interpolate input into errors', () => {
  const packet = encodePacket({
    kind: Kind.Hello,
    requestId: 1n,
    payload: helloPayload(),
  });
  for (let n = 1; n < packet.length; ++n) {
    const decoder = new PacketDecoder();
    decoder.push(packet.subarray(0, n), () => assert.fail());
    assert.throws(() => decoder.finish(), ProtocolError);
  }
  const sentinel = 'sensitive-SENTINEL';
  assert.throws(
    () => decodeBuild(Buffer.from(sentinel)),
    (error) => !error.message.includes(sentinel),
  );
});
