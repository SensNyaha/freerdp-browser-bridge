import { fail, repositoryFor } from './manifest.mjs';

export function publicTarballUrl(name, version) {
  const suffix = name.replace('@freerdp-bridge/', '');
  if (
    name !== '@freerdp-bridge/' + suffix ||
    !/^0\.2\.(?:0|[1-9][0-9]{0,5})$/.test(version)
  )
    fail('DELIVERY_LOCK_PACKAGE_INVALID');
  repositoryFor(suffix);
  // Canonical URLs verified against public 0.2.2 registry metadata. The
  // accepted SHA-512 remains the authority when the future version is fetched.
  return (
    'https://registry.npmjs.org/' +
    name +
    '/-/' +
    suffix +
    '-' +
    version +
    '.tgz'
  );
}

export function publicLock(input, intended, records, self) {
  if (
    !input ||
    input.lockfileVersion !== 3 ||
    !input.packages ||
    typeof input.packages !== 'object' ||
    Object.keys(input.packages).length > 4096 ||
    !intended.private ||
    intended.dependencies?.[self] !== 'file:./package' ||
    JSON.stringify(intended.workspaces) !== '["package"]' ||
    records.get(self)?.version !== intended.version
  )
    fail('DELIVERY_LOCK_INVALID');
  const lock = structuredClone(input),
    root = lock.packages[''];
  if (
    !root ||
    input.name !== intended.name ||
    input.version !== intended.version
  )
    fail('DELIVERY_LOCK_INVALID');
  for (const field of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
  ]) {
    if (intended[field]) root[field] = structuredClone(intended[field]);
    else delete root[field];
  }
  delete lock.overrides;
  delete root.overrides;
  let linked = false,
    rewritten = 0;
  for (const [path, item] of Object.entries(lock.packages)) {
    if (!item || typeof item !== 'object') fail('DELIVERY_LOCK_INVALID');
    const match = path.match(
      /(?:^|\/)node_modules\/(@freerdp-bridge\/[a-z0-9-]+)$/,
    );
    if (match) {
      if (
        match[1] === self &&
        item.link === true &&
        item.resolved === 'package'
      )
        linked = true;
      else {
        const accepted = records.get(match[1]);
        if (
          !accepted ||
          item.link ||
          item.version !== intended.version ||
          item.version !== accepted.version ||
          item.integrity !== accepted.integrity
        )
          fail('DELIVERY_LOCK_BYTES_DIFFER');
        item.resolved = publicTarballUrl(accepted.name, accepted.version);
        rewritten++;
      }
    }
    if (item.resolved !== undefined) {
      if (item.link === true) {
        if (path !== 'node_modules/' + self || item.resolved !== 'package')
          fail('DELIVERY_LOCK_LOCAL_PATH');
      } else {
        let url;
        try {
          url = new URL(item.resolved);
        } catch {
          fail('DELIVERY_LOCK_LOCAL_PATH');
        }
        if (
          url.origin !== 'https://registry.npmjs.org' ||
          url.username ||
          url.password ||
          url.search ||
          url.hash
        )
          fail('DELIVERY_LOCK_LOCAL_PATH');
      }
    }
    for (const field of [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
      'peerDependencies',
    ]) {
      for (const [name, value] of Object.entries(item[field] ?? {})) {
        if (
          typeof value !== 'string' ||
          /^(?:file:|link:|workspace:|git[+:]|https?:)/.test(value)
        ) {
          if (
            !(
              path === '' &&
              field === 'dependencies' &&
              name === self &&
              value === 'file:./package'
            )
          )
            fail('DELIVERY_LOCK_LOCAL_PATH');
        }
        if (
          name.startsWith('@freerdp-bridge/') &&
          value !== intended.version &&
          !(
            path === '' &&
            field === 'dependencies' &&
            name === self &&
            value === 'file:./package'
          )
        )
          fail('DELIVERY_LOCK_VERSION_MISMATCH');
      }
    }
  }
  if (
    !linked ||
    !rewritten ||
    lock.packages.package?.name !== self ||
    lock.packages.package?.version !== intended.version
  )
    fail('DELIVERY_LOCK_INVALID');
  return lock;
}
