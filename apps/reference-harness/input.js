/** Focus-scoped input; only adjacent moves are coalesced, transitions keep their order. */
import { createModifierState, isModifierCode } from './modifiers.js';
import { createWheelState } from './wheel.js';
export function installInput(
  canvas,
  send,
  connected,
  failed,
  resetConnected = connected,
  touchReady = () => undefined,
) {
  const namedKeys = new Set(
    'Escape Minus Equal Backspace Tab BracketLeft BracketRight Enter ControlLeft ControlRight Semicolon Quote Backquote ShiftLeft ShiftRight Backslash Comma Period Slash AltLeft AltRight Space CapsLock NumLock ScrollLock IntlBackslash IntlRo IntlYen KanaMode Convert NonConvert Lang1 Lang2 NumpadComma PrintScreen Home ArrowUp PageUp ArrowLeft ArrowRight End ArrowDown PageDown Insert Delete MetaLeft MetaRight ContextMenu'.split(
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
  const wheel = createWheelState();
  const listeners = [];
  const contacts = new Map();
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
    const captured = [...contacts.keys()];
    contacts.clear();
    for (const id of captured) {
      try {
        if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      } catch {
        /* Capture may already have been released by the browser. */
      }
    }
    wheel.reset();
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
  function position(event, rect = canvas.getBoundingClientRect()) {
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
  for (const [name, action] of [
    ['pointerdown', 'begin'],
    ['pointermove', 'update'],
    ['pointerup', 'end'],
    ['pointercancel', 'cancel'],
    ['lostpointercapture', 'cancel'],
  ])
    on(canvas, name, (event) => {
      if (event.pointerType !== 'touch') return;
      const previous = contacts.get(event.pointerId);
      if (action !== 'begin' && !previous) return;
      const state = connected() && touchReady();
      if (!state || (previous && previous.generation !== state.generation)) {
        reset();
        return;
      }
      if (
        !Number.isInteger(event.pointerId) ||
        event.pointerId < 0 ||
        event.pointerId > 0x7fffffff
      )
        return;
      if (
        action === 'begin' &&
        (previous || contacts.size >= Math.min(10, state.maxContacts))
      )
        return;
      const p = action === 'cancel' ? previous : position(event);
      if (!p) return;
      event.preventDefault();
      wheel.reset();
      if (action === 'begin') {
        canvas.focus({ preventScroll: true });
        try {
          canvas.setPointerCapture(event.pointerId);
        } catch {
          return;
        }
      }
      if (action === 'end' || action === 'cancel')
        contacts.delete(event.pointerId);
      else
        contacts.set(event.pointerId, { ...p, generation: state.generation });
      active = true;
      flush();
      emit('input.touch', {
        action,
        contactId: event.pointerId,
        x: p.x,
        y: p.y,
        generation: state.generation,
      });
      if (action === 'end' || action === 'cancel') {
        try {
          if (canvas.hasPointerCapture(event.pointerId))
            canvas.releasePointerCapture(event.pointerId);
        } catch {
          /* Terminal ownership is already removed before capture callbacks. */
        }
      }
    });
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
      wheel.reset();
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
      wheel.reset();
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
      if (!connected() || doc.activeElement !== canvas) {
        wheel.reset();
        return;
      }
      event.preventDefault();
      reconcile(modifiers.snapshot(event));
      flush();
      const rect = canvas.getBoundingClientRect();
      const p = position(event, rect);
      if (!p) {
        wheel.reset();
        return;
      }
      for (const { type, data } of wheel.consume(event, {
        width: rect.width,
        height: rect.height,
        ...p,
      }))
        emit(type, data);
    },
    { passive: false },
  );
  on(canvas, 'contextmenu', (event) => event.preventDefault());
  on(canvas, 'blur', reset);
  for (const name of ['pointercancel', 'lostpointercapture'])
    on(canvas, name, (event) => {
      if (event.pointerType !== 'touch') reset(event);
    });
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
