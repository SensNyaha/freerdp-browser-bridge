import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  SessionManager,
  SessionError,
} from '../../packages/node-bridge/dist/index.js';
import { normalizeInput } from '../../apps/bridge-api/dist/input.js';
import { validateTouchState } from '../../packages/protocol/dist/index.js';
import { fakeFactory, eventually } from '../fixtures/session-worker.mjs';
const { touchState, touchInputReady } = await import(
  'data:text/javascript;base64,' +
    (await readFile('apps/reference-harness/touch.js')).toString('base64')
);
const state = {
  revision: 1n,
  generation: 1n,
  width: 1920,
  height: 1080,
  maxContacts: 10,
  enabled: true,
  availability: 'ready',
};
const event = {
  type: 'touch',
  action: 'begin',
  contactId: 7,
  x: 100,
  y: 200,
  generation: 1n,
};
const wire = (value) => ({
  ...value,
  revision: value.revision.toString(),
  generation: value.generation.toString(),
});
const code = (value) => (error) =>
  error instanceof SessionError && error.code === value;

test('touch control: exact shape and decimal generation are bounded before normalization', () => {
  const { type, ...data } = { ...event, generation: '1' };
  assert.equal(type, 'touch');
  assert.deepEqual(normalizeInput('input.touch', data), event);
  for (const changed of [
    { generation: '0' },
    { generation: '01' },
    { generation: '18446744073709551616' },
    { generation: 1 },
    { generation: '1'.repeat(4096) },
    { contactId: -1 },
    { contactId: 2 ** 31 },
    { x: 7680 },
    { y: 4320 },
    { x: 0.5 },
    { action: 'pen' },
    { pressure: 1 },
  ])
    assert.equal(
      normalizeInput('input.touch', { ...data, ...changed }),
      undefined,
    );
});

test('touch readiness: Node and browser reject bounds/regression; readiness requires rendered display generation', () => {
  validateTouchState(state);
  const parsed = touchState(wire(state));
  for (const changed of [
    { revision: 0n },
    { generation: 0n },
    { width: 0 },
    { height: 4321 },
    { enabled: false },
    { maxContacts: 11 },
    { availability: 'suspended', maxContacts: 1 },
    { availability: 'unknown' },
  ]) {
    assert.throws(() => validateTouchState({ ...state, ...changed }));
    assert.throws(() => touchState(wire({ ...state, ...changed })));
  }
  assert.throws(() => touchState(wire(state), parsed));
  assert.throws(() =>
    touchState(wire({ ...state, revision: 2n, width: 1000 }), parsed),
  );
  const session = {
    touch: parsed,
    display: { generation: '1', width: 1920, height: 1080 },
    renderedGeneration: '1',
    renderedWidth: 1920,
    renderedHeight: 1080,
  };
  assert.deepEqual(touchInputReady(session), {
    generation: '1',
    maxContacts: 10,
  });
  for (const changed of [
    { renderedGeneration: '2' },
    { renderedWidth: 1000 },
    { resizeRequest: {} },
    { touch: { ...parsed, availability: 'suspended' } },
    { display: { ...session.display, resizing: true } },
    { display: undefined },
  ])
    assert.equal(touchInputReady({ ...session, ...changed }), undefined);
});

test('touch lease: queued readiness/generation and controller authority are rechecked; release reset precedes next controller', async () => {
  const factory = fakeFactory();
  const manager = new SessionManager(factory);
  const principal = { id: 'touch-fixture' };
  try {
    const created = manager.create(
      {
        target: { host: 'fake' },
        auth: { username: 'fixture' },
        input: { touch: true },
      },
      principal,
      'local',
    );
    await eventually(
      () => manager.get(created.sessionId, principal).state === 'connected',
    );
    const worker = factory.workers[0];
    worker.sendInput = async () => {};
    worker.emit('touch', state);
    const attach = (channel) =>
      manager.attach(
        created.sessionId,
        manager.mintToken(created.sessionId, principal, channel).token,
        channel,
      );
    const media = attach('media');
    await assert.rejects(media.sendInput(event), code('ATTACH_INVALID'));
    media.release();
    const first = attach('control');
    assert.deepEqual(first.touch, state);
    first.touch.width = 10;
    assert.equal(first.touch.width, 1920);
    await assert.rejects(
      first.sendInput({ ...event, generation: 2n }),
      code('INPUT_DISPLAY_TRANSITION'),
    );
    await assert.rejects(
      first.sendInput({ ...event, pressure: 1 }),
      code('INPUT_INVALID'),
    );
    const sent = [];
    let unblock;
    worker.sendInput = async (e) => {
      sent.push(e);
      if (sent.length === 1)
        await new Promise((done) => {
          unblock = done;
        });
    };
    const inFlight = first.sendInput(event);
    await eventually(() => Boolean(unblock));
    const queued = first.sendInput({ ...event, action: 'update' });
    const stale = assert.rejects(queued, code('INPUT_TOUCH_UNAVAILABLE'));
    worker.emit('touch', {
      ...state,
      revision: 2n,
      availability: 'suspended',
      maxContacts: 0,
    });
    unblock();
    await Promise.all([inFlight, stale]);
    assert.equal(sent.length, 1);
    worker.emit('touch', { ...state, revision: 3n, generation: 2n });
    let blockNext = true;
    worker.sendInput = async (e) => {
      sent.push(e);
      if (blockNext) {
        blockNext = false;
        await new Promise((done) => {
          unblock = done;
        });
      }
    };
    const inFlight2 = first.sendInput({ ...event, generation: 2n });
    await eventually(() => sent.length === 2);
    const oldGeneration = first.sendInput({
      ...event,
      generation: 2n,
      action: 'update',
    });
    const expired = assert.rejects(
      oldGeneration,
      code('INPUT_DISPLAY_TRANSITION'),
    );
    worker.emit('touch', { ...state, revision: 4n, generation: 3n });
    unblock();
    await Promise.all([inFlight2, expired]);
    blockNext = true;
    const inFlight3 = first.sendInput({ ...event, generation: 3n });
    await eventually(() => sent.length === 3);
    const oldLease = assert.rejects(
      first.sendInput({ ...event, generation: 3n, action: 'update' }),
      code('ATTACH_INVALID'),
    );
    first.release();
    const next = attach('control');
    await assert.rejects(first.sendInput(event), code('ATTACH_INVALID'));
    const newInput = next.sendInput({ ...event, generation: 3n });
    unblock();
    await Promise.all([inFlight3, oldLease, newInput]);
    assert.deepEqual(
      sent.map((e) => e.type),
      ['touch', 'touch', 'touch', 'reset', 'touch'],
    );
    assert.equal(manager.get(created.sessionId, principal).state, 'connected');
    next.release();
  } finally {
    await manager.shutdown();
  }
});
