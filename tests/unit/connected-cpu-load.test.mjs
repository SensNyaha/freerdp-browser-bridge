import test from 'node:test';
import assert from 'node:assert/strict';
import { connectedCpuLoad } from '../../scripts/connected-cpu-load.mjs';

test('synthetic connected CPU driver bounds 16 valid flights and joins them before accepting exact native failure', async () => {
  let active = 0,
    peak = 0,
    issued = 0,
    failure;
  const worker = {
    state: 'ready',
    totalCpuSamples: 1,
    cpuSamples: 1,
    firstMicros: 0,
    lastMicros: 0,
    async ping() {
      ++issued;
      ++active;
      peak = Math.max(peak, active);
      await new Promise((done) => setImmediate(done));
      --active;
      if (issued === 16 && active === 0) {
        worker.cpuSamples = 2;
        worker.lastMicros = 100000;
        failure = 'WORKER_CPU_LIMIT';
        worker.state = 'failed';
      }
    },
  };
  assert.equal(
    await connectedCpuLoad(
      worker,
      () => 'connected',
      () => failure,
    ),
    16,
  );
  assert.equal(peak, 16);
  assert.equal(active, 0);
});

test('synthetic connected CPU driver refuses noninitial/nonconnected baseline before generating load', async () => {
  for (const patch of [
    { totalCpuSamples: 2 },
    { cpuSamples: 0 },
    { state: 'failed' },
    { rdp: 'connecting' },
  ]) {
    let issued = 0;
    const worker = {
      state: 'ready',
      totalCpuSamples: 1,
      cpuSamples: 1,
      ...patch,
      ping() {
        ++issued;
      },
    };
    await assert.rejects(
      connectedCpuLoad(
        worker,
        () => patch.rdp ?? 'connected',
        () => undefined,
      ),
      { message: 'LAB_CPU_BASELINE_NOT_CONNECTED' },
    );
    assert.equal(issued, 0);
  }
});

test('synthetic connected CPU driver cannot accept a different failure or non-growing counter', async () => {
  for (const code of [
    'WORKER_MEMORY_LIMIT',
    'WORKER_RESOURCE_UNAVAILABLE',
    'WORKER_CPU_LIMIT',
  ]) {
    const worker = {
      state: 'ready',
      totalCpuSamples: 1,
      cpuSamples: 1,
      firstMicros: 0,
      lastMicros: 0,
      async ping() {
        worker.state = 'failed';
        worker.cpuSamples = 2;
      },
    };
    let reads = 0;
    await assert.rejects(
      connectedCpuLoad(
        worker,
        () => 'connected',
        () => (reads++ === 0 ? undefined : code),
      ),
      { message: 'LAB_CPU_LIMIT_NOT_OBSERVED' },
    );
  }
});

test('synthetic connected CPU driver enforces its finite observation deadline before another batch', async (t) => {
  let reads = 0,
    issued = 0;
  t.mock.method(performance, 'now', () => (reads++ === 0 ? 0 : 9000));
  const worker = {
    state: 'ready',
    totalCpuSamples: 1,
    cpuSamples: 1,
    ping() {
      ++issued;
    },
  };
  await assert.rejects(
    connectedCpuLoad(
      worker,
      () => 'connected',
      () => undefined,
    ),
    { message: 'LAB_CPU_LIMIT_NOT_OBSERVED' },
  );
  assert.equal(issued, 0);
});
