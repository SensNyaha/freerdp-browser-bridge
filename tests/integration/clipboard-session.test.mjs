import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  WorkerProcess,
  SessionManager,
} from '../../packages/node-bridge/dist/index.js';
import { FakeSessionWorker, eventually } from '../fixtures/session-worker.mjs';

test('synthetic clipboard process: control transfer drains private write and exact revoke reply before replacement', async () => {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'rdp-clipboard-session-'));
  const workerPath = resolve(
    process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
    'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
  );
  class SyntheticProcess extends WorkerProcess {
    spawnWorker(cwd, env) {
      return spawn(
        process.execPath,
        [resolve('tests/fixtures/clipboard-worker.mjs'), 'hold'],
        { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
      );
    }
  }
  const worker = new SyntheticProcess({
    workerPath,
    runtimeRoot,
    ipcTransport: 'framed-pipes',
    heartbeatIntervalMs: 60000,
  });
  class Backend extends FakeSessionWorker {
    revokes = 0;
    constructor() {
      super();
      worker.on('rdp-state', (state) => this.emit('state', state.state));
      worker.on('failure', () => this.emit('failure', 'WORKER_FAILED'));
    }
    onClipboard(listener) {
      worker.on('clipboard', listener);
      return () => worker.off('clipboard', listener);
    }
    async start(config, signal) {
      if (signal.aborted) throw new Error('Synthetic startup aborted');
      await worker.start();
      await worker.connect(config);
    }
    async close() {
      await worker.close();
      this.emit('state', 'closed');
    }
    async terminate() {
      worker.terminate();
      await worker.close();
    }
    readClipboardText(revision) {
      return worker.readClipboardText(revision);
    }
    writeClipboardText(text) {
      return worker.writeClipboardText(text);
    }
    revokeClipboardText() {
      ++this.revokes;
      return worker.revokeClipboardText();
    }
  }
  const backend = new Backend(),
    manager = new SessionManager({ workerFactory: () => backend });
  try {
    const principal = { id: 'synthetic-clipboard' };
    const session = manager.create(
      {
        target: { host: 'synthetic' },
        auth: {},
        clipboard: { mode: 'bidirectional', text: true, maxItemBytes: 1024 },
      },
      principal,
      'fixture',
    );
    await eventually(
      () =>
        manager.get(session.sessionId, principal).state === 'connected' &&
        worker.clipboardState?.ready,
    );
    const attach = () =>
      manager.attach(
        session.sessionId,
        manager.mintToken(session.sessionId, principal, 'control').token,
        'control',
      );
    const first = attach();
    assert.equal(first.startClipboard(), true);
    const write = first.writeClipboardText(Buffer.from('A\nЖ😀'));
    first.release();
    const next = attach();
    assert.equal(next.startClipboard(), false);
    assert.equal(backend.revokes, 0);
    await worker.ping();
    assert.equal(await write, 'disconnected');
    await eventually(() => backend.revokes === 1);
    assert.equal(next.startClipboard(), false);
    assert.equal(next.clipboardSnapshot.retiring, true);
    await worker.ping();
    await eventually(() => !next.clipboardSnapshot.retiring);
    assert.equal(worker.clipboardState.localAccepted, false);
    assert.equal(next.startClipboard(), true);
    const read = next.readClipboardText(1n);
    await worker.ping();
    const data = await read;
    assert.equal(data.status, 'accepted');
    assert.equal(data.text.toString(), 'A\nЖ😀');
    data.text.fill(0);
    assert.equal(await next.stopClipboard(), true);
    assert.equal(backend.revokes, 1); // Read-only use leaves no new local offer.
    next.release();
    await manager.shutdown();
    assert.equal(worker.state, 'closed');
    assert.deepEqual(await readdir(runtimeRoot), []);
  } finally {
    await manager.shutdown();
    await worker.close();
    assert.deepEqual(await readdir(runtimeRoot), []);
    const root = resolve(runtimeRoot);
    if (
      !root.startsWith(resolve(tmpdir())) ||
      !root.includes('rdp-clipboard-session-')
    )
      throw new Error('Invalid owned test directory');
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
});
