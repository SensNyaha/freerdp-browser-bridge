// Classify only the named code-owned lab result; never forward raw diagnostics.
export function requireLabCoreResult(mode, result) {
  const valid =
    mode === 'strict'
      ? result?.state === 'failed' &&
        result.error === 'RDP_CERTIFICATE_REJECTED'
      : mode === 'inspect'
        ? result?.state === 'inspected'
        : ['connect', 'memory'].includes(mode) &&
          result?.state === 'connected' &&
          result.error === 'NONE';
  if (!valid) throw new Error('LAB_ACTIVATION_MISMATCH');
}
