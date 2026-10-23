/** Refuse credential-bearing lab requests through wildcard/ambiguous Docker publication. */
export function assertLoopbackViewerPorts(bindings) {
  const published = bindings?.['47999/tcp'];
  if (
    !bindings ||
    typeof bindings !== 'object' ||
    Array.isArray(bindings) ||
    Object.keys(bindings).length !== 1 ||
    !Array.isArray(published) ||
    published.length !== 1 ||
    published[0]?.HostIp !== '127.0.0.1' ||
    published[0]?.HostPort !== '47998'
  )
    throw new Error(
      'Linux viewer requires exclusive host loopback publication',
    );
}
