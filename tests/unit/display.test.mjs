import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Kind,
  ProtocolError,
  encodePacket,
  decodeHeader,
  PacketDecoder,
  decodeDisplayState,
  encodeDisplayResize,
  decodeDisplayResizeResult,
} from '../../packages/protocol/dist/index.js';

test('display IPC: independent observed-state vector, bounded flags and geometry', () => {
  const bytes = Buffer.from(
    '000000000000000100000000000000020780043803000f0008700000007e9000',
    'hex',
  );
  assert.deepEqual(decodeDisplayState(bytes), {
    generation: 1n,
    framebufferRevision: 2n,
    width: 1920,
    height: 1080,
    dynamicResolution: true,
    negotiated: true,
    maxWidth: 3840,
    maxHeight: 2160,
    maxArea: 8294400,
  });
  const disabled = Buffer.from(bytes);
  disabled[20] = 0;
  disabled.fill(0, 22);
  assert.equal(decodeDisplayState(disabled).negotiated, false);
  for (const offset of [7, 15, 16, 18, 20, 21, 22, 24, 26, 28]) {
    const bad = Buffer.from(bytes);
    bad[offset] = offset === 7 || offset === 15 ? 0 : 255;
    assert.throws(
      () => decodeDisplayState(bad),
      ProtocolError,
      `offset ${offset}`,
    );
  }
  for (let length = 0; length < 32; length++)
    assert.throws(
      () => decodeDisplayState(bytes.subarray(0, length)),
      ProtocolError,
    );
  assert.throws(
    () => decodeDisplayState(Buffer.concat([bytes, Buffer.alloc(1)])),
    ProtocolError,
  );
  assert.equal(encodeDisplayResize(1280, 720).toString('hex'), '050002d0');
  assert.equal(encodeDisplayResize(0, 65535).toString('hex'), '0000ffff');
  for (const bad of [-1, 65536, 1.5, NaN, '1280']) {
    assert.throws(() => encodeDisplayResize(bad, 720), ProtocolError);
    assert.throws(() => encodeDisplayResize(1280, bad), ProtocolError);
  }
  const statuses = [
    'applied',
    'unchanged',
    'unavailable',
    'invalid',
    'busy',
    'send-failed',
    'timeout',
    'disconnected',
  ];
  for (let value = 0; value < statuses.length; value++)
    assert.equal(
      decodeDisplayResizeResult(Buffer.from([0, value, 0, 0])),
      statuses[value],
    );
  for (const bad of ['00080000', '00000001', '000000', '0000000000'])
    assert.throws(
      () => decodeDisplayResizeResult(Buffer.from(bad, 'hex')),
      ProtocolError,
    );
});

test('display IPC: exact record bounds before body allocation and fragmented events', () => {
  const records = [
    { kind: Kind.DisplayUpdate, requestId: 0n, payload: Buffer.alloc(32) },
    {
      kind: Kind.DisplayResize,
      requestId: 3n,
      payload: encodeDisplayResize(1280, 720),
    },
    {
      kind: Kind.DisplayResizeResult,
      requestId: 3n,
      payload: Buffer.from([0, 6, 0, 0]),
    },
  ];
  for (const record of records) {
    const bytes = encodePacket(record);
    const header = Buffer.from(bytes.subarray(0, 24));
    for (const length of [
      0,
      record.payload.length - 1,
      record.payload.length + 1,
      0xffffffff,
    ]) {
      header.writeUInt32BE(length, 20);
      assert.throws(() => decodeHeader(header), ProtocolError);
      const decoder = new PacketDecoder();
      assert.throws(
        () => decoder.push(header, () => assert.fail()),
        ProtocolError,
      );
    }
  }
  const bytes = Buffer.concat(records.map(encodePacket));
  for (let split = 0; split <= bytes.length; split++) {
    const decoder = new PacketDecoder();
    const output = [];
    decoder.push(bytes.subarray(0, split), (packet) => output.push(packet));
    decoder.push(bytes.subarray(split), (packet) => output.push(packet));
    decoder.finish();
    assert.deepEqual(output, records);
  }
});
