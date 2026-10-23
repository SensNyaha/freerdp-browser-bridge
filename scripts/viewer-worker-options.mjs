import { resolve } from 'node:path';
import { loadWindowsNativeProfile } from './resource-lab-profile.mjs';

/** Explicit local native receipt; default bundled selection stays platform-specific. */
export async function viewerWorkerOptions(
  receipt,
  projectRoot,
  platform = process.platform,
) {
  const profile =
    receipt === undefined
      ? undefined
      : await loadWindowsNativeProfile(receipt, projectRoot, platform);
  return {
    options: {
      workerPath:
        profile?.workerPath ??
        resolve(
          projectRoot,
          'build/bundled/rdp-worker' + (platform === 'win32' ? '.exe' : ''),
        ),
      runtimeRoot: resolve(projectRoot, '.runtime/viewer-lab'),
    },
    profile,
  };
}
