/** Focus-scoped input; only adjacent moves are coalesced, transitions keep their order. */
export function installInput(canvas, send, connected, failed) {
  const namedKeys = new Set(
    'Escape Minus Equal Backspace Tab BracketLeft BracketRight Enter ControlLeft ControlRight Semicolon Quote Backquote ShiftLeft ShiftRight Backslash Comma Period Slash AltLeft AltRight Space CapsLock NumLock ScrollLock IntlBackslash PrintScreen Home ArrowUp PageUp ArrowLeft ArrowRight End ArrowDown PageDown Insert Delete MetaLeft MetaRight ContextMenu'.split(
      ' ',
    ),
  );
  const physicalCode = (code) =>
    namedKeys.has(code) ||
    /^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-2])|Numpad([0-9]|Add|Subtract|Multiply|Divide|Decimal|Enter))$/.test(
      code,
    );
  const doc = canvas.ownerDocument;
  const win = doc.defaultView;
  let move;
  let animation;
  let active = false;
  const listeners = [];
  function on(target, name, handler, options) {
    target.addEventListener(name, handler, options);
    listeners.push(() => target.removeEventListener(name, handler, options));
  }
  function emit(type, data) {
    if (!connected()) return;
    if (!send(type, data)) failed();
  }
  function flush() {
    if (animation !== undefined) win.cancelAnimationFrame(animation);
    animation = undefined;
    if (move) emit('input.pointer', { action: 'move', ...move });
    move = undefined;
  }
  function reset() {
    // Discard unsent motion on focus loss; queued key/button transitions are released server-side.
    move = undefined;
    if (animation !== undefined) win.cancelAnimationFrame(animation);
    animation = undefined;
    const release = active;
    active = false;
    if (release) emit('input.reset', {});
  }
  function position(event) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height || !canvas.width || !canvas.height) return;
    return {
      x: Math.max(
        0,
        Math.min(
          canvas.width - 1,
          Math.floor(((event.clientX - rect.left) * canvas.width) / rect.width),
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          canvas.height - 1,
          Math.floor(
            ((event.clientY - rect.top) * canvas.height) / rect.height,
          ),
        ),
      ),
    };
  }
  on(canvas, 'pointermove', (event) => {
    if (!connected() || event.pointerType !== 'mouse') return;
    move = position(event);
    if (!move || animation !== undefined) return;
    animation = win.requestAnimationFrame(() => {
      animation = undefined;
      flush();
    });
  });
  for (const name of ['pointerdown', 'pointerup'])
    on(canvas, name, (event) => {
      if (
        !connected() ||
        event.pointerType !== 'mouse' ||
        event.button < 0 ||
        event.button > 4
      )
        return;
      const p = position(event);
      if (!p) return;
      event.preventDefault();
      if (name === 'pointerdown') {
        canvas.focus({ preventScroll: true });
        canvas.setPointerCapture(event.pointerId);
        active = true;
      }
      flush();
      emit('input.pointer', {
        action: 'button',
        ...p,
        button: event.button,
        down: name === 'pointerdown',
      });
    });
  for (const name of ['keydown', 'keyup'])
    on(canvas, name, (event) => {
      if (!connected() || event.isComposing || !physicalCode(event.code))
        return;
      event.preventDefault();
      active = true;
      flush();
      emit('input.key', {
        code: event.code,
        down: name === 'keydown',
        repeat: name === 'keydown' && event.repeat,
      });
    });
  on(
    canvas,
    'wheel',
    (event) => {
      if (!connected() || doc.activeElement !== canvas) return;
      event.preventDefault();
      flush();
      // One bounded RDP wheel step per browser event; vertical DOM direction is inverted.
      for (const [value, horizontal] of [
        [event.deltaY, false],
        [event.deltaX, true],
      ])
        if (value)
          emit('input.wheel', {
            delta: Math.sign(value) * (horizontal ? 120 : -120),
            horizontal,
          });
    },
    { passive: false },
  );
  on(canvas, 'contextmenu', (event) => event.preventDefault());
  for (const name of ['blur', 'pointercancel', 'lostpointercapture'])
    on(canvas, name, reset);
  on(win, 'blur', reset);
  on(doc, 'visibilitychange', () => {
    if (doc.hidden) reset();
  });
  return () => {
    reset();
    for (const remove of listeners) remove();
  };
}
