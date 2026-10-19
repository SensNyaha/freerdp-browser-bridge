import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeBuild,
  encodeConnectionSettings,
  ProtocolError,
} from '../../packages/protocol/dist/index.js';

const settings = {
  host: 'localhost',
  username: 'u',
  domain: '',
  port: 3389,
  width: 1024,
  height: 768,
  colorDepth: 32,
  security: 2,
  certificatePolicy: 1,
  minimumTls: 2,
  connectMs: 5000,
  tcpAckMs: 1000,
};
test('CONFIGURE v12 IP selection has independent golden bytes and composes with appearance/clipboard', () => {
  const bytes = encodeConnectionSettings({
    ...settings,
    ip: { mask: 3, preferIPv6: 1, forceIpVersion: 6 },
  });
  assert.equal(
    bytes.toString('hex'),
    '000c00096c6f63616c686f737400017500000d3d0400030000200201020000001388000003e8' +
      '1e145000003d0900003d0900' +
      '00000000' +
      '00000000' +
      '0000' +
      '030106',
  );
  assert.equal(encodeConnectionSettings(settings).readUInt16BE(0), 1);
  const combined = encodeConnectionSettings({
    ...settings,
    clipboard: { toServer: true, fromServer: false, maximum: 1024 },
    performance: { mask: 3, values: 2 },
    ip: { mask: 2, preferIPv6: 0, forceIpVersion: 4 },
  });
  assert.equal(
    combined.subarray(-13).toString('hex'),
    '00000080000004000302020004',
  );
});
test('CONFIGURE IP selection admits twelve canonical values and refuses invalid scalar/mask combinations', () => {
  let accepted = 0;
  for (let mask = 0; mask < 4; ++mask)
    for (const preferIPv6 of [0, 1])
      for (const forceIpVersion of [0, 4, 6]) {
        const ip = { mask, preferIPv6, forceIpVersion };
        if (
          (!(mask & 1) && preferIPv6 !== 0) ||
          (!(mask & 2) && forceIpVersion !== 0)
        )
          assert.throws(
            () => encodeConnectionSettings({ ...settings, ip }),
            ProtocolError,
          );
        else {
          assert.deepEqual(
            [...encodeConnectionSettings({ ...settings, ip }).subarray(-3)],
            [mask, preferIPv6, forceIpVersion],
          );
          ++accepted;
        }
      }
  assert.equal(accepted, 12);
  for (const ip of [
    null,
    [],
    false,
    {},
    { mask: -1, preferIPv6: 0, forceIpVersion: 0 },
    { mask: 4, preferIPv6: 0, forceIpVersion: 0 },
    { mask: 1.5, preferIPv6: 0, forceIpVersion: 0 },
    { mask: 3, preferIPv6: true, forceIpVersion: 4 },
    { mask: 3, preferIPv6: 2, forceIpVersion: 4 },
    { mask: 3, preferIPv6: 1, forceIpVersion: null },
    { mask: 3, preferIPv6: 1, forceIpVersion: '4' },
    { mask: 3, preferIPv6: 1, forceIpVersion: 5 },
    { mask: 3, preferIPv6: NaN, forceIpVersion: 6 },
  ])
    assert.throws(
      () => encodeConnectionSettings({ ...settings, ip }),
      ProtocolError,
    );
});
test('HELLO IP capability requires connectCore, defaults false and preserves unknown-bit refusal', () => {
  const build = (base, extension) => {
    const header = Buffer.alloc(4);
    header.writeUInt16BE(1);
    header.writeUInt16BE(base, 2);
    const strings = [
      '0.1.0',
      'fixture',
      '3.32.1',
      '3.32.1',
      'windows',
      'x64',
      'framed-pipes',
    ].flatMap((value) => {
      const bytes = Buffer.from(value),
        size = Buffer.alloc(2);
      size.writeUInt16BE(bytes.length);
      return [size, bytes];
    });
    return Buffer.concat([
      header,
      ...strings,
      ...(extension === undefined
        ? []
        : [Buffer.from([0, 1, 0, 0, 0, 0, 0, extension])]),
    ]);
  };
  assert.equal(decodeBuild(build(5)).capabilities.ipSettings, false);
  assert.equal(decodeBuild(build(5, 0)).capabilities.ipSettings, false);
  assert.equal(decodeBuild(build(5, 64)).capabilities.ipSettings, true);
  assert.equal(decodeBuild(build(261, 96)).capabilities.ipSettings, true);
  for (const [base, extension] of [
    [1, 64],
    [261, 128],
  ])
    assert.throws(() => decodeBuild(build(base, extension)), ProtocolError);
});
