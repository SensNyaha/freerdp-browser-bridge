import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkerProcess } from '../../packages/node-bridge/dist/index.js';
import { eventually } from '../fixtures/session-worker.mjs';

const directory = resolve(
  process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
);
const suffix = process.platform === 'win32' ? '.exe' : '';
async function fixture(run, legacy = false) {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'bridge-display-fixture-'));
  const worker = new WorkerProcess({
    workerPath: join(directory, `fixture-display-${legacy ? 1 : 0}${suffix}`),
    runtimeRoot,
    requestTimeoutMs: 300,
    heartbeatIntervalMs: 10000,
  });
  try {
    await worker.start();
    await run(worker);
  } finally {
    await worker.close();
    assert.deepEqual(await readdir(runtimeRoot), []);
    await rm(runtimeRoot, { recursive: true, force: true, maxRetries: 3 });
  }
}
const config = (host = 'applied', dynamicResolution = true) => ({
  target: { host },
  auth: { username: 'synthetic', password: 'synthetic-private-ipc' },
  display: { width: 1024, height: 768, dynamicResolution },
});
async function connect(worker, configuration) {
  const connected = once(worker, 'rdp-state');
  await worker.connect(configuration);
  assert.equal((await connected)[0].state, 'connected');
  if (worker.build.capabilities.displayControl)
    await eventually(() => Boolean(worker.display));
}

test('fake Unicode IPC: bounded UTF16BE text, remote rejection and old-peer capability gating', async () => {
  await fixture(async (worker) => {
    await connect(worker, config('unicode-vector'));
    assert.equal(worker.build.capabilities.unicodeInput, true);
    await worker.sendInput({ type: 'text', text: 'Ж中😀' });
    await worker.ping();
    const resize = worker.resizeDisplay(1280, 720);
    await assert.rejects(worker.sendInput({ type: 'text', text: 'Ж中😀' }), {
      code: 'INPUT_DISPLAY_TRANSITION',
    });
    await worker.sendInput({ type: 'reset' });
    assert.equal(await resize, 'applied');
  });
  await fixture(async (worker) => {
    await connect(worker, config('unicode-unavailable'));
    await assert.rejects(worker.sendInput({ type: 'text', text: 'Ж' }), {
      code: 'INPUT_NOT_IMPLEMENTED',
    });
    await worker.sendInput({ type: 'move', x: 1, y: 2 });
    await worker.ping();
  });
  await fixture(async (worker) => {
    await connect(worker, config('applied', false));
    assert.equal(worker.build.capabilities.unicodeInput, false);
    await assert.rejects(worker.sendInput({ type: 'text', text: 'Ж' }), {
      code: 'INPUT_NOT_IMPLEMENTED',
    });
    await worker.sendInput({ type: 'move', x: 1, y: 2 });
  }, true);
});

test(
  'fake display IPC: observation precedes applied; one pending request, heartbeat and immutable replay',
  { timeout: 12000 },
  async () => {
    await fixture(async (worker) => {
      const events = [];
      worker.on('display', (state) => events.push(state));
      await connect(worker, config());
      const initial = worker.display;
      initial.width = 1;
      assert.equal(worker.display.width, 1024);
      assert.equal(await worker.resizeDisplay(1024, 768), 'unchanged');
      for (const [width, height] of [
        [199, 720],
        [1281, 720],
        [3842, 720],
        [1280, 2162],
      ])
        assert.equal(await worker.resizeDisplay(width, height), 'invalid');
      let resolved = false;
      const resize = worker.resizeDisplay(1280, 720).then((result) => {
        resolved = true;
        assert.equal(events.at(-1).width, 1280);
        return result;
      });
      assert.equal(await worker.resizeDisplay(1920, 1080), 'busy');
      await worker.ping();
      assert.equal(resolved, false);
      await assert.rejects(worker.sendInput({ type: 'move', x: 1, y: 1 }), {
        code: 'INPUT_DISPLAY_TRANSITION',
      });
      await worker.sendInput({ type: 'reset' });
      assert.equal(worker.display.width, 1024);
      assert.equal(await resize, 'applied');
      assert.equal(worker.display.generation, 2n);
      assert.equal(worker.display.framebufferRevision, 2n);
      assert.equal(await worker.resizeDisplay(1280, 720), 'unchanged');
      await worker.ping();
    });
  },
);

