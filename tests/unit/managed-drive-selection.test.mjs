import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { validateSessionConfig } from '../../packages/config/dist/index.js';
import {
  managedDriveDescriptors,
  encodeConnectionSettings,
  decodeBuild,
  ProtocolError,
} from '../../packages/protocol/dist/index.js';
import { selectManagedDrives } from '../../packages/node-bridge/dist/drive-selection.js';
import {
  NativeSessionWorker,
  resolveManagedFilesPolicy,
} from '../../packages/node-bridge/dist/index.js';

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
const drive = { name: 'Documents', subdir: 'users/inbox', readOnly: true };
test('managed CONFIGURE schema 15 has an independent golden vector and leaves legacy selection unchanged', () => {
  const legacy = encodeConnectionSettings(settings);
  assert.equal(legacy.readUInt16BE(), 1);
  const selected = encodeConnectionSettings({ ...settings, drives: [drive] });
  assert.equal(
    selected.toString('hex'),
    '000f00096c6f63616c686f737400017500000d3d0400030000200201020000001388000003e81e145000003d0900003d09000000000000000000000000000000010009446f63756d656e7473000b75736572732f696e626f780100',
  );
  assert.deepEqual(encodeConnectionSettings(settings), legacy);
  const drives = Array.from({ length: 32 }, (_, i) => ({
    name: `D${i}`,
    subdir: 'a'.repeat(253),
    readOnly: false,
  }));
  assert.ok(encodeConnectionSettings({ ...settings, drives }).length > 2048);
  assert.ok(encodeConnectionSettings({ ...settings, drives }).length <= 16384);
  for (const invalid of [[], [...drives, drive], null])
    assert.throws(
      () => encodeConnectionSettings({ ...settings, drives: invalid }),
      ProtocolError,
    );
});
test('managed descriptors refuse host paths, DOS aliases, malformed policy and nonportable bounds', () => {
  const invalid = [
    ...[
      '',
      'CON',
      'a/b',
      'a\\b',
      'C:',
      'bad.',
      'bad ',
      'first   tail',
      '123456 tail',
      'a'.repeat(65),
    ].map((name) => ({ ...drive, name })),
    ...[
      '',
      '/home',
      'C:/home',
      '../escape',
      'a/../b',
      'a//b',
      'a\\b',
      'CON',
      'a/NUL',
      'a/',
      'a'.repeat(254),
      Array(32).fill('a').join('/'),
    ].map((subdir) => ({ ...drive, subdir })),
    { ...drive, readOnly: 1 },
    { ...drive, readOnly: undefined },
    { ...drive, path: '/host' },
  ];
  for (const value of invalid)
    assert.throws(() => managedDriveDescriptors([value]), ProtocolError);
  assert.throws(
    () =>
      managedDriveDescriptors([
        { ...drive, name: 'ABCDEFG0-one' },
        { ...drive, name: 'abcdefg1-two' },
      ]),
    ProtocolError,
  );
  const original = { ...drive };
  const copied = managedDriveDescriptors([original]);
  original.subdir = 'changed';
  assert.equal(copied[0].subdir, 'users/inbox');
});
test('thinclientDrives expands to the same explicit sandbox descriptors and refuses other device selections', () => {
  assert.deepEqual(
    selectManagedDrives({ redirection: { thinclientDrives: [drive] } }),
    [drive],
  );
  assert.deepEqual(
    selectManagedDrives({
      redirection: {
        drives: [
          {
            name: drive.name,
            source: { kind: 'session-sandbox', subdir: drive.subdir },
            readOnly: true,
          },
        ],
      },
    }),
    [drive],
  );
  assert.equal(selectManagedDrives({ redirection: { drives: [] } }), undefined);
  assert.throws(() =>
    selectManagedDrives({
      redirection: {
        drives: [
          { name: 'FILES', source: { kind: 'host-path', path: '/host' } },
        ],
      },
    }),
  );
  assert.throws(() => selectManagedDrives({ redirection: { printers: [] } }));
  assert.throws(() =>
    selectManagedDrives({
      redirection: {
        thinclientDrives: [drive],
        drives: [
          {
            name: drive.name,
            source: { kind: 'session-sandbox', subdir: 'other' },
          },
        ],
      },
    }),
  );
});
test('private managed-drive HELLO requires file service, connect core and a supported native platform', () => {
  const report = (extensions, os = 'windows', caps = 5) =>
    Buffer.concat([
      Buffer.from([0, 1, 0, caps]),
      ...[
        '0.5.0',
        'synthetic',
        '3.32.1',
        '3.32.1',
        os,
        'x64',
        'framed-pipes',
      ].flatMap((text) => {
        const bytes = Buffer.from(text),
          size = Buffer.alloc(2);
        size.writeUInt16BE(bytes.length);
        return [size, bytes];
      }),
      Buffer.from([0, 1, 0, 0, 0, 0, extensions >> 8, extensions & 255]),
    ]);
  assert.equal(decodeBuild(report(3072)).capabilities.managedDrives, true);
  assert.equal(decodeBuild(report(7168)).capabilities.xrdpLegacyDelete, true);
  assert.equal(
    decodeBuild(report(3072)).capabilities.xrdpLegacyDelete,
    undefined,
  );
  assert.equal(decodeBuild(report(1024)).capabilities.managedDrives, undefined);
  for (const bytes of [
    report(2048),
    report(3072, 'fake'),
    report(3072, 'linux', 1),
    report(4096),
    report(5120),
    report(6144),
    report(7168, 'fake'),
    report(7168, 'linux', 1),
  ])
    assert.throws(() => decodeBuild(bytes), ProtocolError);
});
test('XRDP delete policy is trusted-host, strictly boolean, immutable and capability gated before initialization', async () => {
  assert.equal(resolveManagedFilesPolicy({}).xrdpLegacyDelete, false);
  for (const xrdpLegacyDelete of [null, 0, 1, 'true'])
    assert.throws(() => resolveManagedFilesPolicy({ xrdpLegacyDelete }));
  for (const redirection of [
    { xrdpLegacyDelete: true },
    { drives: [], xrdpLegacyDelete: true },
  ])
    assert.throws(() =>
      validateSessionConfig({
        target: { host: 'synthetic' },
        auth: {},
        redirection,
      }),
    );
  for (const [enabled, supported] of [
    [true, false],
    [true, true],
    [false, false],
  ]) {
    const calls = [];
    class Adapter extends NativeSessionWorker {
      createWorkerProcess() {
        return Object.assign(new EventEmitter(), {
          start: async () => ({
            capabilities: {
              fileService: true,
              managedDrives: true,
              ...(supported ? { xrdpLegacyDelete: true } : {}),
            },
          }),
          nativeFileCommand: async (command) => {
            calls.push(command.flags ?? 0);
            return {
              ...command,
              flags: 0,
              status: 'ok',
              id: 0n,
              argument: 0n,
              value: 0n,
              data: Buffer.alloc(0),
            };
          },
          connect: async () => calls.push('connect'),
          close: async () => {},
        });
      }
    }
    const options = { xrdpLegacyDelete: enabled };
    const adapter = new Adapter(
      { workerPath: 'unused', runtimeRoot: 'unused' },
      { files: options },
    );
    options.xrdpLegacyDelete = !enabled;
    try {
      const result = adapter.start(
        {
          target: { host: 'synthetic' },
          auth: {},
          redirection: { thinclientDrives: [drive] },
        },
        new AbortController().signal,
      );
      if (enabled && !supported) {
        await assert.rejects(result, { code: 'RDP_SETTING_NOT_IMPLEMENTED' });
        assert.deepEqual(calls, []);
      } else {
        await result;
        assert.deepEqual(calls, [enabled ? 1 : 0, 'connect']);
      }
    } finally {
      await adapter.close();
    }
  }
});
test('synthetic native seam refuses unmanaged drives before file initialization or credentials and accepts both aliases with host policy', async () => {
  for (const [supported, enabled] of [
    [false, true],
    [true, false],
    [true, true],
  ]) {
    const calls = [];
    class Adapter extends NativeSessionWorker {
      createWorkerProcess() {
        return Object.assign(new EventEmitter(), {
          start: async () => ({
            capabilities: { fileService: true, managedDrives: supported },
          }),
          nativeFileCommand: async (command) => {
            calls.push(command.operation);
            return {
              ...command,
              status: 'ok',
              flags: 0,
              id: 0n,
              argument: 0n,
              value: 0n,
              data: Buffer.alloc(0),
            };
          },
          connect: async (config) => {
            calls.push('connect');
            assert.deepEqual(selectManagedDrives(config), [drive]);
          },
          close: async () => {},
        });
      }
    }
    const adapter = new Adapter(
      { workerPath: 'unused', runtimeRoot: 'unused' },
      enabled ? { files: resolveManagedFilesPolicy({}) } : {},
    );
    try {
      const result = adapter.start(
        {
          target: { host: 'synthetic' },
          auth: {},
          redirection: { thinclientDrives: [drive] },
        },
        new AbortController().signal,
      );
      if (supported && enabled) {
        await result;
        assert.deepEqual(calls, ['initialize', 'connect']);
      } else {
        await assert.rejects(result, { code: 'RDP_SETTING_NOT_IMPLEMENTED' });
        assert.deepEqual(calls, []);
      }
    } finally {
      await adapter.close();
    }
  }
});
