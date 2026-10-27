import { assertLoopbackViewerPorts } from './linux-viewer-container.mjs';

export const linuxImageLabImage =
  'gcc@sha256:1a0bcc0c30351efce55d76fd419dc74aa4d449204e4d66cf86a0ee9bb95a9d61';
const invalid = () => new Error('LINUX_IMAGE_LAB_PROFILE_REFUSED');

/** The overall V1 rdp flag is intentionally false; require the concrete hooks. */
export function requireLinuxImageLabCapabilities(value) {
  if (
    !value ||
    ![
      'connectCore',
      'basicInput',
      'clipboardText',
      'clipboardRevoke',
      'clipboardImage',
    ].every((key) => value[key] === true)
  )
    throw invalid();
}

export function linuxImageLabArguments(args) {
  if (!Array.isArray(args) || args.length < 4 || args.length > 6)
    throw invalid();
  const [container, prepared, fingerprint, owned, transport = 'auto', mode] =
    args;
  const document = /^--prepared-remote-document=([0-9a-f]{32})$/.exec(
    prepared ?? '',
  );
  if (
    !/^freerdp-bridge-linux-image-viewer-[0-9]+$/.test(container ?? '') ||
    !document ||
    !/^sha256:[0-9a-f]{64}$/.test(fingerprint ?? '') ||
    owned !== '--owned-os-clipboard' ||
    !['auto', 'framed-pipes'].includes(transport) ||
    (mode !== undefined &&
      !['--bootstrap-only', '--keep-remote-document'].includes(mode))
  )
    throw invalid();
  return {
    container,
    nonce: document[1],
    fingerprint,
    transport,
    bootstrapOnly: mode === '--bootstrap-only',
    keepDocument: mode === '--keep-remote-document',
  };
}

/** Verify the concrete native build before loading lab credentials. */
export function requireLinuxImageLabBuild(value, transport, container) {
  if (
    !value ||
    !['auto', 'framed-pipes'].includes(transport) ||
    value.os !== 'linux' ||
    value.arch !== 'x64' ||
    value.freeRdpVersion !== '3.32.1' ||
    value.targetFreeRdpVersion !== '3.32.1' ||
    value.transport !==
      (transport === 'auto' ? 'unix-seqpacket-rws1' : 'framed-pipes') ||
    (container?.productVersion !== undefined &&
      (container.productVersion !== '0.5.0' ||
        value.bridgeVersion !== container.productVersion))
  )
    throw invalid();
}

/** Validate the actual dedicated container before creating/sending credentials. */
export function requireLinuxImageLabContainer(value) {
  try {
    assertLoopbackViewerPorts(value?.HostConfig?.PortBindings);
    const mounts = value.Mounts,
      env = value.Config?.Env,
      productVersion =
        value.Config?.Labels?.['freerdp-bridge.image-product-version'];
    const profile =
      productVersion === undefined
        ? {
            source: '/bridge/image-linux-node-source',
            binary: '/bridge/image-handoff-source-gcc83/build/gcc83',
          }
        : productVersion === '0.5.0'
          ? {
              source: '/bridge/image05-release-source-v1',
              binary:
                '/bridge/image05-release-source-v1/build/native-stage-release/bin',
            }
          : undefined;
    if (
      !/^sha256:[0-9a-f]{64}$/.test(value.Image ?? '') ||
      !/^[0-9a-f]{64}$/.test(value.Id ?? '') ||
      value.Config?.Image !== linuxImageLabImage ||
      value.Config?.User !== '1000:1000' ||
      !profile ||
      value.Config?.WorkingDir !== profile.source ||
      value.Config?.Labels?.['freerdp-bridge.image-acceptance'] !== '1' ||
      value.HostConfig.Privileged !== false ||
      value.HostConfig.ReadonlyRootfs !== true ||
      !value.HostConfig.CapDrop?.includes('ALL') ||
      !Array.isArray(mounts) ||
      mounts.length !== 1 ||
      mounts[0].Type !== 'volume' ||
      mounts[0].Name !== 'bridge-runtime-recovery-gcc83-sdk' ||
      mounts[0].Destination !== '/bridge' ||
      mounts[0].RW !== false ||
      !Array.isArray(env) ||
      env.length > 64 ||
      env.some(
        (item) =>
          typeof item !== 'string' ||
          item.length > 8192 ||
          /^(NODE_OPTIONS|LD_PRELOAD)=/.test(item),
      ) ||
      env
        .filter((item) => item.startsWith('BRIDGE_TEST_BINARY_DIR='))
        .join() !==
        'BRIDGE_TEST_BINARY_DIR=' + profile.binary
    )
      throw invalid();
    return {
      id: value.Id,
      image: value.Image,
      uid: 1000,
      volume: mounts[0].Name,
      ...(productVersion === undefined ? {} : { productVersion }),
    };
  } catch {
    throw invalid();
  }
}
