import { ProtocolError } from './index.js';
import type { TouchInput } from './touch.js';

export type InputEvent =
  | { type: 'key'; scancode: number; down: boolean; repeat: boolean }
  | { type: 'move'; x: number; y: number }
  | { type: 'button'; x: number; y: number; button: number; down: boolean }
  | { type: 'wheel'; delta: number; horizontal: boolean }
  | { type: 'sync'; toggles: number }
  | { type: 'text'; text: string }
  | ({ type: 'touch'; generation: bigint } & TouchInput)
  | { type: 'reset' };

export const MAX_TEXT_UNITS = 256;
/** Well-formed UTF-16; no NUL/C0/C1 controls except tab and line endings. */
export function validInputText(text: unknown): text is string {
  return (
    typeof text === 'string' &&
    text.length > 0 &&
    text.length <= MAX_TEXT_UNITS &&
    !/[\ud800-\udfff]/u.test(text) &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(text)
  );
}
export function encodeInputText(text: string): Buffer {
  if (!validInputText(text)) throw new ProtocolError();
  const p = Buffer.alloc(text.length * 2);
  for (let i = 0; i < text.length; i++)
    p.writeUInt16BE(text.charCodeAt(i), i * 2);
  return p;
}

/** Physical browser codes map to set-1 RDP scancodes, extended keys retain bit 8. */
const codes: Record<string, number> = {
  Escape: 1,
  Digit1: 2,
  Digit2: 3,
  Digit3: 4,
  Digit4: 5,
  Digit5: 6,
  Digit6: 7,
  Digit7: 8,
  Digit8: 9,
  Digit9: 10,
  Digit0: 11,
  Minus: 12,
  Equal: 13,
  Backspace: 14,
  Tab: 15,
  KeyQ: 16,
  KeyW: 17,
  KeyE: 18,
  KeyR: 19,
  KeyT: 20,
  KeyY: 21,
  KeyU: 22,
  KeyI: 23,
  KeyO: 24,
  KeyP: 25,
  BracketLeft: 26,
  BracketRight: 27,
  Enter: 28,
  ControlLeft: 29,
  KeyA: 30,
  KeyS: 31,
  KeyD: 32,
  KeyF: 33,
  KeyG: 34,
  KeyH: 35,
  KeyJ: 36,
  KeyK: 37,
  KeyL: 38,
  Semicolon: 39,
  Quote: 40,
  Backquote: 41,
  ShiftLeft: 42,
  Backslash: 43,
  KeyZ: 44,
  KeyX: 45,
  KeyC: 46,
  KeyV: 47,
  KeyB: 48,
  KeyN: 49,
  KeyM: 50,
  Comma: 51,
  Period: 52,
  Slash: 53,
  ShiftRight: 54,
  NumpadMultiply: 55,
  AltLeft: 56,
  Space: 57,
  CapsLock: 58,
  F1: 59,
  F2: 60,
  F3: 61,
  F4: 62,
  F5: 63,
  F6: 64,
  F7: 65,
  F8: 66,
  F9: 67,
  F10: 68,
  NumLock: 69,
  ScrollLock: 70,
  Numpad7: 71,
  Numpad8: 72,
  Numpad9: 73,
  NumpadSubtract: 74,
  Numpad4: 75,
  Numpad5: 76,
  Numpad6: 77,
  NumpadAdd: 78,
  Numpad1: 79,
  Numpad2: 80,
  Numpad3: 81,
  Numpad0: 82,
  NumpadDecimal: 83,
  IntlBackslash: 86,
  F11: 87,
  F12: 88,
  NumpadEnter: 0x11c,
  ControlRight: 0x11d,
  NumpadDivide: 0x135,
  PrintScreen: 0x137,
  AltRight: 0x138,
  Home: 0x147,
  ArrowUp: 0x148,
  PageUp: 0x149,
  ArrowLeft: 0x14b,
  ArrowRight: 0x14d,
  End: 0x14f,
  ArrowDown: 0x150,
  PageDown: 0x151,
  Insert: 0x152,
  Delete: 0x153,
  MetaLeft: 0x15b,
  MetaRight: 0x15c,
  ContextMenu: 0x15d,
};
export function physicalScancode(code: string): number | undefined {
  return Object.hasOwn(codes, code) ? codes[code] : undefined;
}
export function encodeInput(event: InputEvent): Buffer {
  const p = Buffer.alloc(12);
  const integer = (n: number, min: number, max: number) => {
    if (!Number.isInteger(n) || n < min || n > max) throw new ProtocolError();
    return n;
  };
  const boolean = (b: boolean) => {
    if (typeof b !== 'boolean') throw new ProtocolError();
    return b ? 1 : 0;
  };
  switch (event.type) {
    case 'key':
      p[0] = 1;
      p[1] = boolean(event.down) | (boolean(event.repeat) << 1);
      if (
        (!event.down && event.repeat) ||
        !(event.scancode & 255) ||
        (event.scancode & 255) > 127
      )
        throw new ProtocolError();
      p.writeUInt16BE(integer(event.scancode, 1, 511), 2);
      break;
    case 'move':
    case 'button':
      p[0] = event.type === 'move' ? 2 : 3;
      p.writeUInt16BE(integer(event.x, 0, 7679), 2);
      p.writeUInt16BE(integer(event.y, 0, 4319), 4);
      if (event.type === 'button') {
        p[1] = boolean(event.down);
        p.writeUInt16BE(integer(event.button, 0, 4), 6);
      }
      break;
    case 'wheel':
      p[0] = 4;
      p[1] = boolean(event.horizontal);
      if (event.delta === 0) throw new ProtocolError();
      p.writeInt16BE(integer(event.delta, -255, 255), 2);
      break;
    case 'reset':
      p[0] = 5;
      break;
    case 'sync':
      p[0] = 6;
      p.writeUInt16BE(integer(event.toggles, 0, 7), 2);
      break;
    default:
      throw new ProtocolError();
  }
  return p;
}
