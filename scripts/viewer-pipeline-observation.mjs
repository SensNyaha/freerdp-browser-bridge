const fields = [
  'rdpChecks',
  'paints',
  'encodedFrames',
  'encodeMeanUs',
  'encodeP95Us',
  'encodeMaxUs',
  'maxReadBatch',
  'maxReadBatchUs',
];

/** One awaited native query; unavailable evidence is never an all-zero sample. */
export async function readViewerPipelineObservation(worker) {
  try {
    // WorkerProcess owns capability admission and its existing request deadline.
    // Await settlement without a detached timeout, retry or polling loop.
    const reply = await worker.pipelineStats();
    const stats = Object.fromEntries(
      fields.map((field) => [field, reply[field]]),
    );
    if (
      Object.values(stats).some(
        (value) => !Number.isSafeInteger(value) || value < 0,
      ) ||
      stats.encodeMeanUs > stats.encodeMaxUs ||
      stats.encodeP95Us > stats.encodeMaxUs ||
      stats.maxReadBatch > stats.rdpChecks
    )
      return null;
    return stats;
  } catch {
    // Never retain native error details or turn unsupported/closed into success.
    return null;
  }
}
