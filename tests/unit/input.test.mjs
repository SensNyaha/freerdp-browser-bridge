import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeInput,
  physicalScancode,
  Kind,
  encodePacket,
  decodeHeader,
  ProtocolError,
} from '../../packages/protocol/dist/index.js';
import { normalizeInput } from '../../apps/bridge-api/dist/input.js';

test('physical input golden vectors match pinned FreeRDP set-1 and preserve right modifiers', () => {
  for (const [code, scan] of [
    ['KeyA', 30],
    ['ControlLeft', 29],
    ['ControlRight', 0x11d],
    ['AltRight', 0x138],
    ['ArrowUp', 0x148],
    ['NumpadEnter', 0x11c],
  ])
    assert.equal(physicalScancode(code), scan);
  assert.equal(physicalScancode('constructor'), undefined);
  assert.equal(physicalScancode('Pause'), undefined);
  const p = encodeInput({
    type: 'key',
    scancode: 0x11d,
    down: true,
    repeat: false,
  });
  assert.equal(p.toString('hex'), '0101011d0000000000000000');
  assert.equal(
    encodeInput({ type: 'wheel', delta: -120, horizontal: false }).toString(
      'hex',
    ),
    '0400ff880000000000000000',
  );
  assert.equal(
    encodeInput({
      type: 'button',
      x: 1919,
      y: 1079,
      button: 4,
      down: false,
    }).toString('hex'),
    '0300077f0437000400000000',
  );
  assert.equal(
    decodeHeader(
      encodePacket({ kind: Kind.Input, requestId: 2n, payload: p }).subarray(
        0,
        24,
      ),
    ).length,
    12,
  );
  assert.throws(
    () =>
      encodePacket({
        kind: Kind.Input,
        requestId: 1n,
        payload: Buffer.alloc(13),
      }),
    ProtocolError,
  );
});
test('input schema rejects arbitrary flags, unknown physical codes and out-of-range coordinates', () => {
  assert.deepEqual(
    normalizeInput('input.key', { code: 'KeyA', down: true, repeat: false }),
    { type: 'key', scancode: 30, down: true, repeat: false },
  );
  for (const [type, data] of [
    ['input.key', { code: 'constructor', down: true, repeat: false }],
    ['input.key', { code: 'KeyA', down: false, repeat: true }],
    ['input.key', { code: 'KeyA', down: true, repeat: false, flags: 32768 }],
    ['input.pointer', { action: 'move', x: 7680, y: 1 }],
    ['input.pointer', { action: 'button', x: 1, y: 2, button: 5, down: true }],
    ['input.wheel', { delta: 0, horizontal: false }],
    ['input.wheel', { delta: -256, horizontal: true }],
    ['input.sync', { toggles: 8 }],
    ['input.reset', { extra: true }],
  ])
    assert.equal(normalizeInput(type, data), undefined);
  for (const event of [
    { type: 'key', scancode: 512, down: true, repeat: false },
    { type: 'key', scancode: 30, down: false, repeat: true },
    { type: 'move', x: -1, y: 0 },
    { type: 'wheel', delta: 256, horizontal: true },
    { type: 'sync', toggles: NaN },
  ])
    assert.throws(() => encodeInput(event), ProtocolError);
});
