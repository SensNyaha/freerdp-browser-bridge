import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  linuxImageLabArguments,
  requireLinuxImageLabContainer,
  linuxImageLabImage,
  requireLinuxImageLabCapabilities,
  requireLinuxImageLabBuild,
} from '../../scripts/linux-image-lab-profile.mjs';

const args = [
  'freerdp-bridge-linux-image-viewer-501',
  '--prepared-remote-document=' + 'a'.repeat(32),
  'sha256:' + 'b'.repeat(64),
  '--owned-os-clipboard',
];

test('Linux image CLI refuses an implicit profile before Docker, browser or private input', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/test-linux-image-rdp.mjs'],
    { encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 32768 },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /LINUX_IMAGE_LAB_PROFILE_REFUSED/);
  assert.equal(result.stdout, '');
});
test('Linux image lab selects only explicit prepared-document/clipboard/transport profiles', () => {
  assert.deepEqual(linuxImageLabArguments(args), {
    container: args[0],
    nonce: 'a'.repeat(32),
    fingerprint: args[2],
    transport: 'auto',
    bootstrapOnly: false,
    keepDocument: false,
  });
  assert.equal(
    linuxImageLabArguments([...args, 'framed-pipes', '--bootstrap-only'])
      .bootstrapOnly,
    true,
  );
  assert.equal(
    linuxImageLabArguments([...args, 'auto', '--keep-remote-document'])
      .keepDocument,
    true,
  );
  for (const value of [
    [],
    args.slice(1),
    [args[0], 'invalid', ...args.slice(2)],
    ['foreign-container', ...args.slice(1)],
    [...args.slice(0, 3), '--implicit'],
    [...args, 'arbitrary'],
    [...args, 'auto', '--extra'],
    [...args, 'auto', '--bootstrap-only', '--extra'],
  ])
    assert.throws(
      () => linuxImageLabArguments(value),
      /LINUX_IMAGE_LAB_PROFILE_REFUSED/,
    );
});

test('Linux image lab checks concrete hooks without claiming the overall V1 rdp capability', () => {
  const value = {
    rdp: false,
    connectCore: true,
    basicInput: true,
    clipboardText: true,
    clipboardRevoke: true,
    clipboardImage: true,
  };
  requireLinuxImageLabCapabilities(value);
  for (const key of [
    'connectCore',
    'basicInput',
    'clipboardText',
    'clipboardRevoke',
    'clipboardImage',
  ])
    assert.throws(
      () => requireLinuxImageLabCapabilities({ ...value, [key]: false }),
      /LINUX_IMAGE_LAB_PROFILE_REFUSED/,
    );
});

const container = () => ({
  Id: 'c'.repeat(64),
  Image: 'sha256:' + 'd'.repeat(64),
  Config: {
    Image: linuxImageLabImage,
    User: '1000:1000',
    WorkingDir: '/bridge/image-linux-node-source',
    Labels: { 'freerdp-bridge.image-acceptance': '1' },
    Env: [
      'BRIDGE_TEST_BINARY_DIR=/bridge/image-handoff-source-gcc83/build/gcc83',
    ],
  },
  HostConfig: {
    Privileged: false,
    ReadonlyRootfs: true,
    CapDrop: ['ALL'],
    PortBindings: { '47999/tcp': [{ HostIp: '127.0.0.1', HostPort: '47998' }] },
  },
  Mounts: [
    {
      Type: 'volume',
      Name: 'bridge-runtime-recovery-gcc83-sdk',
      Destination: '/bridge',
      RW: false,
    },
  ],
});
test('Linux image lab refuses wildcard publication, root/privileged workers, mutable/foreign mounts and loader hooks before auth', () => {
  assert.equal(requireLinuxImageLabContainer(container()).uid, 1000);
  const changes = [
    (value) => {
      value.Config.WorkingDir = '/bridge/check-source';
    },
    (value) => {
      value.Config.Env.push('BRIDGE_TEST_BINARY_DIR=/foreign');
    },
    (value) => {
      value.Config.User = 'root';
    },
    (value) => {
      value.Config.Image = 'gcc:latest';
    },
    (value) => {
      value.Config.Labels = {};
    },
    (value) => {
      value.HostConfig.Privileged = true;
    },
    (value) => {
      value.HostConfig.ReadonlyRootfs = false;
    },
    (value) => {
      value.HostConfig.CapDrop = [];
    },
    (value) => {
      value.HostConfig.PortBindings['47999/tcp'][0].HostIp = '0.0.0.0';
    },
    (value) => {
      value.Mounts[0].RW = true;
    },
    (value) => {
      value.Mounts[0].Type = 'bind';
    },
    (value) => {
      value.Mounts[0].Name = 'foreign-volume';
    },
    (value) => {
      value.Mounts.push({ Type: 'bind', Destination: '/secrets' });
    },
    (value) => {
      value.Config.Env.push('NODE_OPTIONS=--import=foreign');
    },
    (value) => {
      value.Config.Env.push('LD_PRELOAD=foreign');
    },
    (value) => {
      value.Config.Env = [];
    },
  ];
  for (const change of changes) {
    const value = container();
    change(value);
    assert.throws(
      () => requireLinuxImageLabContainer(value),
      /LINUX_IMAGE_LAB_PROFILE_REFUSED/,
    );
  }
  for (const value of [undefined, null, {}, []])
    assert.throws(
      () => requireLinuxImageLabContainer(value),
      /LINUX_IMAGE_LAB_PROFILE_REFUSED/,
    );
});

