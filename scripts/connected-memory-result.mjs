/** Accept only the first real RSS sample already observed while connected. */
export function requireConnectedMemoryBreach(worker, failureCode) {
  if (
    failureCode !== 'WORKER_MEMORY_LIMIT' ||
    worker.state !== 'failed' ||
    worker.totalResidentSamples !== 1 ||
    worker.residentSamples !== 1 ||
    !Number.isSafeInteger(worker.peakResidentBytes) ||
    worker.peakResidentBytes <= 1
  )
    throw new Error('LAB_MEMORY_LIMIT_NOT_OBSERVED');
}
