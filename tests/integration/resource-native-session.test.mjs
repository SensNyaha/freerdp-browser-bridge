import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  NativeSessionWorker,
  SessionManager,
} from '../../packages/node-bridge/dist/index.js';
import { processQuerySnapshot } from '../../packages/node-bridge/dist/process-query-gate.js';
import { eventually } from '../fixtures/session-worker.mjs';
import { createRdpTlsFixture } from '../fixtures/rdp-tls.mjs';

const workerPath = resolve(
  process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
  'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
);
const linked = JSON.parse(
  execFileSync(workerPath, ['--capabilities'], {
    encoding: 'utf8',
    windowsHide: true,
  }),
).capabilities.connectCore;

test(
  'actual native adapter / synthetic TLS peer: RSS failure at certificate wait preserves registry error, retires tokens and joins slot/PID/runtime release',
  {
    skip: !linked || !['win32', 'linux'].includes(process.platform),
    timeout: 15000,
  },
  async () => {
    const endpoint = await createRdpTlsFixture();
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'rdp-resource-adapter-'));
    let adapter,
      closed = false,
      factories = 0,
      errors = 0;
    class ObservedAdapter extends NativeSessionWorker {
      async close() {
        await super.close();
        closed = true;
      }
    }
    const manager = new SessionManager({
      maxSessions: 1,
      maxPerPrincipal: 1,
      workerFactory() {
        ++factories;
        adapter = new ObservedAdapter({
          workerPath,
          runtimeRoot,
          ipcTransport: 'framed-pipes',
          maxResidentBytes: 1,
          residentPollIntervalMs: 2000,
        });
        return adapter;
      },
    });
    manager.on('event', (event) => {
      if (event.type === 'session.error') ++errors;
    });
    const owner = { id: 'synthetic-tls-resource-owner' };
    const config = {
      target: { host: '127.0.0.1', port: endpoint.port },
      auth: { username: 'synthetic', password: 'synthetic-IPC-sentinel' },
      security: { protocol: 'tls', certificatePolicy: 'prompt' },
      timeouts: { connectMs: 5000 },
    };
    let lease;
    try {
      const { sessionId } = manager.create(config, owner, '127.0.0.1');
      const stale = manager.mintToken(sessionId, owner, 'media').token;
      assert.throws(() => manager.create(config, owner, '127.0.0.1'), {
        code: 'SESSION_LIMIT',
      });
      assert.equal(factories, 1);
      await eventually(
        () => manager.get(sessionId, owner).state === 'awaiting-user',
        5000,
      );
      const pid = adapter.pid;
      assert.ok(Number.isSafeInteger(pid));
      lease = manager.attach(
        sessionId,
        manager.mintToken(sessionId, owner, 'control').token,
        'control',
      );
      const prompt = lease.certificate;
      assert.ok(prompt);
      await eventually(
        () => manager.get(sessionId, owner).state === 'failed',
        5000,
      );
      assert.deepEqual(manager.get(sessionId, owner).error, {
        code: 'WORKER_MEMORY_LIMIT',
        message: 'Session worker memory policy exceeded',
        retryable: false,
      });
      assert.equal(errors, 1);
      assert.throws(() => manager.mintToken(sessionId, owner, 'media'), {
        code: 'SESSION_NOT_ATTACHABLE',
      });
      assert.throws(() => manager.attach(sessionId, stale, 'media'), {
        code: 'ATTACH_INVALID',
      });
      await assert.rejects(
        lease.respondCertificate({ ...prompt, accept: true }),
        { code: 'CERTIFICATE_PROMPT_STALE' },
      );
      await eventually(() => manager.statistics().active === 0, 5000);
      assert.equal(closed, true);
      assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
      assert.deepEqual(await readdir(runtimeRoot), []);
      assert.equal(processQuerySnapshot().active, 0);
      assert.equal(processQuerySnapshot().waiting, 0);
      assert.equal(endpoint.applicationBytes, 0);
    } finally {
      lease?.release();
      await manager.shutdown();
      await endpoint.close();
      await rm(runtimeRoot, { recursive: true, force: true, maxRetries: 3 });
    }
  },
);
