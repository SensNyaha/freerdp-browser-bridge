import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SessionManager,
  SessionError,
} from '../../packages/node-bridge/dist/index.js';
import { validateDisplayState } from '../../packages/protocol/dist/index.js';
import { FakeSessionWorker, eventually } from '../fixtures/session-worker.mjs';
import { display } from '../fixtures/display.mjs';
import { readFile } from 'node:fs/promises';
const { displayState, displayInputReady, resizeResult } = await import(
  'data:text/javascript;base64,' +
    (await readFile('apps/reference-harness/display.js')).toString('base64')
);

const owner = { id: 'display-fixture' };
const request = { width: 1280, height: 720, deviceScale: 1 };
const code = (expected) => (error) => error.code === expected;
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
async function setup(run, dynamicResolution = true) {
  const worker = new FakeSessionWorker();
  const manager = new SessionManager({ workerFactory: () => worker });
  try {
    const created = manager.create(
      {
        target: { host: 'fixture.test' },
        auth: { username: 'fixture' },
        display: { dynamicResolution },
      },
      owner,
      '127.0.0.1',
    );
    await eventually(
      () => manager.get(created.sessionId, owner).state === 'connected',
    );
    const attach = (channel = 'control') =>
      manager.attach(
        created.sessionId,
        manager.mintToken(created.sessionId, owner, channel).token,
        channel,
      );
    const state = display({ dynamicResolution });
    worker.emit('display', state);
    await run({ worker, manager, attach, state, id: created.sessionId });
  } finally {
    await manager.shutdown();
  }
}
test('display metadata boundaries and browser input waits for the rendered epoch', () => {
  validateDisplayState(display());
  for (const patch of [
    { generation: 0n },
    { generation: 1 },
    { framebufferRevision: 1n << 64n },
    { width: 1.5 },
    { height: 4321 },
    { negotiated: false },
    { maxArea: 8294401 },
    { dynamicResolution: 1 },
  ])
    assert.throws(() => validateDisplayState(display(patch)));
  const metadata = {
    ...display(),
    generation: '1',
    framebufferRevision: '1',
    pixelFormat: 'BGRA8',
    desktopScale: 100,
    deviceScale: 100,
    orientation: 0,
    resizing: false,
  };
  assert.deepEqual(displayState(metadata), metadata);
  for (const patch of [
    { generation: '18446744073709551616' },
    { generation: '01' },
    { deviceScale: 125 },
    { resizing: undefined },
  ])
    assert.throws(() => displayState({ ...metadata, ...patch }));
  assert.throws(() => displayState({ ...metadata, width: 800 }, metadata));
  assert.throws(() => displayState({ ...metadata, generation: '2' }, metadata));
  const session = {
    display: metadata,
    renderedGeneration: '1',
    renderedWidth: 640,
    renderedHeight: 480,
  };
  assert.equal(displayInputReady(session), true);
  for (const patch of [
    { renderedGeneration: '0' },
    { resizeRequest: {} },
    { renderedWidth: 1280 },
    { display: { ...metadata, resizing: true } },
  ])
    assert.equal(displayInputReady({ ...session, ...patch }), false);
  assert.equal(resizeResult({ requestSeq: 7, status: 'timeout' }), 'timeout');
  assert.throws(() => resizeResult({ requestSeq: -1, status: 'applied' }));
});
test('fake display manager: resize drains earlier input, resets, pauses new input and stays single-flight', async () => {
  await setup(async ({ worker, attach, state }) => {
    const input = deferred(),
      result = deferred();
    const sent = [];
    worker.sendInput = async (event) => {
      sent.push(event.type);
      if (event.type === 'move') await input.promise;
    };
    worker.resizeDisplay = async () => {
      sent.push('layout');
      await result.promise;
      worker.emit(
        'display',
        display({ generation: 2n, framebufferRevision: 2n, ...request }),
      );
      return 'applied';
    };
    const lease = attach();
    assert.deepEqual(lease.display, state);
    lease.display.width = 200;
    assert.equal(lease.display.width, 640);
    const oldInput = lease.sendInput({ type: 'move', x: 10, y: 10 });
    await eventually(() => sent.length === 1);
    const resized = lease.resizeDisplay(request);
    assert.equal(lease.resizing, true);
    await assert.rejects(
      lease.sendInput({ type: 'move', x: 20, y: 20 }),
      code('INPUT_DISPLAY_TRANSITION'),
    );
    assert.equal(await lease.resizeDisplay(request), 'busy');
    assert.deepEqual(sent, ['move']);
    input.resolve();
    await oldInput;
    await eventually(() => sent.includes('layout'));
    await lease.sendInput({ type: 'reset' });
    assert.deepEqual(sent, ['move', 'reset', 'layout', 'reset']);
    result.resolve();
    assert.equal(await resized, 'applied');
    assert.equal(lease.resizing, false);
    assert.equal(lease.display.generation, 2n);
  });
});
test('fake display manager: detached queued resize loses authority before reset/layout dispatch', async () => {
  await setup(async ({ worker, attach }) => {
    const gate = deferred();
    let started = false,
      layouts = 0;
    worker.sendInput = async (event) => {
      if (event.type === 'move') {
        started = true;
        await gate.promise;
      }
    };
    worker.resizeDisplay = async () => {
      layouts++;
      return 'timeout';
    };
    const first = attach();
    const moved = first.sendInput({ type: 'move', x: 10, y: 10 });
    await eventually(() => started);
    const rejected = assert.rejects(
      first.resizeDisplay(request),
      code('ATTACH_INVALID'),
    );
    first.release();
    const next = attach();
    assert.equal(await next.resizeDisplay(request), 'busy');
    gate.resolve();
    await moved;
    await rejected;
    assert.equal(layouts, 0);
    assert.equal(next.resizing, false);
  });
});
test('fake display manager: detached in-flight resize publishes actual state to replacement but cannot reply as its controller', async () => {
  await setup(async ({ worker, attach }) => {
    const gate = deferred();
    let started = false;
    worker.resizeDisplay = async () => {
      started = true;
      await gate.promise;
      worker.emit(
        'display',
        display({ generation: 2n, framebufferRevision: 2n, ...request }),
      );
      return 'applied';
    };
    const first = attach();
    const rejected = assert.rejects(
      first.resizeDisplay(request),
      code('ATTACH_INVALID'),
    );
    await eventually(() => started);
    first.release();
    const next = attach();
    assert.equal(next.resizing, true);
    assert.equal(await next.resizeDisplay(request), 'busy');
    gate.resolve();
    await rejected;
    assert.equal(next.display.width, 1280);
    assert.equal(next.resizing, false);
  });
});
test('fake display manager: invalid layouts, media lease and absent opt-in never reach backend', async () => {
  await setup(async ({ worker, attach }) => {
    let layouts = 0;
    worker.resizeDisplay = async () => {
      layouts++;
      return 'timeout';
    };
    const lease = attach(),
      media = attach('media');
    await assert.rejects(media.resizeDisplay(request), code('ATTACH_INVALID'));
    for (const patch of [
      { width: 199 },
      { width: 1281 },
      { height: 2162 },
      { deviceScale: 1.25 },
      { orientation: 90 },
    ])
      await assert.rejects(
        lease.resizeDisplay({ ...request, ...patch }),
        code('DISPLAY_INVALID_REQUEST'),
      );
    assert.equal(layouts, 0);
  });
  await setup(async ({ worker, attach }) => {
    worker.resizeDisplay = async () => assert.fail('Not opted in');
    assert.equal(await attach().resizeDisplay(request), 'unavailable');
  }, false);
});
test('fake display manager: timeout retains geometry, late resize is authoritative and invalid success fails the backend', async () => {
  await setup(async ({ worker, attach, manager, id }) => {
    worker.resizeDisplay = async () => 'timeout';
    const lease = attach();
    assert.equal(await lease.resizeDisplay(request), 'timeout');
    assert.equal(lease.display.width, 640);
    worker.emit(
      'display',
      display({ generation: 2n, framebufferRevision: 2n, ...request }),
    );
    assert.equal(lease.display.width, 1280);
    worker.resizeDisplay = async () => 'applied';
    await assert.rejects(lease.resizeDisplay(request), code('DISPLAY_FAILED'));
    assert.equal(manager.get(id, owner).error.code, 'WORKER_INVALID_STATE');
  });
});
test('fake display manager: transition input rejection from native boundary is nonfatal', async () => {
  await setup(async ({ worker, attach, manager, id }) => {
    worker.sendInput = async () => {
      throw new SessionError('INPUT_DISPLAY_TRANSITION');
    };
    await assert.rejects(
      attach().sendInput({ type: 'move', x: 10, y: 10 }),
      code('INPUT_DISPLAY_TRANSITION'),
    );
    await Promise.resolve();
    assert.equal(manager.get(id, owner).state, 'connected');
  });
});
test('fake display manager: reused generations and invalid opt-in metadata fail before reaching clients', async () => {
  for (const patch of [
    { width: 800 },
    { generation: 2n },
    { dynamicResolution: false },
  ]) {
    await setup(async ({ worker, manager, id }) => {
      worker.emit('display', display(patch));
      assert.equal(manager.get(id, owner).error.code, 'WORKER_INVALID_STATE');
    });
  }
});
test(
  'fake display manager: hung backend resize has a bounded deadline and fails the worker before freeing reservation',
  { timeout: 12000 },
  async () => {
    await setup(async ({ worker, attach, manager, id }) => {
      worker.resizeDisplay = () => new Promise(() => {});
      const lease = attach();
      const started = performance.now();
      await assert.rejects(
        lease.resizeDisplay(request),
        code('DISPLAY_FAILED'),
      );
      assert.ok(performance.now() - started >= 6900);
      assert.equal(manager.get(id, owner).error.code, 'WORKER_FAILED');
      await assert.rejects(lease.resizeDisplay(request), (error) =>
        ['ATTACH_INVALID', 'DISPLAY_NOT_CONNECTED'].includes(error.code),
      );
    });
  },
);
