import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ConfigError,
  validateSessionConfig,
  redactSecrets,
} from '../../packages/config/dist/index.js';
const base = () => ({
  target: { host: 'rdp.example.internal' },
  auth: { username: 'example', password: 'sentinel-PASSWORD' },
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
