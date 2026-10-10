import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { WorkerProcess } from '../../packages/node-bridge/dist/index.js';
import { eventually } from '../fixtures/session-worker.mjs';
const suffix = process.platform === 'win32' ? '.exe' : '';
const directory = process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation';
async function run(host, body, path = 'fixture-touch') {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'bridge-touch-'));
  const worker = new WorkerProcess({
    workerPath: resolve(directory, path + suffix),
    runtimeRoot,
  });
  try {
    await worker.start();
    await body(worker, {
      target: { host },
      auth: {},
      input: { touch: true },
      display: { width: 1920, height: 1080 },
    });
  } finally {
    await worker.close();
    await rm(runtimeRoot, { recursive: true, force: true });
  }
}
const contact = (action, id = 1) => ({ action, contactId: id, x: 100, y: 110 });
test('fake touch IPC: opt-in, generation, ten-contact ownership, reset and typed rejection preserve worker health', async () => {
  await run('ready', async (worker, config) => {
    assert.equal(worker.build.capabilities.touchInput, true);
    const ready = once(worker, 'touch');
    await worker.connect(config);
    await ready;
    assert.equal(worker.touch.availability, 'ready');
    assert.equal(worker.touch.maxContacts, 10);
    await assert.rejects(worker.sendTouch(contact('begin'), 2n), {
      code: 'INPUT_DISPLAY_TRANSITION',
    });
    for (let id = 0; id < 10; id++)
      await worker.sendTouch(contact('begin', id), 1n);
    await assert.rejects(worker.sendTouch(contact('begin', 10), 1n), {
      code: 'INPUT_QUEUE_FULL',
    });
    await assert.rejects(worker.sendTouch(contact('begin', 1), 1n), {
      code: 'TOUCH_INVALID_TRANSITION',
    });
    await worker.sendInput({ type: 'reset' });
    await worker.sendTouch(contact('begin'), 1n);
    await worker.sendTouch(contact('update'), 1n);
    await worker.sendTouch(contact('end'), 1n);
    await worker.ping();
    assert.equal(worker.state, 'ready');
  });
});
test('fake touch IPC: unavailable and suspended status prevents dispatch without terminating the worker', async () => {
  for (const host of ['unavailable', 'suspend'])
    await run(host, async (worker, config) => {
      const ready = once(worker, 'touch');
      await worker.connect(config);
      await ready;
      if (host === 'suspend') {
        await worker.sendTouch(contact('begin'), 1n);
        await eventually(() => worker.touch.availability === 'suspended');
      }
      await assert.rejects(worker.sendTouch(contact('begin', 2), 1n), {
        code: 'TOUCH_UNAVAILABLE',
      });
      await worker.sendInput({ type: 'reset' });
      await worker.ping();
      assert.equal(worker.state, 'ready');
    });
});
test('fake legacy IPC: touch opt-in is rejected before configure/secret/connect', async () => {
  await run(
    'ready',
    async (worker, config) => {
      assert.equal(worker.build.capabilities.touchInput, false);
      await assert.rejects(worker.connect(config), {
        code: 'RDP_SETTING_NOT_IMPLEMENTED',
      });
      await worker.ping();
      assert.equal(worker.state, 'ready');
    },
    'fixture-display-1',
  );
});
