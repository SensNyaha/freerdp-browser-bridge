import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import {
  NativeSessionWorker,
  WorkerProcess,
  SessionManager,
} from '../../packages/node-bridge/dist/index.js';
import { imageItem } from '../fixtures/image-session-worker.mjs';
import { eventually } from '../fixtures/session-worker.mjs';
const workerPath = resolve(
  process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
  'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
);
async function fixture(
  body,
  limits = { clipboardItemBytes: 1024, clipboardImage: true },
) {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'rdp-image-adapter-'));
  let options;
  class Synthetic extends WorkerProcess {
    spawnWorker(cwd, env) {
      return spawn(
        process.execPath,
        [resolve('tests/fixtures/clipboard-worker.mjs'), 'image-no-html'],
        { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
      );
    }
  }
  class Adapter extends NativeSessionWorker {
    createWorkerProcess(value) {
      options = value;
      return new Synthetic(value);
    }
  }
  const native = new Adapter(
    {
      workerPath,
      runtimeRoot,
      ipcTransport: 'framed-pipes',
      heartbeatIntervalMs: 60000,
    },
    limits,
  );
  try {
    await body({ native, options });
  } finally {
    await native.close();
    assert.deepEqual(await readdir(runtimeRoot), []);
    assert.ok(
      resolve(runtimeRoot).startsWith(
        resolve(tmpdir()) + sep + 'rdp-image-adapter-',
      ),
    );
    await rm(runtimeRoot, { recursive: true, force: true, maxRetries: 3 });
  }
}
const config = {
  target: { host: 'synthetic' },
  auth: {},
  clipboard: { mode: 'bidirectional', images: true, maxItemBytes: 1024 },
};
test('Synthetic image private process plus actual native adapter: exact reservation and image-only methods compose', async () => {
  await fixture(async ({ native, options }) => {
    assert.equal(options.maxWriteBytes, 65536 + 24 + 24 + 1024 + 16);
    let ready = false;
    const unsubscribe = native.onClipboard((state) => {
      ready = state.ready;
    });
    await native.start(config, new AbortController().signal);
    await eventually(() => ready);
    const result = await native.readClipboardImage(1n);
    assert.deepEqual(result.item, imageItem());
    const item = imageItem();
    assert.equal(await native.writeClipboardImage(item), 'accepted');
    assert.deepEqual(item, imageItem());
    assert.equal(await native.revokeClipboardText(), 'accepted');
    result.item.rgba.fill(0);
    unsubscribe();
  });
});
for (const delayedSource of [false, true])
  test(`Synthetic image private process plus manager: ${delayedSource ? 'connected before clipboard source' : 'ordinary source ordering'} preserves reservation and joins revoke`, async () => {
    await fixture(async ({ native }) => {
      let sourceHeld, publishSource;
      if (delayedSource) {
        const subscribe = native.onClipboard.bind(native);
        let held = true;
        native.onClipboard = (listener) =>
          subscribe((state) => {
            if (!held) return listener(state);
            // Hold one scalar snapshot, rather than relying on pipe chunking or a
            // scheduling delay to expose connected-before-clipboard ordering.
            sourceHeld = { ...state };
            publishSource = () => {
              held = false;
              listener(sourceHeld);
              sourceHeld = undefined;
            };
          });
      }
      const principal = { id: 'image-adapter' },
        manager = new SessionManager({
          workerFactory: (limits) => {
            assert.deepEqual(limits, {
              clipboardItemBytes: 1024,
              clipboardImage: true,
            });
            return native;
          },
        });
      try {
        const session = manager.create(config, principal, 'image-adapter');
        await eventually(
          () => manager.get(session.sessionId, principal).state === 'connected',
        );
        const control = manager.attach(
          session.sessionId,
          manager.mintToken(session.sessionId, principal, 'control').token,
          'control',
        );
        if (delayedSource) {
          await eventually(() => sourceHeld?.ready === true);
          assert.notEqual(control.clipboardSnapshot.state?.ready, true);
          assert.equal(control.startClipboard(), false);
          publishSource();
        }
        await eventually(() => control.clipboardSnapshot.state?.ready === true);
        assert.equal(control.startClipboard(), true);
        const image = await control.readClipboardImage(1n);
        assert.deepEqual(image.item, imageItem());
        assert.equal(
          await control.writeClipboardImage(imageItem()),
          'accepted',
        );
        assert.equal(await control.stopClipboard(), true);
        assert.equal(control.clipboardSnapshot.state.localImageAccepted, false);
        image.item.rgba.fill(0);
        control.release();
      } finally {
        await manager.shutdown();
      }
    });
  });
test('Native image adapter: missing or mismatched reservation refuses before spawning a child', async () => {
  for (const limits of [
    {},
    { clipboardItemBytes: 1024 },
    { clipboardItemBytes: 1023, clipboardImage: true },
  ])
    await fixture(async ({ native }) => {
      await assert.rejects(native.start(config, new AbortController().signal), {
        code: 'RDP_SETTING_NOT_IMPLEMENTED',
      });
      assert.equal(native.pid, undefined);
    }, limits);
  for (const limits of [
    { clipboardImage: true },
    { clipboardItemBytes: 1024, clipboardImage: false },
  ])
    assert.throws(
      () =>
        new NativeSessionWorker(
          { workerPath, runtimeRoot: resolve('build') },
          limits,
        ),
      { code: 'RDP_SETTING_NOT_IMPLEMENTED' },
    );
  assert.throws(
    () =>
      new NativeSessionWorker(
        { workerPath, runtimeRoot: resolve('build'), maxWriteBytes: 65536 },
        { clipboardItemBytes: 1024, clipboardImage: true },
      ),
    { code: 'RDP_SETTING_NOT_IMPLEMENTED' },
  );
});
