/** Client policy: 100 CSS pixels / three lines per RDP wheel notch. */
export function createWheelState(clock = () => performance.now()) {
  let vertical = 0,
    horizontal = 0,
    context,
    lastAt;
  const epsilon = 1e-9;
  function reset() {
    vertical = horizontal = 0;
    context = undefined;
    lastAt = undefined;
  }
  function axis(value, scale, remainder, horizontal) {
    // At most two whole notches per axis/event; excess is discarded, never queued.
    const total = Math.max(-2, Math.min(2, value * scale + remainder));
    const count = Math.trunc(total + Math.sign(total) * epsilon);
    const fraction = total - count;
    const actions = [];
    for (let i = 0; i < Math.abs(count); i++)
      actions.push({
        type: 'input.wheel',
        data: {
          delta: Math.sign(count) * (horizontal ? 120 : -120),
          horizontal,
        },
      });
    return { actions, remainder: Math.abs(fraction) < epsilon ? 0 : fraction };
  }
  return {
    reset,
    consume(event, geometry) {
      const { width, height, x, y } = geometry;
      const now = clock();
      if (
        !Number.isFinite(now) ||
        now < 0 ||
        ![0, 1, 2].includes(event.deltaMode) ||
        !Number.isFinite(event.deltaX) ||
        !Number.isFinite(event.deltaY) ||
        !Number.isFinite(width) ||
        width <= 0 ||
        width > 32768 ||
        !Number.isFinite(height) ||
        height <= 0 ||
        height > 32768 ||
        !Number.isInteger(x) ||
        x < 0 ||
        x > 7679 ||
        !Number.isInteger(y) ||
        y < 0 ||
        y > 4319
      ) {
        reset();
        return [];
      }
      const next = [
        event.deltaMode,
        width,
        height,
        x,
        y,
        Boolean(event.shiftKey),
        Boolean(event.ctrlKey),
        Boolean(event.altKey),
        Boolean(event.metaKey),
      ];
      if (
        !context ||
        next.some((value, i) => value !== context[i]) ||
        now < lastAt ||
        now - lastAt > 500
      )
        reset();
      if (event.deltaX === 0 && event.deltaY === 0) return [];
      context = next;
      lastAt = now;
      const scale = (page) =>
        event.deltaMode === 0
          ? 1 / 100
          : event.deltaMode === 1
            ? 1 / 3
            : page / 100;
      const v = axis(event.deltaY, scale(height), vertical, false);
      const h = axis(event.deltaX, scale(width), horizontal, true);
      vertical = v.remainder;
      horizontal = h.remainder;
      return [...v.actions, ...h.actions];
    },
  };
}
