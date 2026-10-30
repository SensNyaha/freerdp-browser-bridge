// Controlled source-build resolver only. No installed-package/integrity acceptance claim.
export * from '../../apps/bridge-api/dist/plugin.js';
import { resolve } from 'node:path';
export async function resolveNativeRuntime({ runtimeRoot }) {
  if (!process.env.BRIDGE_TEST_BINARY_DIR)
    throw new Error('OWNED_INVENTORY_FIXTURE_REFUSED');
  return {
    workerPath: resolve(
      process.env.BRIDGE_TEST_BINARY_DIR,
      'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
    ),
    runtimeRoot,
    requestTimeoutMs: 5000,
  };
}
