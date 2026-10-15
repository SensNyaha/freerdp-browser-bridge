import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  WorkerProcess,
  NativeSessionWorker,
} from '../../packages/node-bridge/dist/index.js';
import { eventually } from '../fixtures/session-worker.mjs';
const directory = process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation';
const workerPath = resolve(
  directory,
  'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
);
const config = (mode = 'bidirectional', maximum = 1024) => ({
  target: { host: 'synthetic' },
  auth: {},
  clipboard: { mode, text: true, maxItemBytes: maximum },
});
async function run(mode, body, options = {}) {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'rdp-clipboard-node-'));
  class Fake extends WorkerProcess {
    spawnWorker(cwd, env) {
      return spawn(
        process.execPath,
        [resolve('tests/fixtures/clipboard-worker.mjs'), mode],
        { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
      );
    }
  }
  const worker = new Fake({
    workerPath,
    runtimeRoot,
    ipcTransport: 'framed-pipes',
    heartbeatIntervalMs: 60000,
    ...options,
  });
  try {
    await worker.start();
    await body(worker, runtimeRoot);
  } finally {
    await worker.close();
    assert.deepEqual(await readdir(runtimeRoot), []);
    await rm(runtimeRoot, { recursive: true, force: true, maxRetries: 3 });
  }
}
test('fake clipboard IPC: explicit profiles, copied scalar state and Unicode read/write ownership', async () => {
  for (const mode of [
    'bidirectional',
    'server-to-browser',
    'browser-to-server',
  ])
    await run('valid', async (worker) => {
      assert.equal(worker.build.capabilities.clipboardText, true);
      assert.equal((await worker.readClipboardText(1n)).status, 'unavailable');
      await worker.connect(config(mode));
      await eventually(() => worker.clipboardState?.ready);
      const state = worker.clipboardState;
      state.maximum = 1;
      assert.equal(worker.clipboardState.maximum, 1024);
      const read = await worker.readClipboardText(1n);
      assert.equal(
        read.status,
        mode === 'browser-to-server' ? 'refused' : 'accepted',
      );
      if (read.status === 'accepted') {
        assert.equal(read.text.toString(), 'A\nЖ😀');
        read.text.fill(0);
      }
      const text = Buffer.from('A\nЖ😀');
      assert.equal(
        await worker.writeClipboardText(text),
        mode === 'server-to-browser' ? 'refused' : 'accepted',
      );
      assert.equal(text.toString(), 'A\nЖ😀');
      assert.equal((await worker.readClipboardText(2n)).status, 'stale');
      await worker.ping();
    });
});
test('fake clipboard IPC: explicit revoke uses its capability, clears offer authority and preserves reuse', async () => {
  for (const mode of [
    'bidirectional',
    'server-to-browser',
    'browser-to-server',
  ])
    await run('valid', async (worker) => {
      assert.equal(worker.build.capabilities.clipboardRevoke, true);
      assert.equal(await worker.revokeClipboardText(), 'unavailable');
      await worker.connect(config(mode));
      await eventually(() => worker.clipboardState?.ready);
      if (mode !== 'server-to-browser') {
        assert.equal(
          await worker.writeClipboardText(Buffer.from('A')),
          'accepted',
        );
        assert.equal(worker.clipboardState.localAccepted, true);
      }
      assert.equal(await worker.revokeClipboardText(), 'accepted');
      assert.equal(worker.clipboardState.localAccepted, false);
      assert.equal(worker.clipboardState.localPending, false);
      if (mode !== 'server-to-browser')
        assert.equal(
          await worker.writeClipboardText(Buffer.from('B')),
          'accepted',
        );
      await worker.ping();
    });
  await run('no-revoke', async (worker) => {
    await worker.connect(config());
    await eventually(() => worker.clipboardState?.ready);
    assert.equal(worker.build.capabilities.clipboardText, true);
    await assert.rejects(worker.revokeClipboardText(), {
      code: 'CLIPBOARD_NOT_IMPLEMENTED',
    });
    assert.equal(await worker.writeClipboardText(Buffer.from('A')), 'accepted');
    await worker.ping();
  });
  await run('revoke-stale', async (worker) => {
    await worker.connect(config());
    await eventually(() => worker.clipboardState?.ready);
    await assert.rejects(worker.revokeClipboardText(), {
      code: 'IPC_UNEXPECTED_REPLY',
    });
    assert.equal(worker.clipboardState, undefined);
  });
  await run('hold', async (worker) => {
    await worker.connect(config());
    await eventually(() => worker.clipboardState?.ready);
    const revoke = worker.revokeClipboardText();
    assert.equal(await worker.revokeClipboardText(), 'busy');
    assert.equal(await worker.writeClipboardText(Buffer.from('A')), 'busy');
    assert.equal((await worker.readClipboardText(1n)).status, 'busy');
    await worker.ping();
    assert.equal(await revoke, 'accepted');
  });
});
test('fake clipboard IPC: one flight preserves heartbeat and output; offer change discards stale text', async () => {
  await run('hold', async (worker) => {
    await worker.connect(config());
    await eventually(() => worker.clipboardState?.ready);
    const read = worker.readClipboardText(1n);
    assert.equal(await worker.writeClipboardText(Buffer.from('A')), 'busy');
    assert.equal(await worker.revokeClipboardText(), 'busy');
    assert.equal((await worker.readClipboardText(1n)).status, 'busy');
    await worker.ping();
    const result = await read;
    assert.equal(result.status, 'accepted');
    result.text.fill(0);
  });
  await run('stale', async (worker) => {
    await worker.connect(config());
    await eventually(() => worker.clipboardState?.ready);
    const result = await worker.readClipboardText(1n);
    assert.equal(result.status, 'stale');
    assert.equal(result.text.length, 0);
    assert.equal(worker.clipboardState.revision, 2n);
    await worker.ping();
  });
});
test('fake clipboard IPC: terminal lifecycle rejects current read and drains one late result without revival', async () => {
  for (const mode of ['terminal', 'source-close'])
    await run(mode, async (worker) => {
      await worker.connect(config());
      await eventually(() => worker.clipboardState?.ready);
      const result = await worker.readClipboardText(1n);
      assert.equal(result.status, 'disconnected');
      assert.equal(result.text.length, 0);
      assert.equal(worker.clipboardState, undefined);
      await worker.ping();
      assert.equal(worker.state, 'ready');
      assert.equal((await worker.readClipboardText(1n)).status, 'unavailable');
    });
});
test('fake clipboard IPC: malformed identity, duplicate result, oversized native text and changed policy retire IPC', async () => {
  for (const mode of [
    'mismatch',
    'duplicate',
    'overquota',
    'bad-state',
    'generation',
    'backward',
    'premature',
  ])
    await run(mode, async (worker) => {
      await worker.connect(config()).catch(() => {});
      if (
        !['bad-state', 'generation', 'backward', 'premature'].includes(mode)
      ) {
        await eventually(() => worker.clipboardState?.ready);
        const result = await worker
          .readClipboardText(1n)
          .catch(() => undefined);
        if (result) {
          if (mode === 'duplicate' && result.status === 'accepted')
            result.text.fill(0);
          else {
            assert.notEqual(result.status, 'accepted');
            assert.equal(result.text.length, 0);
          }
        }
      }
      await eventually(() => worker.state === 'failed');
      assert.equal(worker.clipboardState, undefined);
    });
});
test('fake clipboard IPC: local Unicode/item/write budgets refuse before dispatch and preserve reuse', async () => {
  await run('valid', async (worker) => {
    await worker.connect(config('bidirectional', 1048576));
    await eventually(() => worker.clipboardState?.ready);
    for (const bytes of [
      Buffer.from([0]),
      Buffer.from([0xff]),
      Buffer.alloc(1048576, 65),
    ])
      await assert.rejects(worker.writeClipboardText(bytes), {
        code: 'CLIPBOARD_INVALID_TEXT',
      });
    await assert.rejects(worker.readClipboardText(0n), {
      code: 'CLIPBOARD_INVALID_REQUEST',
    });
    await assert.rejects(worker.writeClipboardText(Buffer.alloc(70000, 65)), {
      code: 'IPC_QUEUE_FULL',
    });
    assert.equal(await worker.writeClipboardText(Buffer.from('A')), 'accepted');
    await worker.ping();
  });
});
test('fake clipboard IPC: old peers and unsupported formats refuse before configure or secret', async () => {
  await run('legacy', async (worker) => {
    assert.equal(worker.build.capabilities.clipboardText, false);
    await assert.rejects(worker.connect(config()), {
      code: 'RDP_SETTING_NOT_IMPLEMENTED',
    });
    await worker.ping();
    assert.equal(worker.state, 'ready');
  });
  for (const setting of [
    { html: true },
    { images: true },
    { files: true },
    { text: false },
    { mode: undefined },
  ])
    await run('valid', async (worker) => {
      const value = config();
      Object.assign(value.clipboard, setting);
      await assert.rejects(worker.connect(value), {
        code: 'RDP_SETTING_NOT_IMPLEMENTED',
      });
      await worker.ping();
    });
});
test(
  'fake clipboard IPC: unanswered read has a finite native-completion deadline and no retry',
  { timeout: 15000 },
  async () => {
    await run('timeout', async (worker) => {
      await worker.connect(config());
      await eventually(() => worker.clipboardState?.ready);
      await assert.rejects(worker.readClipboardText(1n), {
        code: 'IPC_TIMEOUT',
      });
      assert.equal(worker.state, 'failed');
    });
  },
);
test('public native clipboard remains gated before backend spawn pending controller/browser ownership', async () => {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'rdp-clipboard-public-'));
  const worker = new NativeSessionWorker({ workerPath, runtimeRoot });
  try {
    await assert.rejects(worker.start(config(), new AbortController().signal), {
      code: 'RDP_SETTING_NOT_IMPLEMENTED',
    });
    assert.equal(worker.pid, undefined);
  } finally {
    await worker.close();
    assert.deepEqual(await readdir(runtimeRoot), []);
    await rm(runtimeRoot, { recursive: true, force: true, maxRetries: 3 });
  }
});
