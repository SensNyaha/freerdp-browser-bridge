const families = [
  { flag: 'shiftKey', keys: ['ShiftLeft', 'ShiftRight'] },
  { flag: 'ctrlKey', keys: ['ControlLeft', 'ControlRight'] },
  { flag: 'altKey', keys: ['AltLeft', 'AltRight'] },
  { flag: 'metaKey', keys: ['MetaLeft', 'MetaRight'] },
];
const modifierCodes = new Set(families.flatMap((family) => family.keys));
const locks = new Set(['CapsLock', 'NumLock', 'ScrollLock']);
export const isModifierCode = (code) => modifierCodes.has(code);

/** Eight observed/remote modifier slots each and one toggle snapshot. */
export function createModifierState() {
  const held = new Map();
  const observed = new Set();
  let toggles;
  const key = (code, down, repeat = false) => ({
    type: 'input.key',
    data: { code, down, repeat },
  });
  function reconcile(event, actions, except, released) {
    const altGraph =
      typeof event.getModifierState === 'function' &&
      event.getModifierState('AltGraph');
    for (const family of families) {
      if (family === except || typeof event[family.flag] !== 'boolean')
        continue;
      const pressed =
        event[family.flag] || (family.flag === 'altKey' && altGraph);
      if (!pressed) {
        for (const code of family.keys) observed.delete(code);
        for (const code of family.keys)
          if (held.delete(code)) actions.push(key(code, false));
      } else if (family.keys.some((code) => observed.has(code))) {
        for (const code of family.keys) {
          if (held.get(code) === 'inferred' && !observed.has(code)) {
            held.delete(code);
            actions.push(key(code, false));
          }
          if (observed.has(code) && !held.has(code)) {
            held.set(code, 'physical');
            actions.push(key(code, true));
          }
        }
      } else if (!family.keys.some((code) => held.has(code))) {
        const code =
          family.keys.find(
            (code) =>
              code !== released &&
              (family.flag !== 'altKey' || !altGraph || code === 'AltRight'),
          ) ?? family.keys.find((code) => code !== released);
        held.set(code, 'inferred');
        actions.push(key(code, true));
      }
    }
  }
  function synchronize(event, actions, force = false) {
    if (typeof event.getModifierState !== 'function') return;
    const value =
      (event.getModifierState('ScrollLock') ? 1 : 0) |
      (event.getModifierState('NumLock') ? 2 : 0) |
      (event.getModifierState('CapsLock') ? 4 : 0);
    if (force || toggles !== value)
      actions.push({ type: 'input.sync', data: { toggles: value } });
    toggles = value;
  }
  return {
    observe(event, down) {
      if (!modifierCodes.has(event.code)) return;
      if (down) observed.add(event.code);
      else observed.delete(event.code);
    },
    snapshot(event) {
      const actions = [];
      reconcile(event, actions);
      return actions;
    },
    keyboard(event, down, forward = true) {
      const actions = [];
      const family = forward
        ? families.find((family) => family.keys.includes(event.code))
        : undefined;
      reconcile(event, actions, family);
      if (!forward || !locks.has(event.code)) synchronize(event, actions);
      if (forward) {
        if (family) {
          if (down) {
            for (const code of family.keys)
              if (code !== event.code && held.get(code) === 'inferred') {
                held.delete(code);
                actions.push(key(code, false));
              }
            held.set(event.code, 'physical');
          } else held.delete(event.code);
        }
        actions.push(key(event.code, down, down && event.repeat === true));
        if (family && !down) reconcile(event, actions, undefined, event.code);
        if (locks.has(event.code)) synchronize(event, actions, true);
      }
      return actions;
    },
    reset(clearObserved = true) {
      held.clear();
      toggles = undefined;
      if (clearObserved) observed.clear();
    },
  };
}
