/** Focus-scoped input; only adjacent moves are coalesced, transitions keep their order. */
import { createModifierState, isModifierCode } from './modifiers.js';
export function installInput(
  canvas,
  send,
  connected,
  failed,
  resetConnected = connected,
) {
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
  const modifiers = createModifierState();
  const listeners = [];
  function on(target, name, handler, options) {
    target.addEventListener(name, handler, options);
    listeners.push(() => target.removeEventListener(name, handler, options));
  }
  function emit(type, data) {
    if (!(type === 'input.reset' ? resetConnected() : connected())) return;
    if (!send(type, data)) failed();
  }
  function flush() {
    if (animation !== undefined) win.cancelAnimationFrame(animation);
    animation = undefined;
    if (move) emit('input.pointer', { action: 'move', ...move });
    move = undefined;
  }
  function reset(event) {
    // Discard unsent motion on focus loss; queued key/button transitions are released server-side.
    move = undefined;
    if (animation !== undefined) win.cancelAnimationFrame(animation);
    animation = undefined;
    const release = active;
    active = false;
    modifiers.reset(
      (event?.type === 'blur' && event.currentTarget === win) ||
        (event?.type === 'visibilitychange' && doc.hidden),
    );
    if (release) emit('input.reset', {});
  }
  function reconcile(actions) {
    if (!actions.length) return;
    flush();
    for (const { type, data } of actions) {
      if (type === 'input.key') active = true;
      emit(type, data);
    }
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
  for (const [name, down] of [
    ['keydown', true],
    ['keyup', false],
  ])
    on(win, name, (event) => modifiers.observe(event, down), true);
  on(canvas, 'pointermove', (event) => {
    if (!connected() || event.pointerType !== 'mouse') return;
    if (doc.activeElement === canvas) reconcile(modifiers.snapshot(event));
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
      if (doc.activeElement === canvas) reconcile(modifiers.snapshot(event));
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
      if (!connected()) return;
      const forward =
        physicalCode(event.code) &&
        (!event.isComposing || isModifierCode(event.code));
      if (forward) event.preventDefault();
      reconcile(modifiers.keyboard(event, name === 'keydown', forward));
    });
  on(
    canvas,
    'wheel',
    (event) => {
      if (!connected() || doc.activeElement !== canvas) return;
      event.preventDefault();
      reconcile(modifiers.snapshot(event));
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
    if (doc.hidden) reset({ type: 'visibilitychange' });
  });
  const dispose = () => {
    reset();
    modifiers.reset();
    for (const remove of listeners) remove();
  };
  dispose.reset = reset;
  return dispose;
}
