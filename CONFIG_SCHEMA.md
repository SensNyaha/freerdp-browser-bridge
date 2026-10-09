# Session configuration contract

This is a normative logical schema. Implement it with TypeBox/JSON Schema in Node and generate corresponding native enums/validation where practical.

Current release scope follows [ADR-011](docs/adr/ADR-011-single-display-100-percent.md):
one primary monitor, desktop/device scale 100%, existing orientation 0. Broader
display fields in the preserved blueprint below are not required implementation
or acceptance work for this release. Unsupported values remain explicit errors;
browser CSS presentation is independent of RDP scaling.

```ts
type SessionCreate = {
  target: {
    host: string;
    port?: number;              // default 3389
    serverName?: string;        // certificate/SPN override, admin-controlled
    preferIPv6?: boolean;
    forceIpVersion?: 4 | 6 | null;
  };
  auth: {
    username?: string;
    domain?: string;
    password?: string;          // accepted over TLS API, never logged/persisted by default
    mode?: 'auto' | 'password' | 'smartcard' | 'restricted-admin';
    passwordHash?: string;      // only when restricted-admin policy allows it
  };
  gateway?: {
    enabled: boolean;
    host?: string;
    port?: number;
    transport?: 'auto' | 'http' | 'rpc';
    useSameCredentials?: boolean;
    username?: string;
    domain?: string;
    password?: string;
    accessToken?: string;
  };
  proxy?: {
    type: 'http' | 'socks5';
    host: string;
    port: number;
    username?: string;
    password?: string;
  } | null;
  security?: {
    protocol?: 'auto' | 'nla' | 'tls' | 'rdp' | 'ext';
    certificatePolicy?: 'strict' | 'prompt' | 'tofu';
    tlsSecurityLevel?: number | null;
    minimumTls?: '1.2' | '1.3' | null;
  };
  display?: {
    width?: number;
    height?: number;
    colorDepth?: 16 | 24 | 32;
    dynamicResolution?: boolean;
    multiMonitor?: boolean;
    smartSizing?: boolean;
    desktopScalePercent?: number;
    deviceScalePercent?: 100 | 140 | 180;
    orientation?: 0 | 90 | 180 | 270;
  };
  quality?: {
    profile?: 'low-bandwidth' | 'balanced' | 'lan' | 'custom';
    maxFps?: number;            // 1..60
    targetBitrateKbps?: number;
    maxBitrateKbps?: number;
    wallpaper?: boolean;
    fontSmoothing?: boolean;
    desktopComposition?: boolean;
    fullWindowDrag?: boolean;
    menuAnimations?: boolean;
    themes?: boolean;
  };
  media?: {
    videoCodec?: 'h264' | 'jpeg';
    hardwareEncode?: 'auto' | 'off' | 'prefer';
    audioOutput?: 'opus' | 'pcm' | 'off';
    microphone?: 'opus' | 'pcm' | 'off';
    audioLatencyMs?: number;
  };
  clipboard?: {
    mode?: 'bidirectional' | 'server-to-browser' | 'browser-to-server' | 'off';
    text?: boolean;
    html?: boolean;
    images?: boolean;
    files?: boolean;
    maxItemBytes?: number;
  };
  redirection?: {
    drives?: Array<{
      name: string;
      source: { kind: 'session-sandbox'; subdir: string } | { kind: 'host-path'; path: string };
      readOnly?: boolean;
    }>;
    thinclientDrives?: Array<{
      name: string;
      subdir: string;
      readOnly?: boolean;
    }>;
    printers?: Array<{
      mode: 'host' | 'spool';
      name?: string;
      driver?: string;
      default?: boolean;
    }>;
    smartcards?: Array<{ reader?: string }>;
    serial?: Array<{ name: string; path: string; driver?: 'Serial' | 'SerCx' | 'SerCx2'; permissive?: boolean }>;
    parallel?: Array<{ name: string; path: string }>;
    usb?: Array<{
      match: { vid?: string; pid?: string; bus?: number; address?: number };
      auto?: boolean;
    }>;
    camera?: { enabled: boolean; source?: 'bridge-host' | 'browser-virtual' | 'companion' };
    webauthn?: { enabled: boolean; source?: 'bridge-host' | 'companion' };
    staticChannels?: Array<{ name: string; options?: string[] }>;
    dynamicChannels?: Array<{ name: string; options?: string[] }>;
  };
  remoteApp?: {
    enabled: boolean;
    program?: string;
    workingDir?: string;
    arguments?: string;
  };
  reconnect?: {
    enabled?: boolean;
    maxAttempts?: number;
    delayMs?: number;
  };
  timeouts?: {
    connectMs?: number;
    tcpAckMs?: number;
    idleSessionMs?: number | null;
  };
  diagnostics?: {
    freeRdpLogLevel?: 'OFF' | 'FATAL' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE';
    freeRdpLogFilters?: string[];
  };
};
```

## Validation rules

- Reject unknown top-level keys by default for API v1.
- Hostnames maximum 253 characters; logical drive/printer/share names have strict printable allowlists.
- Dimensions are capped by policy; default hard limit 7680×4320 until explicitly raised.
- `maxFps` <= 60 in v1.
- Host paths require an administrator policy and cannot be supplied by an ordinary untrusted client.
- Serial/parallel device paths are resolved against an allowlist.
- USB matching is declarative; never accept shell snippets or raw FreeRDP command text.
- Custom static/dynamic channels must be on a server allowlist.
- `tlsSecurityLevel` and `minimumTls` weakening options require privileged policy.
- Secrets are marked with schema metadata and redacted recursively in logs/errors.

## Quality profiles

Suggested mapping:

- `low-bandwidth`: wallpaper off, animations off, full-window-drag off, target 1.5–3 Mbps 1080p, 30 fps cap.
- `balanced`: wallpaper off or adaptive, font smoothing on, target 4–8 Mbps 1080p, 45 fps cap.
- `lan`: visual effects enabled, 60 fps cap, 8–20 Mbps depending on content.

These are bridge/video transport settings plus matching FreeRDP performance flags, not hard guarantees.
