import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { WorkerProcess } from '../../packages/node-bridge/dist/index.js';
import { Kind } from '../../packages/protocol/dist/index.js';
import { RDP_PERFORMANCE_FIELDS } from '../../packages/config/dist/index.js';
import { eventually } from '../fixtures/session-worker.mjs';

const workerPath = resolve(
  process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
  'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
);
const fixture = fileURLToPath(
  new URL('../fixtures/performance-worker.mjs', import.meta.url),
);
const config = {
  target: { host: 'synthetic.invalid' },
  auth: { username: 'synthetic', password: 'synthetic-IPC-sentinel' },
};
async function withPeer(mode, run) {
  const root = await mkdtemp(join(tmpdir(), 'rdp-performance-peer-'));
  const seen = [];
  class Peer extends WorkerProcess {
    spawnWorker(directory, env) {
      const child = spawn(process.execPath, [fixture, mode], {
        cwd: directory,
        env,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      });
      child.on('message', (value) => {
        if (seen.length < 32) seen.push(value);
      });
      return child;
    }
  }
  const worker = new Peer({
    workerPath,
    runtimeRoot: root,
    ipcTransport: 'framed-pipes',
  });
  try {
    await worker.start();
    await run(worker, seen);
    await worker.ping();
  } finally {
    await worker.close();
    assert.deepEqual(await readdir(root), []);
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
}
test('synthetic performance IPC: absent capability refuses explicit appearance before CONFIGURE/SECRET while legacy encoder profiles remain valid', async () => {
  await withPeer('legacy', async (worker, seen) => {
    assert.equal(worker.build.capabilities.performanceSettings, false);
    for (const field of RDP_PERFORMANCE_FIELDS)
      for (const value of [true, false])
        await assert.rejects(
          worker.connect({ ...config, quality: { [field]: value } }),
          { code: 'RDP_SETTING_NOT_IMPLEMENTED' },
        );
    await worker.ping();
    await eventually(() => seen.some((row) => row.kind === Kind.Heartbeat));
    assert.equal(
      seen.some((row) =>
        [Kind.Configure, Kind.Secret, Kind.Connect].includes(row.kind),
      ),
      false,
    );
    await worker.connect({ ...config, quality: { profile: 'balanced' } });
    await eventually(() => seen.some((row) => row.kind === Kind.Connect));
    assert.equal(seen.find((row) => row.kind === Kind.Configure).schema, 2);
  });
});
test('synthetic performance IPC: capable peers get versioned profile/override selection and omission preserves legacy bytes', async () => {
  for (const [quality, schema, mask, values] of [
    [undefined, 1],
    [{ profile: 'custom' }, 2],
    [{ profile: 'balanced' }, 11, 3, 2],
    [
      { profile: 'low-bandwidth', fontSmoothing: true, themes: true },
      11,
      59,
      34,
    ],
    [{ profile: 'lan' }, 11, 63, 63],
    [{ fontSmoothing: false }, 11, 2, 0],
  ])
    await withPeer('capable', async (worker, seen) => {
      assert.equal(worker.build.capabilities.performanceSettings, true);
      await worker.connect({ ...config, ...(quality ? { quality } : {}) });
      await eventually(() => seen.some((row) => row.kind === Kind.Connect));
      const configured = seen.find((row) => row.kind === Kind.Configure);
      assert.equal(configured.schema, schema);
      assert.equal(configured.mask, mask);
      assert.equal(configured.values, values);
      assert.equal(seen.filter((row) => row.kind === Kind.Secret).length, 1);
    });
});

test('synthetic IP IPC: old peers refuse false/null and selected family before CONFIGURE/SECRET', async () => {
  for (const mode of ['legacy', 'capable'])
    await withPeer(mode, async (worker, seen) => {
      assert.equal(worker.build.capabilities.ipSettings, false);
      for (const selected of [
        { preferIPv6: true },
        { preferIPv6: false },
        { forceIpVersion: null },
        { forceIpVersion: 4 },
        { forceIpVersion: 6 },
      ])
        await assert.rejects(
          worker.connect({
            ...config,
            target: { ...config.target, ...selected },
          }),
          { code: 'RDP_SETTING_NOT_IMPLEMENTED' },
        );
      await worker.ping();
      await eventually(() => seen.some((row) => row.kind === Kind.Heartbeat));
      assert.equal(
        seen.some((row) =>
          [Kind.Configure, Kind.Secret, Kind.Connect].includes(row.kind),
        ),
        false,
      );
      await worker.connect(config);
      await eventually(() => seen.some((row) => row.kind === Kind.Connect));
      assert.equal(seen.find((row) => row.kind === Kind.Configure).schema, 1);
    });
});

test(
  'synthetic IP IPC: omitted fields retain legacy bytes; false/null and family selections remain explicit',
  { timeout: 30000 },
  async () => {
    for (const preferIPv6 of [undefined, false, true])
      for (const forceIpVersion of [undefined, null, 4, 6])
        await withPeer('ip', async (worker, seen) => {
          const target = {
            ...config.target,
            ...(preferIPv6 === undefined ? {} : { preferIPv6 }),
            ...(forceIpVersion === undefined ? {} : { forceIpVersion }),
          };
          assert.equal(worker.build.capabilities.ipSettings, true);
          await worker.connect({ ...config, target });
          await eventually(() => seen.some((row) => row.kind === Kind.Connect));
          const configured = seen.find((row) => row.kind === Kind.Configure);
          if (preferIPv6 === undefined && forceIpVersion === undefined) {
            assert.equal(configured.schema, 1);
            assert.equal(configured.ip, undefined);
          } else {
            assert.equal(configured.schema, 12);
            assert.deepEqual(configured.ip, {
              mask:
                (preferIPv6 === undefined ? 0 : 1) |
                (forceIpVersion === undefined ? 0 : 2),
              preferIPv6: preferIPv6 ? 1 : 0,
              forceIpVersion: forceIpVersion ?? 0,
            });
            assert.equal(configured.mask, 0);
            assert.equal(configured.values, 0);
          }
          assert.equal(
            seen.filter((row) => row.kind === Kind.Secret).length,
            1,
          );
        });
  },
);

test('synthetic IP/performance IPC: schema12 preserves explicit appearance projection', async () => {
  await withPeer('ip-performance', async (worker, seen) => {
    await worker.connect({
      ...config,
      target: { ...config.target, preferIPv6: true, forceIpVersion: 4 },
      quality: { fontSmoothing: true, themes: false },
    });
    await eventually(() => seen.some((row) => row.kind === Kind.Connect));
    const configured = seen.find((row) => row.kind === Kind.Configure);
    assert.equal(configured.schema, 12);
    assert.deepEqual(configured.ip, {
      mask: 3,
      preferIPv6: 1,
      forceIpVersion: 4,
    });
    assert.equal(configured.mask, 34);
    assert.equal(configured.values, 2);
  });
});
