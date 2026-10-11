import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Kind,
  ProtocolError,
  PacketDecoder,
  encodePacket,
  decodeHeader,
  decodeBuild,
  encodeMicrophoneReset,
  decodeMicrophoneReset,
  encodeMicrophoneResetResult,
  decodeMicrophoneResetResult,
} from '../../packages/protocol/dist/index.js';

test('microphone reset: independent input epoch vector and exact parser bounds', () => {
  const request = Buffer.from('010000000102030405060708', 'hex');
  assert.deepEqual(encodeMicrophoneReset(0x0102030405060708n), request);
  assert.equal(decodeMicrophoneReset(request), 0x0102030405060708n);
  for (const epoch of [0n, -1n, 1n << 64n, 1, null])
    assert.throws(() => encodeMicrophoneReset(epoch), ProtocolError);
  for (let length = 0; length < 12; ++length)
    assert.throws(
      () => decodeMicrophoneReset(request.subarray(0, length)),
      ProtocolError,
    );
  assert.throws(
    () => decodeMicrophoneReset(Buffer.concat([request, Buffer.alloc(1)])),
    ProtocolError,
  );
  for (const at of [0, 1, 2, 3]) {
    const invalid = Buffer.from(request);
    invalid[at] ^= 1;
    assert.throws(() => decodeMicrophoneReset(invalid), ProtocolError);
  }
  const results = ['scheduled', 'stale', 'unavailable', 'busy'];
  for (let code = 0; code < 256; ++code) {
    const bytes = Buffer.from([1, code, 0, 0]);
    if (code < 4) {
      assert.equal(decodeMicrophoneResetResult(bytes), results[code]);
      assert.deepEqual(encodeMicrophoneResetResult(results[code]), bytes);
    } else
      assert.throws(() => decodeMicrophoneResetResult(bytes), ProtocolError);
  }
  for (const [kind, payload] of [
    [Kind.MicrophoneReset, request],
    [Kind.MicrophoneResetResult, Buffer.from([1, 2, 0, 0])],
  ]) {
    const packet = { kind, requestId: 8n, payload };
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
    assert.throws(
      () => encodePacket({ ...packet, requestId: 0n }),
      ProtocolError,
    );
    for (let split = 0; split <= wire.length; ++split) {
      const decoder = new PacketDecoder(),
        packets = [];
      decoder.push(wire.subarray(0, split), (value) => packets.push(value));
      decoder.push(wire.subarray(split), (value) => packets.push(value));
      decoder.finish();
      assert.deepEqual(packets, [packet]);
    }
  }
});
test('microphone reset HELLO extension: fixed version, legacy absence, dependency and unknown flags', () => {
  const report = (flags = 32773) => {
    const header = Buffer.alloc(4);
    header.writeUInt16BE(1);
    header.writeUInt16BE(flags, 2);
    return Buffer.concat([
      header,
      ...[
        '0.1.0',
        'fixture',
        '3.32.1',
        '3.32.1',
        'fake',
        'x64',
        'framed-pipes',
      ].flatMap((text) => {
        const bytes = Buffer.from(text),
          length = Buffer.alloc(2);
        length.writeUInt16BE(bytes.length);
        return [length, bytes];
      }),
    ]);
  };
  const extension = Buffer.from('0001000000000001', 'hex');
  assert.equal(decodeBuild(report()).capabilities.microphoneReset, false);
  assert.equal(
    decodeBuild(Buffer.concat([report(), extension])).capabilities
      .microphoneReset,
    true,
  );
  const empty = Buffer.from('0001000000000000', 'hex');
  assert.equal(
    decodeBuild(Buffer.concat([report(1), empty])).capabilities.microphoneReset,
    false,
  );
  assert.throws(
    () => decodeBuild(Buffer.concat([report(5), extension])),
    ProtocolError,
  );
  for (let length = 1; length < 8; ++length)
    assert.throws(
      () =>
        decodeBuild(Buffer.concat([report(), extension.subarray(0, length)])),
      ProtocolError,
    );
  assert.throws(
    () => decodeBuild(Buffer.concat([report(), extension, Buffer.alloc(1)])),
    ProtocolError,
  );
  for (const at of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const bytes = Buffer.from(extension);
    bytes[at] ^= at === 7 ? 2 : 1;
    assert.throws(
      () => decodeBuild(Buffer.concat([report(), bytes])),
      ProtocolError,
    );
  }
});
