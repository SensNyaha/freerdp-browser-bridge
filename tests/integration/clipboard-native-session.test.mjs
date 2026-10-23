import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, sep } from 'node:path';
import {
  NativeSessionWorker,
  WorkerProcess,
  SessionManager,
} from '../../packages/node-bridge/dist/index.js';
import { eventually } from '../fixtures/session-worker.mjs';
import { createRdpTlsFixture } from '../fixtures/rdp-tls.mjs';

const workerPath = resolve(
  process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
  'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
);
const available = JSON.parse(
  execFileSync(workerPath, ['--capabilities'], {
    encoding: 'utf8',
    windowsHide: true,
  }),
).capabilities.clipboardRevoke;
async function removeOwned(root) {
  assert.deepEqual(await readdir(root), []);
  if (!resolve(root).startsWith(resolve(tmpdir()) + sep + 'rdp-clip-adapter-'))
    throw new Error('Invalid owned test directory');
  await rm(root, { recursive: true, force: true, maxRetries: 3 });
}

test('native clipboard adapter: legacy and read/set-only HELLO refuse before CONFIGURE or SECRET', async () => {
  for (const mode of ['legacy', 'no-revoke']) {
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'rdp-clip-adapter-'));
    let connects = 0,
      processOwner;
    class Synthetic extends WorkerProcess {
      spawnWorker(cwd, env) {
        return spawn(
          process.execPath,
          [resolve('tests/fixtures/clipboard-worker.mjs'), mode],
          {
            cwd,
            env,
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
          },
        );
      }
      connect(config) {
        ++connects;
        return super.connect(config);
      }
    }
    class Adapter extends NativeSessionWorker {
      createWorkerProcess(options) {
        processOwner = new Synthetic(options);
        return processOwner;
      }
    }
    const native = new Adapter(
      { workerPath, runtimeRoot, ipcTransport: 'framed-pipes' },
      { clipboardItemBytes: 1024 },
    );
    try {
      await assert.rejects(
        native.start(
          {
            target: { host: 'synthetic' },
            auth: { password: 'synthetic rejected secret' },
            clipboard: { mode: 'bidirectional', maxItemBytes: 1024 },
          },
          new AbortController().signal,
        ),
        { code: 'RDP_SETTING_NOT_IMPLEMENTED' },
      );
      assert.equal(connects, 0);
      assert.equal(processOwner.state, 'ready');
      assert.equal(processOwner.build.capabilities.clipboardRevoke, false);
      await native.close();
      assert.equal(processOwner.state, 'closed');
    } finally {
      await native.close();
      await removeOwned(runtimeRoot);
    }
  }
});

for (const mode of ['bidirectional', 'server-to-browser', 'browser-to-server'])
  for (const ipcTransport of process.platform === 'linux'
    ? ['auto', 'framed-pipes']
    : ['auto'])
    test(
      `actual native clipboard session: ${mode} / ${ipcTransport} strict TLS and joined cleanup`,
      { skip: !available, timeout: 15000 },
      async () => {
        const runtimeRoot = await mkdtemp(join(tmpdir(), 'rdp-clip-adapter-'));
        const endpoint = await createRdpTlsFixture();
        const principal = { id: 'native-clipboard-fixture' };
        let native;
        const sources = [];
        const manager = new SessionManager({
          workerFactory: (limits) => {
            native = new NativeSessionWorker(
              { workerPath, runtimeRoot, ipcTransport },
              limits,
            );
            native.onClipboard((state) => sources.push(state));
            return native;
          },
        });
        try {
          const created = manager.create(
            {
              target: { host: '127.0.0.1', port: endpoint.port },
              auth: {
                username: 'synthetic',
                password: 'synthetic private IPC sentinel',
              },
              security: { protocol: 'tls', certificatePolicy: 'strict' },
              clipboard: { mode, text: true, maxItemBytes: 65536 },
              timeouts: { connectMs: 5000 },
            },
            principal,
            '127.0.0.1',
          );
          await eventually(
            () => manager.get(created.sessionId, principal).state === 'failed',
            6000,
          );
          assert.equal(
            manager.get(created.sessionId, principal).error.code,
            'RDP_CERTIFICATE_REJECTED',
          );
          assert.equal(endpoint.applicationBytes, 0);
          assert.ok(sources.length <= 1);
          for (const source of sources) {
            assert.equal(source.ready, false);
            assert.equal(source.maximum, 65536);
            assert.equal(source.toServer, mode !== 'server-to-browser');
            assert.equal(source.fromServer, mode !== 'browser-to-server');
          }
          assert.equal(
            (await native.readClipboardText(1n)).status,
            'unavailable',
          );
          assert.equal(
            await native.writeClipboardText(Buffer.from('synthetic')),
            'unavailable',
          );
          await manager.shutdown();
        } finally {
          await manager.shutdown();
          await endpoint.close();
          await removeOwned(runtimeRoot);
        }
      },
    );
