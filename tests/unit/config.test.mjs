import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ConfigError,
  validateSessionConfig,
  redactSecrets,
  resolveVideoQuality,
} from '../../packages/config/dist/index.js';
const base = () => ({
  target: { host: 'rdp.example.internal' },
  auth: { username: 'example', password: 'sentinel-PASSWORD' },
});

test('video quality profiles preserve defaults, clamp only FPS ceilings and resolve bitrate overrides', () => {
  assert.deepEqual(resolveVideoQuality(), {
    h264Fps: 30,
    jpegFps: 20,
    jpegQuality: 80,
    targetBitrate: 4000000,
    maxBitrate: 4000000,
  });
  assert.deepEqual(resolveVideoQuality({ profile: 'low-bandwidth' }), {
    h264Fps: 10,
    jpegFps: 10,
    jpegQuality: 60,
    targetBitrate: 1000000,
    maxBitrate: 1000000,
  });
  assert.deepEqual(resolveVideoQuality({ profile: 'lan', maxFps: 60 }), {
    h264Fps: 30,
    jpegFps: 20,
    jpegQuality: 90,
    targetBitrate: 8000000,
    maxBitrate: 8000000,
  });
  assert.deepEqual(
    resolveVideoQuality({
      profile: 'custom',
      maxFps: 5,
      targetBitrateKbps: 750,
      maxBitrateKbps: 1000,
    }),
    {
      h264Fps: 5,
      jpegFps: 5,
      jpegQuality: 80,
      targetBitrate: 750000,
      maxBitrate: 1000000,
    },
  );
  assert.equal(
    resolveVideoQuality({ maxBitrateKbps: 500 }).targetBitrate,
    500000,
  );
  assert.equal(
    resolveVideoQuality({ targetBitrateKbps: 9000 }).maxBitrate,
    9000000,
  );
  assert.throws(
    () =>
      validateSessionConfig({
        ...base(),
        quality: { targetBitrateKbps: 2000, maxBitrateKbps: 1000 },
      }),
    ConfigError,
  );
});

test('schema validates logical configuration, clones values and rejects unknown fields', () => {
  const config = base();
  config.display = { width: 1920, height: 1080, colorDepth: 32 };
  config.security = { certificatePolicy: 'strict', protocol: 'nla' };
  config.redirection = {
    thinclientDrives: [{ name: 'share', subdir: 'documents' }],
  };
  const normalized = validateSessionConfig(config);
  assert.deepEqual(normalized, config);
  assert.notEqual(normalized, config);
  for (const invalid of [
    { ...base(), argv: '/cert:ignore' },
    { ...base(), auth: { password: 'sentinel', extra: true } },
    { ...base(), target: { host: 'a'.repeat(254) } },
    { ...base(), display: { width: 7681 } },
    { ...base(), quality: { maxFps: 61 } },
    { ...base(), target: { host: 'x\npassword' } },
  ]) {
    assert.throws(() => validateSessionConfig(invalid), ConfigError);
  }
});

test('unprivileged host/device/channel/TLS and restricted-admin settings are denied', () => {
  for (const settings of [
    {
      redirection: {
        drives: [{ name: 'host', source: { kind: 'host-path', path: '/etc' } }],
      },
    },
    {
      redirection: { thinclientDrives: [{ name: 'escape', subdir: '../etc' }] },
    },
    { redirection: { serial: [{ name: 'COM1', path: '/dev/ttyS0' }] } },
    { redirection: { usb: [{ match: { vid: '1234' }, auto: true }] } },
    { redirection: { staticChannels: [{ name: 'exec' }] } },
    { security: { tlsSecurityLevel: 0 } },
    { security: { minimumTls: null } },
    { auth: { mode: 'restricted-admin', passwordHash: 'sentinel-HASH' } },
  ])
    assert.throws(
      () => validateSessionConfig({ ...base(), ...settings }),
      ConfigError,
    );
});

test('recursive redaction removes passwords, gateway/proxy secrets, PINs and tokens', () => {
  const value = {
    ...base(),
    gateway: { password: 'sentinel-GW', accessToken: 'sentinel-AT' },
    proxy: { password: 'sentinel-PROXY' },
    replies: [{ pin: 'sentinel-PIN', passwordHash: 'sentinel-HASH' }],
    attachToken: 'sentinel-ATTACH',
    authorization: 'sentinel-AUTH',
  };
  const redacted = JSON.stringify(redactSecrets(value));
  assert.ok(!redacted.includes('sentinel'));
  assert.ok(redacted.includes('rdp.example.internal'));
  assert.equal(value.auth.password, 'sentinel-PASSWORD');
  value.self = value;
  assert.doesNotThrow(() => JSON.stringify(redactSecrets(value)));
  assert.throws(
    () => validateSessionConfig({ ...base(), bad: 'sentinel-INVALID' }),
    (error) => !error.message.includes('sentinel'),
  );
});
