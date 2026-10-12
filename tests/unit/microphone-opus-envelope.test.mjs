import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Kind,
  ProtocolError,
  PacketDecoder,
  encodePacket,
  decodeHeader,
  encodeMicrophoneOpus,
  decodeMicrophoneOpus,
} from '../../packages/protocol/dist/index.js';
test('microphone Opus RWI1: correlation and 26..1299 limits are refused at the header before body allocation', () => {
  for (const length of [26, 1299]) {
    const body = encodeMicrophoneOpus({
      epoch: 1n,
      timestampUs: 0n,
      discontinuity: true,
      lookaheadFrames: 312,
      encoded: Buffer.alloc(length - 24, 0xfc),
    });
    const packet = {
      kind: Kind.MicrophoneOpus,
      requestId: 0xffffffffffffffffn,
      payload: body,
    };
    const wire = encodePacket(packet);
    assert.equal(wire[7], 44);
    assert.equal(wire.readUInt32BE(20), length);
    assert.equal(
      decodeHeader(wire.subarray(0, 24)).requestId,
      packet.requestId,
    );
    for (let split = 0; split <= wire.length; split++) {
      const decoder = new PacketDecoder(),
        records = [];
      decoder.push(wire.subarray(0, split), (p) => records.push(p));
      decoder.push(wire.subarray(split), (p) => records.push(p));
      decoder.finish();
      assert.deepEqual(records, [packet]);
      assert.equal(
        decodeMicrophoneOpus(records[0].payload).lookaheadFrames,
        312,
      );
    }
    for (const bad of [0, 1, 24, 25, 1300, 0xffffffff]) {
      const header = Buffer.from(wire.subarray(0, 24));
      header.writeUInt32BE(bad, 20);
      assert.throws(() => decodeHeader(header), ProtocolError);
      assert.throws(
        () => new PacketDecoder().push(header, () => assert.fail()),
        ProtocolError,
      );
    }
    const zero = Buffer.from(wire.subarray(0, 24));
    zero.writeBigUInt64BE(0n, 12);
    assert.throws(() => decodeHeader(zero), ProtocolError);
    assert.throws(
      () => encodePacket({ ...packet, requestId: 0n }),
      ProtocolError,
    );
  }
});
