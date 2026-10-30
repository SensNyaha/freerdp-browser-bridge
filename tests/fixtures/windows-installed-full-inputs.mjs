// Admission and private control for the owned Windows installed-service test.
// This module never installs, mounts, starts a service or accepts a certificate.
const refuse = () => {
  throw new Error('OWNED_INSTALLED_INPUT_REFUSED');
};

export function windowsInstalledRuntimeComponent(names) {
  if (
    !Array.isArray(names) ||
    names.length !== 2 ||
    names.filter((name) => name === '.bridge-service.lock').length !== 1
  )
    refuse();
  const component = names.find((name) => name !== '.bridge-service.lock');
  // Native RuntimeOwner.id and the HTTP session ID are independent UUIDs.
  if (
    typeof component !== 'string' ||
    !/^worker-[0-9a-f]{32}-1-[0-9a-f]{32}$/.test(component)
  )
    refuse();
  return component;
}

export function requireWindowsInstalledCi(platform, argv, environment) {
  if (
    platform !== 'win32' ||
    environment?.GITHUB_ACTIONS !== 'true' ||
    environment?.RUNNER_OS !== 'Windows' ||
    !Array.isArray(argv) ||
    argv.length !== 1 ||
    argv[0] !== '--owned-windows-msi-full'
  )
    refuse();
}

export function windowsInstalledVersion(version) {
  if (
    typeof version !== 'string' ||
    !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(version) ||
    version.length > 32 ||
    version
      .split('.')
      .some((part, index) => Number(part) > (index < 2 ? 255 : 65535))
  )
    refuse();
  return version;
}

/** Select an exact stable public MSI; reject ambiguous assets and other repos. */
export function windowsInstalledRelease(release, version) {
  windowsInstalledVersion(version);
  if (
    !release ||
    typeof release !== 'object' ||
    !Number.isSafeInteger(release.id) ||
    release.id < 1 ||
    release.tag_name !== 'v' + version ||
    release.draft !== false ||
    release.prerelease !== false ||
    !Array.isArray(release.assets) ||
    release.assets.length > 32
  )
    refuse();
  const name = `freerdp-bridge-${version}-win32-x64.msi`;
  const matches = release.assets.filter((asset) => asset?.name === name);
  if (matches.length !== 1) refuse();
  const asset = matches[0];
  const url = `https://github.com/SensNyaha/freerdp-browser-bridge/releases/download/v${version}/${name}`;
  if (
    !Number.isSafeInteger(asset.id) ||
    asset.id < 1 ||
    asset.state !== 'uploaded' ||
    !Number.isSafeInteger(asset.size) ||
    asset.size < 1 ||
    asset.size > 536870912 ||
    typeof asset.digest !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/.test(asset.digest) ||
    asset.browser_download_url !== url
  )
    refuse();
  return {
    version,
    releaseId: release.id,
    assetId: asset.id,
    name,
    bytes: asset.size,
    sha256: asset.digest.slice(7),
    url,
  };
}

/** One bounded record at a time, no growing buffer/queue or raw input logging. */
export async function* windowsInstalledPrivateRecords(stream) {
  const storage = Buffer.alloc(32768);
  let used = 0,
    records = 0;
  try {
    for await (const chunk of stream) {
      if (!(chunk instanceof Uint8Array)) refuse();
      try {
        if (chunk.byteLength > 65536) refuse();
        for (let index = 0; index < chunk.byteLength; index++) {
          const byte = chunk[index];
          chunk[index] = 0;
          if (byte !== 10) {
            if (used === storage.length) refuse();
            storage[used++] = byte;
            continue;
          }
          if (!used || ++records > 64) refuse();
          let record;
          try {
            record = JSON.parse(
              new TextDecoder('utf8', { fatal: true }).decode(
                storage.subarray(0, used),
              ),
            );
          } catch {
            refuse();
          } finally {
            storage.fill(0, 0, used);
            used = 0;
          }
          if (
            !record ||
            typeof record !== 'object' ||
            Array.isArray(record) ||
            Object.keys(record).length > 32
          )
            refuse();
          yield record;
        }
      } finally {
        chunk.fill(0);
      }
    }
    if (used || !records) refuse();
  } finally {
    storage.fill(0);
  }
}

export function windowsInstalledBootstrap(value, machineName) {
  const keys =
    'credentials,fingerprint,id,msiSha256,proofPath,root,runtimeArchivePath,runtimePackageRoot,userSid,version,workerSha256';
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== keys ||
    typeof value.id !== 'string' ||
    !/^[0-9a-f]{32}$/.test(value.id) ||
    typeof machineName !== 'string' ||
    !/^[A-Za-z0-9-]{1,63}$/.test(machineName) ||
    typeof value.fingerprint !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/.test(value.fingerprint) ||
    typeof value.userSid !== 'string' ||
    !/^S-1-5-21-[0-9]{1,10}-[0-9]{1,10}-[0-9]{1,10}-[0-9]{1,10}$/.test(
      value.userSid,
    ) ||
    typeof value.msiSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.msiSha256) ||
    typeof value.workerSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.workerSha256) ||
    ['root', 'proofPath', 'runtimePackageRoot', 'runtimeArchivePath'].some(
      (key) =>
        typeof value[key] !== 'string' ||
        value[key].length < 1 ||
        value[key].length > 4096 ||
        value[key].includes('\0'),
    ) ||
    !value.credentials ||
    typeof value.credentials !== 'object' ||
    Array.isArray(value.credentials) ||
    Object.keys(value.credentials).sort().join(',') !==
      'domain,password,username' ||
    value.credentials.domain !== machineName ||
    value.credentials.username !== 'bridgefull_' + value.id.slice(0, 8) ||
    typeof value.credentials.password !== 'string' ||
    !/^[\x21-\x7e]{32,128}$/.test(value.credentials.password)
  )
    refuse();
  windowsInstalledVersion(value.version);
  return value;
}
