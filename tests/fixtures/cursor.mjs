export function cursorState(overrides = {}) {
  return {
    revision: 1n,
    shapeId: 7n,
    timestampUs: 123n,
    visible: true,
    default: false,
    positioned: true,
    x: 100,
    y: 200,
    width: 2,
    height: 2,
    hotX: 1,
    hotY: 1,
    rgba: Buffer.from([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 0,
    ]),
    ...overrides,
  };
}
export function cursorPayload(state = cursorState(), includeShape = true) {
  const rgba = includeShape && state.rgba ? state.rgba : Buffer.alloc(0);
  const p = Buffer.alloc(40 + rgba.length);
  p.writeUInt16BE(1);
  p.writeUInt16BE(
    (state.visible ? 1 : 0) |
      (state.default ? 2 : 0) |
      (state.positioned ? 4 : 0) |
      (rgba.length ? 8 : 0),
    2,
  );
  p.writeBigUInt64BE(state.revision, 4);
  p.writeBigUInt64BE(state.shapeId, 12);
  p.writeBigUInt64BE(state.timestampUs, 20);
  for (const [i, value] of [
    state.x,
    state.y,
    state.width,
    state.height,
    state.hotX,
    state.hotY,
  ].entries())
    p.writeUInt16BE(value, 28 + i * 2);
  rgba.copy(p, 40);
  return p;
}
