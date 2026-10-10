import { Type, type Static, type TProperties } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';

const object = <T extends TProperties>(properties: T) =>
  Type.Object(properties, { additionalProperties: false });
const text = (maxLength = 1024) => Type.String({ maxLength });
const optText = (maxLength = 1024) => Type.Optional(text(maxLength));
const secret = () =>
  Type.Optional(Type.String({ maxLength: 4096, secret: true }));
const bool = () => Type.Optional(Type.Boolean());
const number = (minimum: number, maximum: number) =>
  Type.Optional(Type.Integer({ minimum, maximum }));
const choice = <T extends string | number>(...values: T[]) =>
  Type.Union(values.map((value) => Type.Literal(value)));
const name = () =>
  Type.String({ minLength: 1, maxLength: 64, pattern: '^[A-Za-z0-9_ -]+$' });
const subdir = () =>
  Type.String({
    minLength: 1,
    maxLength: 253,
    pattern: '^[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*$',
  });
const array = <T extends ReturnType<typeof object>>(schema: T) =>
  Type.Optional(Type.Array(schema, { maxItems: 16 }));
const channel = () =>
  object({
    name: name(),
    options: Type.Optional(Type.Array(text(256), { maxItems: 16 })),
  });

export const SessionCreateSchema = object({
  target: object({
    host: Type.String({
      minLength: 1,
      maxLength: 253,
      pattern: '^[^\\s\\u0000-\\u001f]+$',
    }),
    port: number(1, 65535),
    serverName: optText(253),
    preferIPv6: bool(),
    forceIpVersion: Type.Optional(
      Type.Union([Type.Literal(4), Type.Literal(6), Type.Null()]),
    ),
  }),
  auth: object({
    username: optText(256),
    domain: optText(256),
    password: secret(),
    mode: Type.Optional(
      choice('auto', 'password', 'smartcard', 'restricted-admin'),
    ),
    passwordHash: secret(),
  }),
  gateway: Type.Optional(
    object({
      enabled: Type.Boolean(),
      host: optText(253),
      port: number(1, 65535),
      transport: Type.Optional(choice('auto', 'http', 'rpc')),
      useSameCredentials: bool(),
      username: optText(256),
      domain: optText(256),
      password: secret(),
      accessToken: secret(),
    }),
  ),
  proxy: Type.Optional(
    Type.Union([
      object({
        type: choice('http', 'socks5'),
        host: text(253),
        port: Type.Integer({ minimum: 1, maximum: 65535 }),
        username: optText(256),
        password: secret(),
      }),
      Type.Null(),
    ]),
  ),
  security: Type.Optional(
    object({
      protocol: Type.Optional(choice('auto', 'nla', 'tls', 'rdp', 'ext')),
      certificatePolicy: Type.Optional(choice('strict', 'prompt', 'tofu')),
      tlsSecurityLevel: Type.Optional(
        Type.Union([Type.Integer({ minimum: 0, maximum: 5 }), Type.Null()]),
      ),
      minimumTls: Type.Optional(
        Type.Union([choice('1.2', '1.3'), Type.Null()]),
      ),
    }),
  ),
  display: Type.Optional(
    object({
      width: number(1, 7680),
      height: number(1, 4320),
      colorDepth: Type.Optional(choice(16, 24, 32)),
      dynamicResolution: bool(),
      multiMonitor: bool(),
      smartSizing: bool(),
      desktopScalePercent: number(100, 500),
      deviceScalePercent: Type.Optional(choice(100, 140, 180)),
      orientation: Type.Optional(choice(0, 90, 180, 270)),
    }),
  ),
  input: Type.Optional(object({ touch: bool() })),
  quality: Type.Optional(
    object({
      profile: Type.Optional(
        choice('low-bandwidth', 'balanced', 'lan', 'custom'),
      ),
      maxFps: number(1, 60),
      targetBitrateKbps: number(1, 100000),
      maxBitrateKbps: number(1, 100000),
      wallpaper: bool(),
      fontSmoothing: bool(),
      desktopComposition: bool(),
      fullWindowDrag: bool(),
      menuAnimations: bool(),
      themes: bool(),
    }),
  ),
  media: Type.Optional(
    object({
      videoCodec: Type.Optional(choice('h264', 'jpeg')),
      hardwareEncode: Type.Optional(choice('auto', 'off', 'prefer')),
      audioOutput: Type.Optional(choice('opus', 'pcm', 'off')),
      microphone: Type.Optional(choice('opus', 'pcm', 'off')),
      audioLatencyMs: number(10, 150),
    }),
  ),
  clipboard: Type.Optional(
    object({
      mode: Type.Optional(
        choice(
          'bidirectional',
          'server-to-browser',
          'browser-to-server',
          'off',
        ),
      ),
      text: bool(),
      html: bool(),
      images: bool(),
      files: bool(),
      maxItemBytes: number(1, 16777216),
    }),
  ),
  redirection: Type.Optional(
    object({
      drives: array(
        object({
          name: name(),
          source: Type.Union([
            object({ kind: Type.Literal('session-sandbox'), subdir: subdir() }),
            object({ kind: Type.Literal('host-path'), path: text() }),
          ]),
          readOnly: bool(),
        }),
      ),
      thinclientDrives: array(
        object({ name: name(), subdir: subdir(), readOnly: bool() }),
      ),
      printers: array(
        object({
          mode: choice('host', 'spool'),
          name: Type.Optional(name()),
          driver: optText(),
          default: bool(),
        }),
      ),
      smartcards: array(object({ reader: optText() })),
      serial: array(
        object({
          name: name(),
          path: text(),
          driver: Type.Optional(choice('Serial', 'SerCx', 'SerCx2')),
          permissive: bool(),
        }),
      ),
      parallel: array(object({ name: name(), path: text() })),
      usb: array(
        object({
          match: object({
            vid: optText(4),
            pid: optText(4),
            bus: number(0, 255),
            address: number(0, 255),
          }),
          auto: bool(),
        }),
      ),
      camera: Type.Optional(
        object({
          enabled: Type.Boolean(),
          source: Type.Optional(
            choice('bridge-host', 'browser-virtual', 'companion'),
          ),
        }),
      ),
      webauthn: Type.Optional(
        object({
          enabled: Type.Boolean(),
          source: Type.Optional(choice('bridge-host', 'companion')),
        }),
      ),
      staticChannels: array(channel()),
      dynamicChannels: array(channel()),
    }),
  ),
  remoteApp: Type.Optional(
    object({
      enabled: Type.Boolean(),
      program: optText(),
      workingDir: optText(),
      arguments: optText(4096),
    }),
  ),
  reconnect: Type.Optional(
    object({
      enabled: bool(),
      maxAttempts: number(0, 10),
      delayMs: number(0, 60000),
    }),
  ),
  timeouts: Type.Optional(
    object({
      connectMs: number(100, 120000),
      tcpAckMs: number(100, 120000),
      idleSessionMs: Type.Optional(
        Type.Union([
          Type.Integer({ minimum: 1000, maximum: 86400000 }),
          Type.Null(),
        ]),
      ),
    }),
  ),
  diagnostics: Type.Optional(
    object({
      freeRdpLogLevel: Type.Optional(
        choice('OFF', 'FATAL', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'),
      ),
      freeRdpLogFilters: Type.Optional(Type.Array(text(256), { maxItems: 16 })),
    }),
  ),
});

export type SessionCreate = Static<typeof SessionCreateSchema>;
const validator = TypeCompiler.Compile(SessionCreateSchema);

export class ConfigError extends Error {
  readonly code = 'INVALID_SESSION_CONFIG';
  constructor() {
    super('Session configuration is invalid or disallowed by policy');
  }
}

/** Initial safe policy: privileged settings require a separate future admin-policy resolver. */
export function validateSessionConfig(value: unknown): SessionCreate {
  if (!validator.Check(value)) throw new ConfigError();
  const r = value.redirection;
  if (
    value.target.serverName ||
    value.auth.passwordHash ||
    value.auth.mode === 'restricted-admin' ||
    value.security?.tlsSecurityLevel != null ||
    value.security?.minimumTls === null ||
    r?.drives?.some((drive) => drive.source.kind === 'host-path') ||
    r?.serial?.length ||
    r?.parallel?.length ||
    r?.usb?.length ||
    r?.smartcards?.length ||
    r?.printers?.some((printer) => printer.mode === 'host') ||
    r?.staticChannels?.length ||
    r?.dynamicChannels?.length
  )
    throw new ConfigError();
  if (value.gateway?.enabled && !value.gateway.host) throw new ConfigError();
  if (
    value.quality?.targetBitrateKbps &&
    value.quality.maxBitrateKbps &&
    value.quality.targetBitrateKbps > value.quality.maxBitrateKbps
  )
    throw new ConfigError();
  return structuredClone(value);
}

export interface VideoQuality {
  h264Fps: number;
  jpegFps: number;
  jpegQuality: number;
  targetBitrate: number;
  maxBitrate: number;
}

/** Non-secret encoder defaults. maxFps is a ceiling, not a promised render rate. */
export function resolveVideoQuality(
  quality?: SessionCreate['quality'],
): VideoQuality {
  const profile = quality?.profile ?? 'balanced';
  const fps = quality?.maxFps ?? (profile === 'low-bandwidth' ? 10 : 30);
  const bitrate =
    profile === 'low-bandwidth' ? 1000 : profile === 'lan' ? 8000 : 4000;
  const target =
    quality?.targetBitrateKbps ??
    Math.min(bitrate, quality?.maxBitrateKbps ?? bitrate);
  return {
    h264Fps: Math.min(30, fps),
    jpegFps: Math.min(20, fps),
    jpegQuality: profile === 'low-bandwidth' ? 60 : profile === 'lan' ? 90 : 80,
    targetBitrate: target * 1000,
    maxBitrate: (quality?.maxBitrateKbps ?? Math.max(bitrate, target)) * 1000,
  };
}

export function redactSecrets(
  value: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (typeof value !== 'object' || value === null) return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value))
    return value.map((item) => redactSecrets(item, seen));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      /password|hash|pin|token|authorization|cookie|secret/i.test(key)
        ? '[REDACTED]'
        : redactSecrets(item, seen),
    ]),
  );
}
