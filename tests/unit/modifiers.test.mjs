import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { createModifierState } = await import(
  'data:text/javascript;base64,' +
    (await readFile('apps/reference-harness/modifiers.js')).toString('base64')
);
const event = (patch = {}) => ({
  shiftKey: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  repeat: false,
  getModifierState: () => false,
  ...patch,
});
const key = (code, down, repeat = false) => ({
  type: 'input.key',
  data: { code, down, repeat },
});
const sync = (toggles) => ({ type: 'input.sync', data: { toggles } });

test('modifier state: entry snapshot precedes input, inferred side migrates to the observed physical side', () => {
  const state = createModifierState();
  assert.deepEqual(state.snapshot(event({ ctrlKey: true })), [
    key('ControlLeft', true),
  ]);
  assert.deepEqual(
    state.keyboard(event({ code: 'ControlRight', ctrlKey: true }), true),
    [sync(0), key('ControlLeft', false), key('ControlRight', true)],
  );
  assert.deepEqual(
    state.keyboard(event({ code: 'KeyQ', ctrlKey: true }), true),
    [key('KeyQ', true)],
  );
  assert.deepEqual(state.keyboard(event({ code: 'ControlRight' }), false), [
    key('ControlRight', false),
  ]);
});
test('modifier state: both physical sides survive, a missed release is repaired before the next non-US physical key', () => {
  const state = createModifierState();
  state.keyboard(event({ code: 'ShiftLeft', shiftKey: true }), true);
  assert.deepEqual(
    state.keyboard(event({ code: 'ShiftRight', shiftKey: true }), true),
    [key('ShiftRight', true)],
  );
  assert.deepEqual(
    state.keyboard(event({ code: 'ShiftRight', shiftKey: true }), false),
    [key('ShiftRight', false)],
  );
  assert.deepEqual(state.keyboard(event({ code: 'IntlBackslash' }), true), [
    key('ShiftLeft', false),
    key('IntlBackslash', true),
  ]);
  assert.deepEqual(state.snapshot(event()), []);
});
test('modifier state: observed sides survive canvas focus/resize reset, while window focus loss discards stale observations', () => {
  const state = createModifierState();
  state.observe(event({ code: 'ControlRight' }), true);
  assert.deepEqual(state.snapshot(event({ ctrlKey: true })), [
    key('ControlRight', true),
  ]);
  state.reset(false);
  assert.deepEqual(state.snapshot(event({ ctrlKey: true })), [
    key('ControlRight', true),
  ]);
  state.observe(event({ code: 'ControlRight' }), false);
  assert.deepEqual(state.snapshot(event()), [key('ControlRight', false)]);
  state.observe(event({ code: 'ShiftRight' }), true);
  state.reset();
  assert.deepEqual(state.snapshot(event({ shiftKey: true })), [
    key('ShiftLeft', true),
  ]);
});
test('modifier state: repeats and composition/unsupported text keep modifier reconciliation independent of characters', () => {
  const state = createModifierState();
  state.keyboard(event({ code: 'ControlRight', ctrlKey: true }), true);
  assert.deepEqual(
    state.keyboard(
      event({ code: 'ControlRight', ctrlKey: true, repeat: true }),
      true,
    ),
    [key('ControlRight', true, true)],
  );
  assert.deepEqual(
    state.keyboard(
      event({ code: 'Unidentified', isComposing: true }),
      true,
      false,
    ),
    [key('ControlRight', false)],
  );
});
test('modifier state: AltGraph snapshot uses right Alt without inventing Control and preserves actual composite Control events', () => {
  const state = createModifierState();
  const altGraph = event({ getModifierState: (name) => name === 'AltGraph' });
  assert.deepEqual(state.snapshot(altGraph), [key('AltRight', true)]);
  assert.deepEqual(state.snapshot({ ...altGraph, ctrlKey: true }), [
    key('ControlLeft', true),
  ]);
  assert.deepEqual(state.keyboard(event({ code: 'AltRight' }), false), [
    key('ControlLeft', false),
    sync(0),
    key('AltRight', false),
  ]);
});
test('modifier state: all toggle masks synchronize once, lock key edges force synchronization afterwards and reset invalidates the snapshot', () => {
  const state = createModifierState();
  for (let mask = 0; mask < 8; mask++) {
    const value = event({
      code: 'KeyA',
      getModifierState: (name) =>
        Boolean(mask & ({ ScrollLock: 1, NumLock: 2, CapsLock: 4 }[name] ?? 0)),
    });
    assert.deepEqual(state.keyboard(value, true), [
      sync(mask),
      key('KeyA', true),
    ]);
    assert.deepEqual(state.keyboard(value, false), [key('KeyA', false)]);
    assert.deepEqual(state.keyboard({ ...value, code: 'CapsLock' }, true), [
      key('CapsLock', true),
      sync(mask),
    ]);
    assert.deepEqual(state.keyboard({ ...value, code: 'CapsLock' }, false), [
      key('CapsLock', false),
      sync(mask),
    ]);
  }
  state.reset();
  assert.deepEqual(state.keyboard(event({ code: 'KeyA' }), true), [
    sync(0),
    key('KeyA', true),
  ]);
});
test('modifier state: every physical modifier set and aggregate snapshot stays bounded, converges and contains only the eight known modifiers', () => {
  const codes = [
    'ShiftLeft',
    'ShiftRight',
    'ControlLeft',
    'ControlRight',
    'AltLeft',
    'AltRight',
    'MetaLeft',
    'MetaRight',
  ];
  const snapshot = (mask) =>
    event({
      shiftKey: Boolean(mask & 3),
      ctrlKey: Boolean(mask & 12),
      altKey: Boolean(mask & 48),
      metaKey: Boolean(mask & 192),
    });
  for (let held = 0; held < 256; held++)
    for (let mask = 0; mask < 16; mask++) {
      const state = createModifierState();
      let current = 0;
      for (let i = 0; i < codes.length; i++)
        if (held & (1 << i)) {
          current |= 1 << i;
          state.keyboard({ ...snapshot(current), code: codes[i] }, true);
        }
      const flags = event({
        shiftKey: Boolean(mask & 1),
        ctrlKey: Boolean(mask & 2),
        altKey: Boolean(mask & 4),
        metaKey: Boolean(mask & 8),
      });
      const actions = state.snapshot(flags);
      assert.ok(actions.length <= 8);
      assert.ok(
        actions.every(
          (action) =>
            codes.includes(action.data.code) && action.data.repeat === false,
        ),
      );
      assert.deepEqual(state.snapshot(flags), []);
      state.reset();
      assert.deepEqual(state.snapshot(event()), []);
    }
});
