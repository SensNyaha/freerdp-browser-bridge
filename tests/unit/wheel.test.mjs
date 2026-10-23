import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { createWheelState } = await import(
  'data:text/javascript;base64,' +
    (await readFile('apps/reference-harness/wheel.js')).toString('base64')
);
const geometry = { width: 960, height: 540, x: 100, y: 200 };
const event = (patch = {}) => ({
  deltaMode: 0,
  deltaX: 0,
  deltaY: 0,
  shiftKey: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  ...patch,
});
const wheel = (delta, horizontal = false) => ({
  type: 'input.wheel',
  data: { delta, horizontal },
});

test('wheel: fractional pixels accumulate independently and cancel reverse movement without overscrolling', () => {
  const state = createWheelState();
  assert.deepEqual(
    state.consume(event({ deltaX: 75, deltaY: 50 }), geometry),
    [],
  );
  assert.deepEqual(
    state.consume(event({ deltaX: -25, deltaY: 50 }), geometry),
    [wheel(-120)],
  );
  assert.deepEqual(
    state.consume(event({ deltaX: 50, deltaY: -100 }), geometry),
    [wheel(120), wheel(120, true)],
  );
  assert.deepEqual(state.consume(event({ deltaX: -100 }), geometry), [
    wheel(-120, true),
  ]);
});
test('wheel: tiny subpixel streams converge at one notch without floating-point drift', () => {
  const state = createWheelState();
  const sent = [];
  for (let i = 0; i < 1000; i++)
    sent.push(...state.consume(event({ deltaY: 0.1 }), geometry));
  assert.deepEqual(sent, [wheel(-120)]);
  assert.deepEqual(state.consume(event({ deltaY: 99.9 }), geometry), []);
  assert.deepEqual(state.consume(event({ deltaY: 0.1 }), geometry), [
    wheel(-120),
  ]);
});
test('wheel: pixel/line/page modes use the declared client policy and CSS page dimensions', () => {
  for (const [deltaMode, amount] of [
    [0, 100],
    [1, 3],
    [2, 1],
  ]) {
    const state = createWheelState();
    assert.deepEqual(
      state.consume(event({ deltaMode, deltaX: amount, deltaY: amount }), {
        ...geometry,
        width: 100,
        height: 100,
      }),
      [wheel(-120), wheel(120, true)],
    );
  }
  const state = createWheelState();
  const viewport = { ...geometry, width: 200, height: 50 };
  assert.deepEqual(
    state.consume(event({ deltaMode: 2, deltaX: 1, deltaY: 1 }), viewport),
    [wheel(120, true), wheel(120, true)],
  );
  assert.deepEqual(
    state.consume(event({ deltaMode: 2, deltaY: 1 }), viewport),
    [wheel(-120)],
  );
  const lines = createWheelState();
  const sent = [];
  for (let i = 0; i < 6; i++)
    sent.push(...lines.consume(event({ deltaMode: 1, deltaY: 0.5 }), geometry));
  assert.deepEqual(sent, [wheel(-120)]);
});
test('wheel: target, geometry, modifier and mode changes discard old fractional gestures', () => {
  for (const [ev, viewport] of [
    [event({ ctrlKey: true }), geometry],
    [event({ shiftKey: true }), geometry],
    [event({ altKey: true }), geometry],
    [event({ metaKey: true }), geometry],
    [event(), { ...geometry, x: 101 }],
    [event(), { ...geometry, y: 201 }],
    [event(), { ...geometry, width: 480 }],
    [event(), { ...geometry, height: 270 }],
    [event({ deltaMode: 1 }), geometry],
  ]) {
    const state = createWheelState();
    assert.deepEqual(state.consume(event({ deltaY: 75 }), geometry), []);
    assert.deepEqual(
      state.consume(
        { ...ev, deltaY: ev.deltaMode === 1 ? 0.75 : 25 },
        viewport,
      ),
      [],
    );
  }
});
test('wheel: reset clears fractional state; large spikes emit at most two notches per axis without a backlog', () => {
  const state = createWheelState();
  state.consume(event({ deltaY: 75 }), geometry);
  state.reset();
  assert.deepEqual(state.consume(event({ deltaY: 25 }), geometry), []);
  assert.deepEqual(
    state.consume(event({ deltaX: 1e300, deltaY: -1e300 }), geometry),
    [wheel(120), wheel(120), wheel(120, true), wheel(120, true)],
  );
  assert.deepEqual(state.consume(event(), geometry), []);
  assert.deepEqual(
    state.consume(event({ deltaX: 1, deltaY: 1 }), geometry),
    [],
  );
});
test('wheel: invalid deltas, modes and geometry emit nothing and clear stale residuals', () => {
  for (const [ev, viewport] of [
    [event({ deltaMode: 3 }), geometry],
    [event({ deltaMode: 0.5 }), geometry],
    [event({ deltaX: NaN }), geometry],
    [event({ deltaY: Infinity }), geometry],
    [event({ deltaY: '100' }), geometry],
    [event(), { ...geometry, width: 0 }],
    [event(), { ...geometry, height: Infinity }],
    [event(), { ...geometry, width: 32769 }],
    [event(), { ...geometry, x: 7680 }],
    [event(), { ...geometry, y: -1 }],
  ]) {
    const state = createWheelState();
    state.consume(event({ deltaY: 75 }), geometry);
    assert.deepEqual(state.consume(ev, viewport), []);
    assert.deepEqual(state.consume(event({ deltaY: 25 }), geometry), []);
  }
});
test('wheel: stale or backward gesture clocks clear residuals without scheduling timers', () => {
  let now = 0;
  const state = createWheelState(() => now);
  state.consume(event({ deltaY: 75 }), geometry);
  now = 500;
  assert.deepEqual(state.consume(event({ deltaY: 25 }), geometry), [
    wheel(-120),
  ]);
  state.consume(event({ deltaY: 75 }), geometry);
  now = 1001;
  assert.deepEqual(state.consume(event({ deltaY: 25 }), geometry), []);
  now = 999;
  assert.deepEqual(state.consume(event({ deltaY: 75 }), geometry), []);
  now = NaN;
  assert.deepEqual(state.consume(event({ deltaY: 100 }), geometry), []);
  now = 0;
  assert.deepEqual(state.consume(event({ deltaY: 25 }), geometry), []);
  state.reset();
  state.consume(event({ deltaY: 75 }), geometry);
  now = 400;
  assert.deepEqual(state.consume(event(), geometry), []);
  now = 600;
  assert.deepEqual(state.consume(event({ deltaY: 25 }), geometry), []);
});
test('wheel: repeated bounded inputs produce only integer native-safe nonzero notches with bounded action count', () => {
  const state = createWheelState();
  for (const deltaMode of [0, 1, 2])
    for (let i = -400; i <= 400; i++) {
      const actions = state.consume(
        event({ deltaMode, deltaX: i / 7, deltaY: -i / 11 }),
        geometry,
      );
      assert.ok(actions.length <= 4);
      assert.ok(
        actions.every(
          ({ type, data }) =>
            type === 'input.wheel' &&
            Math.abs(data.delta) === 120 &&
            typeof data.horizontal === 'boolean',
        ),
      );
      assert.deepEqual(state.consume(event({ deltaMode }), geometry), []);
    }
});