test(
  'fake display IPC: typed server timeout exceeds ordinary IPC deadline and preserves healthy state',
  { timeout: 12000 },
  async () => {
    await fixture(async (worker) => {
      await connect(worker, config('timeout'));
      const before = worker.display;
      assert.equal(await worker.resizeDisplay(1280, 720), 'timeout');
      assert.deepEqual(worker.display, before);
      assert.equal(worker.state, 'ready');
      await worker.ping();
    });
  },
);

test('fake display IPC: unnegotiated or disabled sessions cannot imply resize readiness', async () => {
  for (const configuration of [
    config('unnegotiated'),
    config('applied', false),
  ]) {
    await fixture(async (worker) => {
      await connect(worker, configuration);
      assert.equal(await worker.resizeDisplay(1280, 720), 'unavailable');
      assert.equal(worker.display.width, 1024);
      await worker.ping();
    });
  }
});

test(
  'fake display IPC: late remote observation remains authoritative after a typed timeout',
  { timeout: 12000 },
  async () => {
    await fixture(async (worker) => {
      await connect(worker, config('timeout-late'));
      assert.equal(await worker.resizeDisplay(1280, 720), 'timeout');
      assert.equal(worker.display.width, 1024);
      await eventually(() => worker.display.width === 1280);
      assert.equal(worker.display.generation, 2n);
      await worker.ping();
    });
  },
);

test(
  'fake display IPC: changed geometry cannot reuse a framebuffer generation',
  { timeout: 12000 },
  async () => {
    await fixture(async (worker) => {
      await connect(worker, config('bad-generation'));
      const failure = once(worker, 'failure');
      await assert.rejects(worker.resizeDisplay(1280, 720), {
        code: 'IPC_PROTOCOL_ERROR',
      });
      await failure;
      assert.equal(worker.state, 'failed');
    });
  },
);

test('fake legacy IPC: dynamic opt-in fails before CONFIGURE/SECRET; false keeps v1 compatible', async () => {
  await fixture(async (worker) => {
    assert.equal(worker.build.capabilities.displayControl, false);
    await assert.rejects(worker.connect(config()), {
      code: 'RDP_SETTING_NOT_IMPLEMENTED',
    });
    await worker.ping();
    await connect(worker, config('applied', false));
    assert.equal(worker.display, undefined);
    await assert.rejects(worker.resizeDisplay(1280, 720), {
      code: 'DISPLAY_NOT_IMPLEMENTED',
    });
    await worker.ping();
  }, true);
});

test(
  'fake display IPC: a peer reporting applied without actual observation is rejected',
  { timeout: 12000 },
  async () => {
    await fixture(async (worker) => {
      await connect(worker, config('false-applied'));
      const failure = once(worker, 'failure');
      await assert.rejects(worker.resizeDisplay(1280, 720), {
        code: 'IPC_PROTOCOL_ERROR',
      });
      await failure;
      assert.equal(worker.state, 'failed');
    });
  },
);

test(
  'fake display IPC: disconnect interrupts pending resize and reclaims runtime resources',
  { timeout: 10000 },
  async () => {
    await fixture(async (worker) => {
      assert.equal(await worker.resizeDisplay(1280, 720), 'disconnected');
      await connect(worker, config());
      const pending = assert.rejects(worker.resizeDisplay(1280, 720));
      await worker.close();
      await pending;
      assert.equal(worker.display, undefined);
    });
  },
);

test(
  'fake display IPC: an observed completion remains valid when remote disconnect follows immediately',
  { timeout: 12000 },
  async () => {
    await fixture(async (worker) => {
      await connect(worker, config('applied-close'));
      assert.equal(await worker.resizeDisplay(1280, 720), 'applied');
      await eventually(() => worker.display === undefined);
      assert.equal(await worker.resizeDisplay(1920, 1080), 'disconnected');
      assert.equal(worker.state, 'ready');
      await worker.ping();
    });
  },
);
