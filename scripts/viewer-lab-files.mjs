/** Fixed owned test definitions; never accept caller-selected paths or ports. */
export function ownedLabDefinition(profile = 'owned-container') {
  if (profile === 'owned-container')
    return {
      container: 'freerdp-bridge-owned-xrdp',
      image: 'freerdp-bridge-xrdp-lab:397',
      dockerfile: 'tests/fixtures/xrdp-lab/Dockerfile',
      stem: 'xrdp-container-lab',
      receipt: 'owned-xrdp-lab.receipt.json',
      port: 3391,
      label: '397',
    };
  if (profile === 'owned-unicode-container')
    return {
      container: 'freerdp-bridge-owned-xrdp-unicode',
      image: 'freerdp-bridge-xrdp-unicode-lab:404',
      dockerfile: 'tests/fixtures/xrdp-lab/Dockerfile.unicode',
      stem: 'xrdp-unicode-lab',
      receipt: 'owned-xrdp-unicode-lab.receipt.json',
      port: 3392,
      label: '404',
    };
  throw new Error('LAB_PROFILE_REFUSED');
}

/** Nonsecret local-test selector; never selects production credentials/targets. */
export function viewerLabFiles(profile) {
  if (profile === undefined)
    return {
      config: '.local-tests/xrdp-lab.json',
      credentials: '.local-tests/xrdp-lab.secrets.json',
      ownedContainer: false,
    };
  const definition = ownedLabDefinition(profile);
  return {
    config: '.local-tests/' + definition.stem + '.json',
    credentials: '.local-tests/' + definition.stem + '.secrets.json',
    ownedContainer: true,
  };
}

export function requireOwnedLabTarget(target, profile = 'owned-container') {
  const definition = ownedLabDefinition(profile);
  if (
    !target ||
    target.host !== '127.0.0.1' ||
    target.port !== definition.port ||
    target.credentialFile !== definition.stem + '.secrets.json'
  )
    throw new Error('LAB_OWNED_TARGET_REFUSED');
}
