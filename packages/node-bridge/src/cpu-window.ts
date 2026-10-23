import { ProcessSampleError } from './process-resident.js';

type CpuSample = { micros: number; startedNs: bigint; completedNs: bigint };

/** Fixed-storage conservative CPU-rate window for one unchanged owned child. */
export class CpuWindow {
  private baseline: CpuSample | undefined;
  private previous: CpuSample | undefined;
  private readonly minimumNs: bigint;

  constructor(
    private readonly maximumPercent: number,
    windowMs: number,
  ) {
    if (
      !Number.isSafeInteger(maximumPercent) ||
      maximumPercent < 1 ||
      maximumPercent > 65535 ||
      !Number.isSafeInteger(windowMs) ||
      windowMs < 1000 ||
      windowMs > 60000
    )
      throw new ProcessSampleError('PROCESS_SAMPLE_INVALID');
    this.minimumNs = BigInt(windowMs) * 1000000n;
  }

  observe(micros: number, startedNs: bigint, completedNs: bigint): boolean {
    if (
      !Number.isSafeInteger(micros) ||
      micros < 0 ||
      Object.is(micros, -0) ||
      typeof startedNs !== 'bigint' ||
      typeof completedNs !== 'bigint' ||
      startedNs < 0n ||
      completedNs < startedNs ||
      (this.previous &&
        (micros < this.previous.micros ||
          startedNs < this.previous.completedNs))
    )
      throw new ProcessSampleError('PROCESS_SAMPLE_INVALID');
    const sample = { micros, startedNs, completedNs };
    this.previous = sample;
    if (!this.baseline) {
      this.baseline = sample;
      return false;
    }
    const baseline = this.baseline;
    // A query may read its counter anywhere inside its start/close bracket.
    // Require a full interval between brackets; use the widest elapsed span
    // for enforcement, so helper latency cannot inflate the observed rate.
    if (startedNs - baseline.completedNs < this.minimumNs) return false;
    this.baseline = sample;
    return (
      BigInt(micros - baseline.micros) * 100000n >
      BigInt(this.maximumPercent) * (completedNs - baseline.startedNs)
    );
  }
}
