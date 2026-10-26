import test from 'node:test';
import assert from 'node:assert/strict';
import {
  linuxHtmlLabArguments,
  requireLinuxHtmlLabContainer,
  linuxHtmlLabImage,
  requireLinuxHtmlLabCapabilities,
} from '../../scripts/linux-html-lab-profile.mjs';

const args = [
  'freerdp-bridge-linux-viewer-501',
  '--prepared-remote-document=' + 'a'.repeat(32),
  'sha256:' + 'b'.repeat(64),
  '--owned-os-clipboard',
];
test('Linux HTML lab selects only explicit prepared-document/clipboard/transport profiles', () => {
  assert.deepEqual(linuxHtmlLabArguments(args), {
    container: args[0],
    nonce: 'a'.repeat(32),
    fingerprint: args[2],
    transport: 'auto',
    bootstrapOnly: false,
    keepDocument: false,
  });
  assert.equal(
    linuxHtmlLabArguments([...args, 'framed-pipes', '--bootstrap-only'])
      .bootstrapOnly,
    true,
  );
  assert.equal(
    linuxHtmlLabArguments([...args, 'auto', '--keep-owned-document'])
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
      () => linuxHtmlLabArguments(value),
      /LINUX_HTML_LAB_PROFILE_REFUSED/,
    );
});

test('Linux HTML lab checks concrete hooks without claiming the overall V1 rdp capability', () => {
  const value = {
    rdp: false,
    connectCore: true,
    basicInput: true,
    clipboardText: true,
    clipboardRevoke: true,
    clipboardHtml: true,
  };
  requireLinuxHtmlLabCapabilities(value);
  for (const key of [
    'connectCore',
    'basicInput',
    'clipboardText',
    'clipboardRevoke',
    'clipboardHtml',
  ])
    assert.throws(
      () => requireLinuxHtmlLabCapabilities({ ...value, [key]: false }),
      /LINUX_HTML_LAB_PROFILE_REFUSED/,
    );
});

const container = () => ({
  Id: 'c'.repeat(64),
  Image: 'sha256:' + 'd'.repeat(64),
  Config: {
    Image: linuxHtmlLabImage,
    User: '1000:1000',
    WorkingDir: '/bridge/check-source',
    Labels: { 'freerdp-bridge.html-acceptance': '1' },
    Env: ['BRIDGE_TEST_BINARY_DIR=/bridge/source/build/bundled'],
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
test('Linux HTML lab refuses wildcard publication, root/privileged workers, mutable/foreign mounts and loader hooks before auth', () => {
  assert.equal(requireLinuxHtmlLabContainer(container()).uid, 1000);
  const changes = [
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
      () => requireLinuxHtmlLabContainer(value),
      /LINUX_HTML_LAB_PROFILE_REFUSED/,
    );
  }
  for (const value of [undefined, null, {}, []])
    assert.throws(
      () => requireLinuxHtmlLabContainer(value),
      /LINUX_HTML_LAB_PROFILE_REFUSED/,
    );
});
