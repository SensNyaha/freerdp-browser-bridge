import { Type } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import {
  physicalScancode,
  validInputText,
  type InputEvent,
} from '@freerdp-bridge/protocol';

const object = { additionalProperties: false };
const coordinate = (maximum: number) => Type.Integer({ minimum: 0, maximum });
const key = TypeCompiler.Compile(
  Type.Object(
    {
      code: Type.String({ minLength: 1, maxLength: 32 }),
      down: Type.Boolean(),
      repeat: Type.Boolean(),
    },
    object,
  ),
);
const pointer = TypeCompiler.Compile(
  Type.Union([
    Type.Object(
      {
        action: Type.Literal('move'),
        x: coordinate(7679),
        y: coordinate(4319),
      },
      object,
    ),
    Type.Object(
      {
        action: Type.Literal('button'),
        x: coordinate(7679),
        y: coordinate(4319),
        button: coordinate(4),
        down: Type.Boolean(),
      },
      object,
    ),
  ]),
);
const wheel = TypeCompiler.Compile(
  Type.Object(
    {
      delta: Type.Integer({ minimum: -255, maximum: 255 }),
      horizontal: Type.Boolean(),
    },
    object,
  ),
);
const empty = TypeCompiler.Compile(Type.Object({}, object));
const sync = TypeCompiler.Compile(
  Type.Object({ toggles: coordinate(7) }, object),
);
const text = TypeCompiler.Compile(
  Type.Object({ text: Type.String({ minLength: 1, maxLength: 256 }) }, object),
);

export function normalizeInput(
  type: string,
  data: unknown,
): InputEvent | undefined {
  if (type === 'input.text' && text.Check(data) && validInputText(data.text))
    return { type: 'text', text: data.text };
  if (type === 'input.key' && key.Check(data)) {
    const scancode = physicalScancode(data.code);
    if (scancode !== undefined && (data.down || !data.repeat))
      return { type: 'key', scancode, down: data.down, repeat: data.repeat };
  }
  if (type === 'input.pointer' && pointer.Check(data))
    return data.action === 'move'
      ? { type: 'move', x: data.x, y: data.y }
      : {
          type: 'button',
          x: data.x,
          y: data.y,
          button: data.button,
          down: data.down,
        };
  if (type === 'input.wheel' && wheel.Check(data) && data.delta !== 0)
    return { type: 'wheel', delta: data.delta, horizontal: data.horizontal };
  if (type === 'input.reset' && empty.Check(data)) return { type: 'reset' };
  if (type === 'input.sync' && sync.Check(data))
    return { type: 'sync', toggles: data.toggles };
  return undefined;
}
