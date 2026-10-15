import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import {
  NativeSessionWorker,
  WorkerProcess,
} from '../../packages/node-bridge/dist/index.js';
import { eventually } from '../fixtures/session-worker.mjs';

test(
  'synthetic clipboard process: explicit native-adapter reservation carries a full 16 MiB private item and joins cleanup',
  { timeout: 30000 },
  async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'rdp-clipboard-budget-'));
    let processOwner;
    class SyntheticProcess extends WorkerProcess {
      spawnWorker(cwd, env) {
        return spawn(
          process.execPath,
          [resolve('tests/fixtures/clipboard-worker.mjs'), 'valid'],
          { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
        );
      }
    }
    class Inspect extends NativeSessionWorker {
      createWorkerProcess(options) {
        processOwner = new SyntheticProcess(options);
        return processOwner;
      }
    }
    const native = new Inspect(
      {
        runtimeRoot,
        ipcTransport: 'framed-pipes',
        heartbeatIntervalMs: 60000,
        workerPath: resolve(
          process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
          'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
        ),
      },
      { clipboardItemBytes: 16777216 },
    );
    const bytes = Buffer.alloc(16777216, 65),
      pattern = Buffer.from('界');
    bytes.fill(pattern, 0, bytes.length - (bytes.length % 3));
    try {
      // Probe only the reserved private process. Public native start stays gated.
      await processOwner.start();
      await processOwner.connect({
        target: { host: 'synthetic' },
        auth: {},
        clipboard: {
          mode: 'bidirectional',
          text: true,
          maxItemBytes: bytes.length,
        },
      });
      await eventually(() => processOwner.clipboardState?.ready);
      assert.equal(await processOwner.writeClipboardText(bytes), 'accepted');
      assert.equal(bytes[0], pattern[0]);
      assert.equal(bytes.at(-1), 65);
      await processOwner.ping();
      assert.equal(await processOwner.revokeClipboardText(), 'accepted');
      assert.equal(processOwner.clipboardState.localAccepted, false);
      await native.close();
      assert.equal(processOwner.state, 'closed');
      assert.deepEqual(await readdir(runtimeRoot), []);
    } finally {
      bytes.fill(0);
      await native.close();
      assert.deepEqual(await readdir(runtimeRoot), []);
      const root = resolve(runtimeRoot);
      if (!root.startsWith(resolve(tmpdir()) + sep + 'rdp-clipboard-budget-'))
        throw new Error('Invalid owned test directory');
      await rm(root, { recursive: true, force: true, maxRetries: 3 });
    }
  },
);
