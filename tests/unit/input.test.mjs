import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  encodeInput,
  physicalScancode,
  Kind,
  encodePacket,
  decodeHeader,
  ProtocolError,
  encodeInputText,
  validInputText,
} from '../../packages/protocol/dist/index.js';
import { normalizeInput } from '../../apps/bridge-api/dist/input.js';
const { validText } = await import(
  'data:text/javascript;base64,' +
    (await readFile('apps/reference-harness/text.js')).toString('base64')
);

test('Unicode browser and Node validation agree on every BMP unit and supplementary boundaries', () => {
  for (let unit = 0; unit <= 0xffff; unit++) {
    const text = String.fromCharCode(unit);
    const expected =
      (unit >= 32 || [9, 10, 13].includes(unit)) &&
      !(unit >= 127 && unit <= 159) &&
      !(unit >= 0xd800 && unit <= 0xdfff);
    assert.equal(validText(text), expected);
    assert.equal(validInputText(text), expected);
  }
  for (const text of [
    '😀'.repeat(128),
    'a'.repeat(255) + '😀',
    '\ud800a',
    'Ж中😀',
    'a\u0301',
  ])
    assert.equal(validText(text), validInputText(text));
});

test('Unicode text: bounded UTF16BE vectors preserve combining and supplementary characters', () => {
  const text = 'Ж中😀';
  const payload = encodeInputText(text);
  assert.equal(payload.toString('hex'), '04164e2dd83dde00');
  const record = encodePacket({
    kind: Kind.InputText,
    requestId: 42n,
    payload,
  });
  assert.equal(
    record.subarray(0, 24).toString('hex'),
    '525749310001001e00000000000000000000002a00000008',
  );
  assert.deepEqual(normalizeInput('input.text', { text }), {
    type: 'text',
    text,
  });
  for (const value of [
    'a'.repeat(256),
    '😀'.repeat(128),
    'e\u0301',
    '\t\r\n',
  ]) {
    assert.equal(validInputText(value), true);
    assert.equal(encodeInputText(value).length, value.length * 2);
  }
});
test('Unicode text: malformed surrogate/control/oversize records never allocate or echo text', () => {
  for (const value of [
    '',
    'x'.repeat(257),
    '😀'.repeat(129),
    '\ud800',
    '\udc00',
    '\ud800a',
    '\udc00\ud800',
    '\0',
    '\x1b',
    '\x7f',
    '\x85',
    123,
    null,
  ]) {
    assert.equal(validInputText(value), false);
    assert.equal(normalizeInput('input.text', { text: value }), undefined);
    assert.throws(() => encodeInputText(value), {
      message: 'Invalid worker IPC record',
    });
  }
  assert.equal(
    normalizeInput('input.text', { text: 'ok', extra: true }),
    undefined,
  );
  for (const size of [0, 1, 3, 511, 513, 65536])
    assert.throws(
      () =>
        encodePacket({
          kind: Kind.InputText,
          requestId: 1n,
          payload: Buffer.alloc(size),
        }),
      ProtocolError,
    );
});

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
test('international physical codes use set-1 positions without accepting logical character aliases', () => {
  for (const [code, scan] of [
    ['IntlRo', 0x73],
    ['IntlYen', 0x7d],
    ['KanaMode', 0x70],
    ['Convert', 0x79],
    ['NonConvert', 0x7b],
    ['Lang1', 0x72],
    ['Lang2', 0x71],
    ['NumpadComma', 0x7e],
  ]) {
    assert.equal(physicalScancode(code), scan);
    const e = normalizeInput('input.key', { code, down: true, repeat: false });
    assert.deepEqual(e, {
      type: 'key',
      scancode: scan,
      down: true,
      repeat: false,
    });
    assert.equal(
      encodeInput(e).toString('hex'),
      '010100' + scan.toString(16) + '0000000000000000',
    );
  }
  for (const code of ['¥', 'ろ', 'HangulMode', '無変換', 'Lang3', 'Lang4'])
    assert.equal(physicalScancode(code), undefined);
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
