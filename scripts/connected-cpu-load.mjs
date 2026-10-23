/** Bounded local IPC load only; no RDP input or remote application action. */
export async function connectedCpuLoad(worker, getRdpState, getFailure) {
  if (
    worker.totalCpuSamples !== 1 ||
    worker.cpuSamples !== 1 ||
    worker.state !== 'ready' ||
    getRdpState() !== 'connected'
  )
    throw new Error('LAB_CPU_BASELINE_NOT_CONNECTED');
  let completedPings = 0;
  const until = performance.now() + 8000;
  while (worker.state === 'ready' && getFailure() === undefined) {
    if (getRdpState() !== 'connected' || performance.now() >= until)
      throw new Error('LAB_CPU_LIMIT_NOT_OBSERVED');
    const results = await Promise.allSettled(
      Array.from({ length: 16 }, () => worker.ping()),
    );
    completedPings += results.filter(
      (result) => result.status === 'fulfilled',
    ).length;
    if (results.some((result) => result.status === 'rejected')) break;
  }
  if (
    getFailure() !== 'WORKER_CPU_LIMIT' ||
    completedPings < 1 ||
    worker.cpuSamples < 2 ||
    worker.lastMicros <= worker.firstMicros
  )
    throw new Error('LAB_CPU_LIMIT_NOT_OBSERVED');
  return completedPings;
}
