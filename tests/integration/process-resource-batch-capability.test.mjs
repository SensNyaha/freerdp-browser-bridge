import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { probeWorkerBuild } from '../../packages/node-bridge/dist/index.js';
import { processResourceBatchSnapshot } from '../../packages/node-bridge/dist/process-resource-batch.js';

test(
  'actual new Windows host-batch capability: CLI/HELLO agree without activating a resource policy',
  {
    skip:
      process.platform !== 'win32' ||
      process.env.BRIDGE_TEST_RESOURCE_BATCH_HELPER !== '1',
    timeout: 10000,
  },
  async (t) => {
    const runtimeRoot = await mkdtemp(resolve('build/resource-capability-'));
    const workerPath = resolve(
      process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
      'rdp-worker.exe',
    );
    try {
      const before = processResourceBatchSnapshot();
      const report = await probeWorkerBuild({ workerPath, runtimeRoot });
      const cli = await promisify(execFile)(
        workerPath,
        ['--version', '--capabilities'],
        {
          windowsHide: true,
          timeout: 2000,
          maxBuffer: 8192,
        },
      );
      assert.equal(cli.stderr, '');
      const standalone = JSON.parse(cli.stdout);
      assert.equal(report.os, 'windows');
      assert.equal(report.capabilities.processResourceBatch, true);
      assert.equal(standalone.capabilities.processResourceBatch, true);
      assert.equal(standalone.freeRdpVersion, report.freeRdpVersion);
      if (report.freeRdpVersion === null)
        assert.equal(report.capabilities.connectCore, false);
      assert.deepEqual(processResourceBatchSnapshot(), before);
      assert.deepEqual(await readdir(runtimeRoot), []);
      t.diagnostic(
        JSON.stringify({
          foundation: report.freeRdpVersion === null,
          hostResourceBatch: true,
          connectCore: report.capabilities.connectCore,
          defaultResourceQueries: 0,
          runtimeEmpty: true,
        }),
      );
    } finally {
      await rm(runtimeRoot, { recursive: true, force: true, maxRetries: 3 });
    }
  },
);
