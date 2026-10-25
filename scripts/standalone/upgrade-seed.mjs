import { isReleaseVersion } from '../github-delivery/manifest.mjs';

/** An explicit predecessor is required at a new minor boundary. */
export function standaloneUpgradeSeed(version) {
  if (!isReleaseVersion(version))
    throw new Error('STANDALONE_RELEASE_VERSION_INVALID');
  const [, minor, patch] = version.split('.').map(Number);
  if (minor < 2 || (minor === 2 && patch < 5)) return undefined;
  if (minor === 3 && patch === 0) return { version: '0.2.5', ref: 'v0.2.5' };
  if (patch === 0) throw new Error('STANDALONE_RELEASE_UPGRADE_SEED_REQUIRED');
  return {
    version: `0.${minor}.${patch - 1}`,
    ref:
      minor === 2 && patch === 5
        ? 'de46cea5776be19971716117b1c37dbf46012464'
        : `v0.${minor}.${patch - 1}`,
  };
}
