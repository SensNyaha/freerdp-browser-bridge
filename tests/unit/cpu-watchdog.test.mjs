import test from 'node:test';
import assert from 'node:assert/strict';
import { CpuWindow } from '../../packages/node-bridge/dist/cpu-window.js';
import {
  WorkerProcess,
  ProcessSampleError,
  SessionError,
} from '../../packages/node-bridge/dist/index.js';

const ms = (value) => BigInt(value) * 1000000n;
test('CPU window accepts zero baseline, exact cap and a strictly excessive next window', () => {
  const window = new CpuWindow(50, 1000);
  assert.equal(window.observe(0, 0n, 0n), false);
  assert.equal(window.observe(500000, ms(1000), ms(1000)), false);
  assert.equal(window.observe(1000001, ms(2000), ms(2000)), true);
});

test('CPU window accumulates short polls and counts 100 percent per logical CPU', () => {
  const window = new CpuWindow(200, 1000);
  assert.equal(window.observe(0, 0n, 0n), false);
  assert.equal(window.observe(600000, ms(250), ms(250)), false);
  assert.equal(window.observe(1200000, ms(500), ms(500)), false);
  assert.equal(window.observe(2000001, ms(1000), ms(1000)), true);
});

test('CPU window uses query brackets conservatively instead of inflating rate with helper latency', () => {
  const window = new CpuWindow(50, 1000);
  assert.equal(window.observe(0, 0n, ms(1000)), false);
  // Only 500 ms between brackets: no evaluation despite 2 seconds end-to-end.
  assert.equal(window.observe(1000000, ms(1500), ms(2000)), false);
  // The actual read instants are unknown; the widest span bounds the rate below.
  assert.equal(window.observe(1500000, ms(2500), ms(3500)), false);
});

test('CPU window compares large exact counters without multiplying Number values', () => {
  const window = new CpuWindow(100, 1000);
  const initial = Number.MAX_SAFE_INTEGER - 1000001;
  assert.equal(window.observe(initial, 0n, 0n), false);
  assert.equal(
    window.observe(Number.MAX_SAFE_INTEGER, ms(1000), ms(1000)),
    true,
  );
});

test('CPU window refuses counter regression and invalid or overlapping clock brackets', () => {
  for (const args of [
    [-1, 0n, 0n],
    [-0, 0n, 0n],
    [NaN, 0n, 0n],
    [0.5, 0n, 0n],
    [Number.MAX_SAFE_INTEGER + 1, 0n, 0n],
    [0, 0, 0n],
    [0, -1n, 0n],
    [0, 1n, 0n],
  ])
    assert.throws(() => new CpuWindow(100, 1000).observe(...args), {
      code: 'PROCESS_SAMPLE_INVALID',
    });
  for (const next of [
    [0, ms(1000), ms(1001)],
    [2, ms(100), ms(101)],
  ]) {
    const window = new CpuWindow(100, 1000);
    window.observe(1, ms(100), ms(200));
    assert.throws(
      () => window.observe(...next),
      (error) => {
        assert.ok(error instanceof ProcessSampleError);
        assert.equal(error.message, 'PROCESS_SAMPLE_INVALID');
        assert.equal(error.cause, undefined);
        return true;
      },
    );
  }
});

test('CPU host options require a bounded budget/window/poll and refuse unsupported platforms before startup', async () => {
  const paths = { workerPath: 'unused', runtimeRoot: 'unused' };
  for (const maxCpuPercent of [0, -1, 1.5, 65536, NaN, Infinity, null, '100'])
    assert.throws(() => new WorkerProcess({ ...paths, maxCpuPercent }), {
      code: 'INVALID_OPTIONS',
    });
  for (const [key, invalid] of [
    ['cpuPollIntervalMs', [0, 99, 60001, 1.5, NaN]],
    ['cpuWindowMs', [0, 999, 60001, 1.5, NaN]],
  ]) {
    assert.throws(() => new WorkerProcess({ ...paths, [key]: 1000 }), {
      code: 'INVALID_OPTIONS',
    });
    for (const value of invalid)
      assert.throws(
        () => new WorkerProcess({ ...paths, maxCpuPercent: 100, [key]: value }),
        { code: 'INVALID_OPTIONS' },
      );
  }
  for (const args of [
    [0, 1000],
    [100, 999],
    [65536, 1000],
    [100, 60001],
  ])
    assert.throws(() => new CpuWindow(...args), {
      code: 'PROCESS_SAMPLE_INVALID',
    });
  if (process.platform !== 'win32') {
    assert.throws(() => new WorkerProcess({ ...paths, maxCpuPercent: 100 }), {
      code: 'RESOURCE_WATCHDOG_UNSUPPORTED',
    });
    return;
  }
  for (const maxCpuPercent of [1, 65535]) {
    const worker = new WorkerProcess({
      ...paths,
      maxCpuPercent,
      cpuPollIntervalMs: 100,
      cpuWindowMs: 60000,
    });
    assert.equal(worker.pid, undefined);
    await worker.close();
  }
});

test('CPU policy has a fixed nonretryable public failure', () => {
  const error = new SessionError('WORKER_CPU_LIMIT');
  assert.equal(error.statusCode, 503);
  assert.equal(error.failure.retryable, false);
  assert.equal(error.failure.message, 'Session worker CPU policy exceeded');
});
