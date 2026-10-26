import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import {
  NativeSessionWorker,
  WorkerProcess,
  SessionManager,
} from '../../packages/node-bridge/dist/index.js';
import { FakeSessionWorker, eventually } from '../fixtures/session-worker.mjs';
const workerPath = resolve(
  process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
  'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
);
const workerOptions = {
  workerPath,
  runtimeRoot: resolve('build/clipboard-budget-never-started'),
};

test('clipboard reservation: exact finite item-plus-envelope-and-control budget, defaults and host refusal', async () => {
  let captured,
    constructed = 0;
  class Inspect extends NativeSessionWorker {
    createWorkerProcess(options) {
      captured = options;
      ++constructed;
      return new WorkerProcess(options);
    }
  }
  for (const maximum of [undefined, 1, 1048576, 16777216]) {
    const worker = new Inspect(
      workerOptions,
      maximum === undefined ? {} : { clipboardItemBytes: maximum },
    );
    assert.equal(
      captured.maxWriteBytes,
      maximum === undefined ? undefined : 65536 + maximum + 48,
    );
    assert.equal(worker.pid, undefined);
    await worker.close();
  }
  for (const maximum of [0, -1, 1.5, NaN, 16777217]) {
    const before = constructed;
    assert.throws(
      () => new Inspect(workerOptions, { clipboardItemBytes: maximum }),
      { code: 'RDP_SETTING_NOT_IMPLEMENTED' },
    );
    assert.equal(constructed, before);
  }
  assert.throws(
    () =>
      new Inspect(
        { ...workerOptions, maxWriteBytes: 65536 + 1024 + 47 },
        { clipboardItemBytes: 1024 },
      ),
    { code: 'RDP_SETTING_NOT_IMPLEMENTED' },
  );
  const explicit = new Inspect(
    { ...workerOptions, maxWriteBytes: 100000 },
    { clipboardItemBytes: 1024 },
  );
  assert.equal(captured.maxWriteBytes, 100000);
  await explicit.close();
  const gated = new Inspect(workerOptions, { clipboardItemBytes: 2048 });
  const before = constructed;
  await assert.rejects(
    gated.start(
      {
        target: { host: 'synthetic' },
        auth: {},
        clipboard: { mode: 'bidirectional', text: true, maxItemBytes: 1024 },
      },
      new AbortController().signal,
    ),
    { code: 'RDP_SETTING_NOT_IMPLEMENTED' },
  );
  assert.equal(constructed, before);
  assert.equal(gated.pid, undefined);
  await gated.close();
});
test('clipboard reservation: manager factory receives only frozen nonsecret numeric limits', async () => {
  for (const mode of [
    'off',
    'server-to-browser',
    'browser-to-server',
    'bidirectional',
  ]) {
    let limits;
    const worker = new FakeSessionWorker();
    Object.assign(worker, {
      onClipboard: () => () => {},
      readClipboardText: async () => ({
        status: 'unavailable',
        text: Buffer.alloc(0),
      }),
      writeClipboardText: async () => 'unavailable',
      revokeClipboardText: async () => 'accepted',
    });
    const manager = new SessionManager({
      workerFactory: (value) => {
        limits = value;
        return worker;
      },
    });
    const principal = { id: 'reservation-fixture' };
    try {
      const session = manager.create(
        {
          target: { host: 'synthetic' },
          auth: {
            username: 'synthetic',
            password: 'synthetic factory credential canary',
          },
          clipboard: { mode, text: true, maxItemBytes: 16777216 },
        },
        principal,
        'fixture',
      );
      assert.equal(Object.isFrozen(limits), true);
      assert.deepEqual(
        limits,
        mode === 'off' ? {} : { clipboardItemBytes: 16777216 },
      );
      assert.equal(JSON.stringify(limits).includes('canary'), false);
      await eventually(
        () => manager.get(session.sessionId, principal).state === 'connected',
      );
    } finally {
      await manager.shutdown();
    }
  }
});
test('HTML reservation: fixed inner header is explicit, capped and refused before process construction when missing', async () => {
  let captured,
    constructed = 0;
  class Inspect extends NativeSessionWorker {
    createWorkerProcess(options) {
      captured = options;
      ++constructed;
      return new WorkerProcess(options);
    }
  }
  for (const maximum of [1, 1024, 16777216]) {
    const required = 65536 + 48 + Math.min(16777216, maximum + 32);
    const worker = new Inspect(workerOptions, {
      clipboardItemBytes: maximum,
      clipboardHtml: true,
    });
    assert.equal(captured.maxWriteBytes, required);
    await worker.close();
    const before = constructed;
    assert.throws(
      () =>
        new Inspect(
          { ...workerOptions, maxWriteBytes: required - 1 },
          { clipboardItemBytes: maximum, clipboardHtml: true },
        ),
      { code: 'RDP_SETTING_NOT_IMPLEMENTED' },
    );
    assert.equal(constructed, before);
  }
  assert.throws(() => new Inspect(workerOptions, { clipboardHtml: true }), {
    code: 'RDP_SETTING_NOT_IMPLEMENTED',
  });
  const worker = new Inspect(workerOptions, { clipboardItemBytes: 1024 });
  await assert.rejects(
    worker.start(
      {
        target: { host: 'synthetic' },
        auth: {},
        clipboard: { mode: 'bidirectional', html: true, maxItemBytes: 1024 },
      },
      new AbortController().signal,
    ),
    { code: 'RDP_SETTING_NOT_IMPLEMENTED' },
  );
  assert.equal(worker.pid, undefined);
  await worker.close();
});
