import { assertLoopbackViewerPorts } from './linux-viewer-container.mjs';

export const linuxHtmlLabImage =
  'gcc@sha256:1a0bcc0c30351efce55d76fd419dc74aa4d449204e4d66cf86a0ee9bb95a9d61';
const invalid = () => new Error('LINUX_HTML_LAB_PROFILE_REFUSED');

/** The overall V1 rdp flag is intentionally false; require the concrete hooks. */
export function requireLinuxHtmlLabCapabilities(value) {
  if (
    !value ||
    ![
      'connectCore',
      'basicInput',
      'clipboardText',
      'clipboardRevoke',
      'clipboardHtml',
    ].every((key) => value[key] === true)
  )
    throw invalid();
}

export function linuxHtmlLabArguments(args) {
  if (!Array.isArray(args) || args.length < 4 || args.length > 6)
    throw invalid();
  const [container, prepared, fingerprint, owned, transport = 'auto', mode] =
    args;
  const document = /^--prepared-remote-document=([0-9a-f]{32})$/.exec(
    prepared ?? '',
  );
  if (
    !/^freerdp-bridge-linux-viewer-[0-9]+$/.test(container ?? '') ||
    !document ||
    !/^sha256:[0-9a-f]{64}$/.test(fingerprint ?? '') ||
    owned !== '--owned-os-clipboard' ||
    !['auto', 'framed-pipes'].includes(transport) ||
    (mode !== undefined &&
      !['--bootstrap-only', '--keep-owned-document'].includes(mode))
  )
    throw invalid();
  return {
    container,
    nonce: document[1],
    fingerprint,
    transport,
    bootstrapOnly: mode === '--bootstrap-only',
    keepDocument: mode === '--keep-owned-document',
  };
}

/** Validate the actual dedicated container before creating/sending credentials. */
export function requireLinuxHtmlLabContainer(value) {
  try {
    assertLoopbackViewerPorts(value?.HostConfig?.PortBindings);
    const mounts = value.Mounts,
      env = value.Config?.Env;
    if (
      !/^sha256:[0-9a-f]{64}$/.test(value.Image ?? '') ||
      !/^[0-9a-f]{64}$/.test(value.Id ?? '') ||
      value.Config?.Image !== linuxHtmlLabImage ||
      value.Config?.User !== '1000:1000' ||
      value.Config?.WorkingDir !== '/bridge/check-source' ||
      value.Config?.Labels?.['freerdp-bridge.html-acceptance'] !== '1' ||
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
      !env.includes('BRIDGE_TEST_BINARY_DIR=/bridge/source/build/bundled')
    )
      throw invalid();
    return {
      id: value.Id,
      image: value.Image,
      uid: 1000,
      volume: mounts[0].Name,
    };
  } catch {
    throw invalid();
  }
}
