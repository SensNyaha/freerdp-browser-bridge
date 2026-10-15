import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Kind,
  PacketDecoder,
  decodeHeader,
  encodePacket,
  ProtocolError,
  encodeClipboardState,
  encodeClipboardCommand,
  encodeClipboardResult,
  CLIPBOARD_MAX_RECORD_BYTES,
} from '../../packages/protocol/dist/index.js';
function header(kind, requestId, length) {
  const h = Buffer.alloc(24);
  h.write('RWI1');
  h.writeUInt16BE(1, 4);
  h.writeUInt16BE(kind, 6);
  h.writeBigUInt64BE(requestId, 12);
  h.writeUInt32BE(length, 20);
  return h;
}
test('clipboard RWI1: class bounds and correlation reject invalid headers before body allocation', () => {
  for (const kind of [Kind.ClipboardCommand, Kind.ClipboardResult]) {
    for (const length of [24, CLIPBOARD_MAX_RECORD_BYTES])
      assert.equal(decodeHeader(header(kind, 1n, length)).length, length);
    for (const length of [0, 23, CLIPBOARD_MAX_RECORD_BYTES + 1, 0xffffffff]) {
      const h = header(kind, 1n, length);
      assert.throws(() => decodeHeader(h), ProtocolError);
      const d = new PacketDecoder();
      assert.throws(
        () => d.push(h, () => assert.fail('Invalid header dispatched')),
        ProtocolError,
      );
      assert.throws(() => d.finish(), ProtocolError);
    }
    assert.throws(() => decodeHeader(header(kind, 0n, 24)), ProtocolError);
  }
  assert.equal(decodeHeader(header(Kind.ClipboardState, 0n, 24)).length, 24);
  assert.throws(
    () => decodeHeader(header(Kind.ClipboardState, 1n, 24)),
    ProtocolError,
  );
  for (const length of [0, 23, 25, CLIPBOARD_MAX_RECORD_BYTES])
    assert.throws(
      () => decodeHeader(header(Kind.ClipboardState, 0n, length)),
      ProtocolError,
    );
  // Raising the carrier ceiling does not change video or control class limits.
  assert.throws(
    () => decodeHeader(header(Kind.Frame, 1n, CLIPBOARD_MAX_RECORD_BYTES)),
    ProtocolError,
  );
  assert.throws(
    () => decodeHeader(header(Kind.HelloAck, 1n, 4097)),
    ProtocolError,
  );
});
test('clipboard RWI1: arbitrary fragmentation preserves state command/result and heartbeat boundaries', () => {
  const command = {
    operation: 'set',
    generation: 1n,
    revision: 0n,
    text: Buffer.from('Ж😀\n'),
  };
  const packets = [
    {
      kind: Kind.ClipboardState,
      requestId: 0n,
      payload: encodeClipboardState({
        generation: 1n,
        revision: 1n,
        maximum: 1024,
        ready: true,
        toServer: true,
        fromServer: true,
        remoteText: true,
        localAccepted: false,
        localPending: false,
        remotePending: false,
      }),
    },
    {
      kind: Kind.ClipboardCommand,
      requestId: 1n,
      payload: encodeClipboardCommand(command),
    },
    {
      kind: Kind.ClipboardResult,
      requestId: 1n,
      payload: encodeClipboardResult({
        ...command,
        status: 'unavailable',
        text: Buffer.alloc(0),
      }),
    },
    { kind: Kind.HeartbeatAck, requestId: 2n, payload: Buffer.alloc(0) },
  ];
  const bytes = Buffer.concat(packets.map(encodePacket));
  for (let split = 0; split <= bytes.length; ++split) {
    const decoder = new PacketDecoder(),
      observed = [];
    decoder.push(bytes.subarray(0, split), (p) => observed.push(p));
    decoder.push(bytes.subarray(split), (p) => observed.push(p));
    decoder.finish();
    assert.deepEqual(observed, packets);
  }
});
