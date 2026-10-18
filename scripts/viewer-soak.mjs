import {
  processResidentReceipt as receipt,
  windowsWorkerResidentBytes as sample,
  ProcessSampleError,
} from '../packages/node-bridge/dist/index.js';

export const soakDurationMs = 30 * 60 * 1000;
export const soakIntervalMs = 30 * 1000;
export const workerResidentLimitBytes = 256 * 1024 * 1024;

/** Bounded native working-set receipt, not private allocation or process CPU time. */
export function processResidentReceipt(text) {
  try {
    return receipt(text);
  } catch {
    throw new Error('LAB_PROCESS_SAMPLE_INVALID');
  }
}

export async function windowsWorkerResidentBytes(pid, workerPath) {
  try {
    return await sample(pid, workerPath);
  } catch (error) {
    throw new Error(
      error instanceof ProcessSampleError &&
      error.code === 'PROCESS_SAMPLE_INVALID'
        ? 'LAB_PROCESS_SAMPLE_INVALID'
        : 'LAB_PROCESS_SAMPLE_UNAVAILABLE',
    );
  }
}

/** Fixed aggregate only: no frame, packet, session, process or sample history. */
export class ViewerSoak {
  #previous;
  #stats = {
    observations: 0,
    elapsedMs: 0,
    maxQueuedFrames: 0,
    maxQueuedBytes: 0,
    maxDecoderQueue: 0,
    maxBufferedBytes: 0,
    maxWorkerResidentBytes: 0,
    maxNodeResidentBytes: 0,
    maxDecodeP95Ms: 0,
    frames: 0,
    bytes: 0,
    workerMemoryBudgetPassed: true,
  };
  observe(elapsedMs, view, workerResidentBytes, nodeResidentBytes, credit) {
    const integers = [
      elapsedMs,
      view.frames,
      view.bytes,
      view.queuedFrames,
      view.queuedBytes,
      view.decoderQueueSize,
      view.mediaBufferedBytes,
      workerResidentBytes,
      nodeResidentBytes,
      credit,
    ];
    if (
      this.#stats.observations >= 64 ||
      integers.some((value) => !Number.isSafeInteger(value) || value < 0) ||
      !Number.isFinite(view.decodeP95Ms) ||
      view.decodeP95Ms < 0 ||
      view.closed ||
      view.error ||
      view.width !== 1920 ||
      view.height !== 1080 ||
      !['h264', 'jpeg'].includes(view.codec) ||
      view.queuedFrames > 5 ||
      view.queuedBytes > 8 * 1024 * 1024 + 8192 ||
      view.decoderQueueSize > 1 ||
      credit > 1 ||
      view.mediaBufferedBytes > 16384 ||
      workerResidentBytes === 0 ||
      nodeResidentBytes === 0 ||
      (this.#previous &&
        (elapsedMs <= this.#previous.elapsedMs ||
          view.frames < this.#previous.frames ||
          view.bytes < this.#previous.bytes ||
          view.codec !== this.#previous.codec))
    )
      throw new Error('LAB_SOAK_INVARIANT_FAILED');
    this.#previous = {
      elapsedMs,
      frames: view.frames,
      bytes: view.bytes,
      codec: view.codec,
    };
    const stats = this.#stats;
    ++stats.observations;
    stats.elapsedMs = elapsedMs;
    stats.frames = view.frames;
    stats.bytes = view.bytes;
    for (const [name, value] of [
      ['maxQueuedFrames', view.queuedFrames],
      ['maxQueuedBytes', view.queuedBytes],
      ['maxDecoderQueue', view.decoderQueueSize],
      ['maxBufferedBytes', view.mediaBufferedBytes],
      ['maxWorkerResidentBytes', workerResidentBytes],
      ['maxNodeResidentBytes', nodeResidentBytes],
      ['maxDecodeP95Ms', view.decodeP95Ms],
    ])
      stats[name] = Math.max(stats[name], value);
    stats.workerMemoryBudgetPassed &&=
      workerResidentBytes <= workerResidentLimitBytes;
  }
  snapshot() {
    return { ...this.#stats };
  }
}

export function mediaCredit(metrics, codec) {
  const matches = metrics
    .split('\n')
    .filter((line) => line.startsWith('bridge_media_frames_in_flight{'));
  const prefix = 'bridge_media_frames_in_flight{codec="' + codec + '"} ';
  const selected = matches.filter((line) => line.startsWith(prefix));
  if (selected.length !== 1 || !/^[01]$/.test(selected[0].slice(prefix.length)))
    throw new Error('LAB_SOAK_CREDIT_INVALID');
  return Number(selected[0].slice(prefix.length));
}
