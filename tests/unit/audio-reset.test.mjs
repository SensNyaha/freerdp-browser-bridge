import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Kind,
  PacketDecoder,
  ProtocolError,
  decodeHeader,
  encodePacket,
  encodeAudioReset,
  decodeAudioReset,
  encodeAudioResetResult,
  decodeAudioResetResult,
} from '../../packages/protocol/dist/index.js';

test('audio reset codec: exact golden request, nonzero u64 and reserved/schema boundaries', () => {
  const golden = Buffer.from('010000000102030405060708', 'hex');
  assert.deepEqual(encodeAudioReset(0x0102030405060708n), golden);
  assert.equal(decodeAudioReset(golden), 0x0102030405060708n);
  assert.equal(
    decodeAudioReset(encodeAudioReset(0xffffffffffffffffn)),
    0xffffffffffffffffn,
  );
  for (const value of [0n, -1n, 0x10000000000000000n, 1, null])
    assert.throws(() => encodeAudioReset(value), ProtocolError);
  for (let n = 0; n < 12; n++)
    assert.throws(() => decodeAudioReset(golden.subarray(0, n)), ProtocolError);
  assert.throws(
    () => decodeAudioReset(Buffer.concat([golden, Buffer.from([0])])),
    ProtocolError,
  );
  assert.throws(
    () => decodeAudioReset(Buffer.from('010000000000000000000000', 'hex')),
    ProtocolError,
  );
  for (let i = 0; i < 4; i++)
    for (let value = 0; value < 256; value++) {
      const bytes = Buffer.from(golden);
      bytes[i] = value;
      if (bytes.equals(golden))
        assert.equal(decodeAudioReset(bytes), 0x0102030405060708n);
      else assert.throws(() => decodeAudioReset(bytes), ProtocolError);
    }
});
test('audio reset codec: all result codes and malformed exact bodies', () => {
  const statuses = ['scheduled', 'stale', 'unavailable', 'busy'];
  for (let code = 0; code < 256; code++) {
    const bytes = Buffer.from([1, code, 0, 0]);
    if (code < 4) {
      assert.equal(decodeAudioResetResult(bytes), statuses[code]);
      assert.deepEqual(encodeAudioResetResult(statuses[code]), bytes);
    } else assert.throws(() => decodeAudioResetResult(bytes), ProtocolError);
  }
  for (const value of ['', 'ready', 0, null])
    assert.throws(() => encodeAudioResetResult(value), ProtocolError);
  const golden = encodeAudioResetResult('unavailable');
  for (let n = 0; n < 4; n++)
    assert.throws(
      () => decodeAudioResetResult(golden.subarray(0, n)),
      ProtocolError,
    );
  assert.throws(
    () => decodeAudioResetResult(Buffer.concat([golden, Buffer.from([0])])),
    ProtocolError,
  );
  for (const i of [0, 2, 3]) {
    const bytes = Buffer.from(golden);
    bytes[i] = 255;
    assert.throws(() => decodeAudioResetResult(bytes), ProtocolError);
  }
});
test('audio reset framing: correlation and length before allocation, every fragmentation boundary', () => {
  for (const [kind, payload] of [
    [Kind.AudioReset, encodeAudioReset(1n)],
    [Kind.AudioResetResult, encodeAudioResetResult('busy')],
  ]) {
    assert.throws(
      () => encodePacket({ kind, requestId: 0n, payload }),
      ProtocolError,
    );
    const packet = { kind, requestId: 0xffffffffffffffffn, payload };
    const wire = encodePacket(packet);
    for (const length of [
      0,
      payload.length - 1,
      payload.length + 1,
      0xffffffff,
    ]) {
      const header = Buffer.from(wire.subarray(0, 24));
      header.writeUInt32BE(length, 20);
      assert.throws(() => decodeHeader(header), ProtocolError);
      assert.throws(
        () => new PacketDecoder().push(header, () => assert.fail()),
        ProtocolError,
      );
    }
    const zero = Buffer.from(wire.subarray(0, 24));
    zero.writeBigUInt64BE(0n, 12);
    assert.throws(() => decodeHeader(zero), ProtocolError);
    for (let split = 0; split <= wire.length; split++) {
      const decoder = new PacketDecoder();
      const records = [];
      decoder.push(wire.subarray(0, split), (p) => records.push(p));
      decoder.push(wire.subarray(split), (p) => records.push(p));
      decoder.finish();
      assert.deepEqual(records, [packet]);
    }
  }
});
