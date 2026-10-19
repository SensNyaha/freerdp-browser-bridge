import test from 'node:test';
import assert from 'node:assert/strict';
import { requireConnectedMemoryBreach } from '../../scripts/connected-memory-result.mjs';

test('synthetic connected RSS result requires the first global sample to belong to the connected worker', () => {
  const worker = {
    state: 'failed',
    totalResidentSamples: 1,
    residentSamples: 1,
    peakResidentBytes: 1024,
  };
  assert.doesNotThrow(() =>
    requireConnectedMemoryBreach(worker, 'WORKER_MEMORY_LIMIT'),
  );
  for (const patch of [
    { state: 'ready' },
    { state: 'closed' },
    { totalResidentSamples: 0 },
    { totalResidentSamples: 2 },
    { residentSamples: 0 },
    { residentSamples: 2 },
    { peakResidentBytes: 1 },
    { peakResidentBytes: NaN },
    { peakResidentBytes: Number.MAX_SAFE_INTEGER + 1 },
  ])
    assert.throws(
      () =>
        requireConnectedMemoryBreach(
          { ...worker, ...patch },
          'WORKER_MEMORY_LIMIT',
        ),
      { message: 'LAB_MEMORY_LIMIT_NOT_OBSERVED' },
    );
  for (const code of [
    undefined,
    'WORKER_CPU_LIMIT',
    'WORKER_RESOURCE_UNAVAILABLE',
    'WORKER_FAILED',
  ])
    assert.throws(() => requireConnectedMemoryBreach(worker, code), {
      message: 'LAB_MEMORY_LIMIT_NOT_OBSERVED',
    });
});
