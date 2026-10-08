import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeCursorUpdate,
  validateCursorState,
  encodeCursorShape,
  encodePacket,
  Kind,
  ProtocolError,
  MAX_CURSOR_BYTES,
} from '../../packages/protocol/dist/index.js';
import { cursorState, cursorPayload } from '../fixtures/cursor.mjs';
test('cursor protocol: owned RGBA, metadata-only updates and independent binary stream', () => {
  const p = cursorPayload();
  const state = decodeCursorUpdate(p);
  assert.deepEqual(state, cursorState());
  p[40] = 0;
  assert.equal(state.rgba[0], 255);
  assert.equal(decodeCursorUpdate(cursorPayload(state, false)).rgba, undefined);
  const r = encodeCursorShape(state, 3);
  assert.equal(r.toString('ascii', 0, 4), 'RWB1');
  assert.equal(r[5], 5);
  assert.equal(r.readUInt32BE(8), 2);
  assert.equal(r.readUInt32BE(12), 3);
  assert.equal(r.readBigUInt64BE(16), state.timestampUs);
  assert.equal(r.readBigUInt64BE(32), state.shapeId);
  assert.equal(r.readUInt16BE(44), 1);
  assert.equal(r.readUInt16BE(46), 1);
  assert.deepEqual(r.subarray(48), state.rgba);
});
test('cursor protocol: rejects dimensions, flags, partial pixels and oversized classes before body allocation', () => {
  for (const modify of [
    (p) => p.writeUInt16BE(2, 0),
    (p) => p.writeUInt16BE(16, 2),
    (p) => p.writeUInt16BE(385, 32),
    (p) => p.writeUInt16BE(2, 36),
    (p) => p.writeBigUInt64BE(0n, 4),
    (p) => p.writeBigUInt64BE(0n, 12),
  ]) {
    const p = cursorPayload();
    modify(p);
    assert.throws(() => decodeCursorUpdate(p), ProtocolError);
  }
  assert.throws(
    () => decodeCursorUpdate(cursorPayload().subarray(0, 55)),
    ProtocolError,
  );
  assert.throws(
    () =>
      encodePacket({
        kind: Kind.CursorUpdate,
        requestId: 0n,
        payload: Buffer.alloc(39),
      }),
    ProtocolError,
  );
  assert.throws(
    () =>
      encodePacket({
        kind: Kind.CursorUpdate,
        requestId: 0n,
        payload: Buffer.alloc(MAX_CURSOR_BYTES + 41),
      }),
    ProtocolError,
  );
  assert.throws(
    () => validateCursorState(cursorState({ rgba: Buffer.alloc(17) })),
    ProtocolError,
  );
  assert.throws(
    () => validateCursorState(cursorState({ hotY: 2 })),
    ProtocolError,
  );
  assert.throws(
    () => encodeCursorShape(cursorState(), 0x100000000),
    ProtocolError,
  );
  const system = cursorState({
    default: true,
    shapeId: 0n,
    width: 0,
    height: 0,
    hotX: 0,
    hotY: 0,
    rgba: undefined,
  });
  assert.doesNotThrow(() => validateCursorState(system));
  assert.equal(decodeCursorUpdate(cursorPayload(system)).default, true);
});
