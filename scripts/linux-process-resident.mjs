import {
  linuxResidentReceipt as receipt,
  linuxWorkerResidentBytes as sample,
  ProcessSampleError,
} from '../packages/node-bridge/dist/index.js';

export function linuxResidentReceipt(text) {
  try {
    return receipt(text);
  } catch {
    throw new Error('LAB_PROCESS_SAMPLE_INVALID');
  }
}

// Sampling only; process ownership/liveness remains the caller's responsibility.
export async function linuxWorkerResidentBytes(pid) {
  try {
    return await sample(pid);
  } catch (error) {
    throw new Error(
      error instanceof ProcessSampleError &&
      error.code === 'PROCESS_SAMPLE_INVALID'
        ? 'LAB_PROCESS_SAMPLE_INVALID'
        : 'LAB_PROCESS_SAMPLE_UNAVAILABLE',
    );
  }
}