const releaseContainer = () => {
  const value = container();
  value.Config.WorkingDir = '/bridge/image05-release-source-v1';
  value.Config.Labels['freerdp-bridge.image-product-version'] = '0.5.0';
  value.Config.Env = [
    'BRIDGE_TEST_BINARY_DIR=/bridge/image05-release-source-v1/build/native-stage-release/bin',
  ];
  return value;
};
test('Linux image release-profile 0.5.0 admits only its explicitly paired source and installed native stage', () => {
  const admitted = requireLinuxImageLabContainer(releaseContainer());
  assert.equal(admitted.uid, 1000);
  assert.equal(admitted.productVersion, '0.5.0');
  for (const change of [
    (v) => {
      delete v.Config.Labels['freerdp-bridge.image-product-version'];
    },
    (v) => {
      v.Config.Labels['freerdp-bridge.image-product-version'] = '0.5.1';
    },
    (v) => {
      v.Config.WorkingDir = '/bridge/image-linux-node-source';
    },
    (v) => {
      v.Config.Env = container().Config.Env;
    },
    (v) => {
      v.Config.Env.push(v.Config.Env[0]);
    },
    (v) => {
      v.Mounts[0].RW = true;
    },
    (v) => {
      v.Config.Env.push('LD_PRELOAD=foreign');
    },
    (v) => {
      v.HostConfig.PortBindings['47999/tcp'][0].HostIp = '0.0.0.0';
    },
  ]) {
    const value = releaseContainer();
    change(value);
    assert.throws(
      () => requireLinuxImageLabContainer(value),
      /LINUX_IMAGE_LAB_PROFILE_REFUSED/,
    );
  }
  const mixed = container();
  mixed.Config.Labels['freerdp-bridge.image-product-version'] = '0.5.0';
  assert.throws(
    () => requireLinuxImageLabContainer(mixed),
    /LINUX_IMAGE_LAB_PROFILE_REFUSED/,
  );
});

test('Linux image release-profile validates 0.5.0 HELLO and carrier before credentials, retaining old development checks', () => {
  const build = {
    os: 'linux',
    arch: 'x64',
    bridgeVersion: '0.5.0',
    freeRdpVersion: '3.32.1',
    targetFreeRdpVersion: '3.32.1',
    transport: 'unix-seqpacket-rws1',
  };
  const owner = requireLinuxImageLabContainer(releaseContainer());
  requireLinuxImageLabBuild(build, 'auto', owner);
  requireLinuxImageLabBuild(
    { ...build, transport: 'framed-pipes' },
    'framed-pipes',
    owner,
  );
  requireLinuxImageLabBuild(
    { ...build, bridgeVersion: '0.4.0' },
    'auto',
    requireLinuxImageLabContainer(container()),
  );
  for (const value of [
    null,
    { ...build, bridgeVersion: '0.4.0' },
    { ...build, bridgeVersion: '0.5.1' },
    { ...build, os: 'windows' },
    { ...build, arch: 'arm64' },
    { ...build, freeRdpVersion: '3.32.0' },
    { ...build, targetFreeRdpVersion: '3.32.0' },
    { ...build, transport: 'framed-pipes' },
  ])
    assert.throws(
      () => requireLinuxImageLabBuild(value, 'auto', owner),
      /LINUX_IMAGE_LAB_PROFILE_REFUSED/,
    );
  assert.throws(
    () => requireLinuxImageLabBuild(build, 'implicit', owner),
    /LINUX_IMAGE_LAB_PROFILE_REFUSED/,
  );
  assert.throws(
    () => requireLinuxImageLabBuild(build, 'auto', { productVersion: '0.6.0' }),
    /LINUX_IMAGE_LAB_PROFILE_REFUSED/,
  );
});
