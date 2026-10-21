import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ConfigError,
  resolveRdpPerformance,
  RDP_PERFORMANCE_FIELDS,
} from '../../packages/config/dist/index.js';
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
test('RDP performance presets select only specified fields; explicit false overrides true and omission preserves defaults', () => {
  assert.equal(resolveRdpPerformance(), undefined);
  assert.equal(resolveRdpPerformance({ maxFps: 5 }), undefined);
  assert.equal(resolveRdpPerformance({ profile: 'custom' }), undefined);
  assert.deepEqual(resolveRdpPerformance({ profile: 'low-bandwidth' }), {
    mask: 25,
    values: 0,
  });
  assert.deepEqual(resolveRdpPerformance({ profile: 'balanced' }), {
    mask: 3,
    values: 2,
  });
  assert.deepEqual(resolveRdpPerformance({ profile: 'lan' }), {
    mask: 63,
    values: 63,
  });
  assert.deepEqual(
    resolveRdpPerformance({
      profile: 'balanced',
      wallpaper: true,
      fontSmoothing: false,
    }),
    { mask: 3, values: 1 },
  );
  for (let values = 0; values < 64; ++values) {
    const fields = Object.fromEntries(
      RDP_PERFORMANCE_FIELDS.map((field, bit) => [
        field,
        Boolean(values & (1 << bit)),
      ]),
    );
    assert.deepEqual(resolveRdpPerformance({ profile: 'lan', ...fields }), {
      mask: 63,
      values,
    });
  }
  for (const field of RDP_PERFORMANCE_FIELDS)
    for (const invalid of [null, 0, 'false'])
      assert.throws(
        () => resolveRdpPerformance({ [field]: invalid }),
        ConfigError,
      );
});
test('CONFIGURE schema11 has an independent fixed byte vector and preserves unselected clipboard/legacy settings', () => {
  const bytes = encodeConnectionSettings({
    ...settings,
    performance: { mask: 3, values: 2 },
  });
  assert.equal(
    bytes.toString('hex'),
    '000b00096c6f63616c686f737400017500000d3d0400030000200201020000001388000003e8' +
      '1e145000003d0900003d090000000000000000000302',
  );
  assert.equal(encodeConnectionSettings(settings).readUInt16BE(0), 1);
  const clipboard = encodeConnectionSettings({
    ...settings,
    clipboard: { toServer: true, fromServer: false, maximum: 1024 },
    performance: { mask: 32, values: 32 },
  });
  assert.equal(clipboard.subarray(-10).toString('hex'), '00000080000004002020');
  for (const performance of [
    null,
    [],
    false,
    {},
    { mask: -1, values: 0 },
    { mask: 64, values: 0 },
    { mask: 1.5, values: 0 },
    { mask: 1, values: 2 },
    { mask: 63, values: 64 },
    { mask: 1, values: NaN },
  ])
    assert.throws(
      () => encodeConnectionSettings({ ...settings, performance }),
      ProtocolError,
    );
});
test('CONFIGURE performance selection admits exactly the 729 canonical selected/value combinations', () => {
  let accepted = 0;
  for (let mask = 0; mask < 64; ++mask)
    for (let values = 0; values < 64; ++values) {
      if (values & ~mask)
        assert.throws(
          () =>
            encodeConnectionSettings({
              ...settings,
              performance: { mask, values },
            }),
          ProtocolError,
        );
      else {
        const bytes = encodeConnectionSettings({
          ...settings,
          performance: { mask, values },
        });
        assert.deepEqual([...bytes.subarray(-2)], [mask, values]);
        ++accepted;
      }
    }
  assert.equal(accepted, 729);
});
test('HELLO performance capability is additive, defaults false and requires core/video quality', () => {
  const build = (flags, extension) => {
    const header = Buffer.alloc(4);
    header.writeUInt16BE(1);
    header.writeUInt16BE(flags, 2);
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
        : [Buffer.from([0, 1, 0, 0, 0, 0, extension >>> 8, extension & 255])]),
    ]);
  };
  assert.equal(decodeBuild(build(261)).capabilities.performanceSettings, false);
  assert.equal(
    decodeBuild(build(261, 32)).capabilities.performanceSettings,
    true,
  );
  for (const [flags, extension] of [
    [5, 32],
    [1, 32],
    [261, 256],
  ])
    assert.throws(() => decodeBuild(build(flags, extension)), ProtocolError);
});
