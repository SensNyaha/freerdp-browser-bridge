/** Nonsecret local-test selector; never selects production credentials/targets. */
export function viewerLabFiles(profile) {
  if (profile === undefined)
    return {
      config: '.local-tests/xrdp-lab.json',
      credentials: '.local-tests/xrdp-lab.secrets.json',
      ownedContainer: false,
    };
  if (profile !== 'owned-container') throw new Error('LAB_PROFILE_REFUSED');
  return {
    config: '.local-tests/xrdp-container-lab.json',
    credentials: '.local-tests/xrdp-container-lab.secrets.json',
    ownedContainer: true,
  };
}

export function requireOwnedLabTarget(target) {
  if (
    !target ||
    target.host !== '127.0.0.1' ||
    target.port !== 3391 ||
    target.credentialFile !== 'xrdp-container-lab.secrets.json'
  )
    throw new Error('LAB_OWNED_TARGET_REFUSED');
}
