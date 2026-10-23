const invalid = () => {
  throw new Error('STANDALONE_PRODUCTION_LOCK_INVALID');
};
export function standaloneProductionManifest(lock, version, platform) {
  if (
    !['win32-x64', 'linux-x64-gnu'].includes(platform) ||
    !lock ||
    lock.lockfileVersion !== 3 ||
    lock.version !== version ||
    lock.name !== '@freerdp-bridge/standalone' ||
    !lock.packages ||
    Object.keys(lock.packages).length > 256 ||
    !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(version)
  )
    invalid();
  const root = lock.packages[''];
  const required = [
    '@freerdp-bridge/api',
    '@freerdp-bridge/runtime-' + platform,
    '@sinclair/typebox',
    'fastify',
    'jose',
  ].sort();
  if (
    !root ||
    root.name !== lock.name ||
    root.version !== version ||
    root.license !== 'MIT' ||
    JSON.stringify(Object.keys(root.dependencies ?? {}).sort()) !==
      JSON.stringify(required) ||
    root.engines?.node !== '>=24 <25'
  )
    invalid();
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (path === '') continue;
    if (
      !path.startsWith('node_modules/') ||
      path.length > 220 ||
      path.split('/').some((part) => !part || part === '..' || part === '.') ||
      /[\\:\x00-\x1f]/.test(path) ||
      entry.dev ||
      entry.link ||
      !/^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[a-zA-Z0-9.-]+)?$/.test(
        entry.version,
      ) ||
      typeof entry.resolved !== 'string' ||
      !entry.resolved.startsWith('https://registry.npmjs.org/') ||
      new URL(entry.resolved).origin !== 'https://registry.npmjs.org' ||
      !/^sha512-[A-Za-z0-9+/]{86}==$/.test(entry.integrity)
    )
      invalid();
    if (
      path.startsWith('node_modules/@freerdp-bridge/') &&
      entry.version !== version
    )
      invalid();
  }
  for (const [name, dependencyVersion] of Object.entries(root.dependencies)) {
    if (
      !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(
        dependencyVersion,
      ) ||
      lock.packages['node_modules/' + name]?.version !== dependencyVersion
    )
      invalid();
  }
  return {
    name: root.name,
    version,
    private: true,
    type: 'module',
    license: root.license,
    engines: structuredClone(root.engines),
    dependencies: structuredClone(root.dependencies),
  };
}
