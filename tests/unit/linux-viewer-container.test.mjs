import test from 'node:test';
import assert from 'node:assert/strict';
import { assertLoopbackViewerPorts } from '../../scripts/linux-viewer-container.mjs';

test('Linux viewer refuses wildcard/extra/ambiguous publication before lab authentication', () => {
  assert.doesNotThrow(() =>
    assertLoopbackViewerPorts({
      '47999/tcp': [{ HostIp: '127.0.0.1', HostPort: '47998' }],
    }),
  );
  for (const bindings of [
    null,
    [],
    {},
    { '47999/tcp': null },
    { '47999/tcp': [] },
    { '47999/tcp': [{ HostIp: '0.0.0.0', HostPort: '47998' }] },
    { '47999/tcp': [{ HostIp: '', HostPort: '47998' }] },
    { '47999/tcp': [{ HostIp: '127.0.0.1', HostPort: '47999' }] },
    { '47999/tcp': [{ HostIp: '::', HostPort: '47998' }] },
    {
      '47999/tcp': [
        { HostIp: '127.0.0.1', HostPort: '47998' },
        { HostIp: '::', HostPort: '47998' },
      ],
    },
    { '47999/tcp': [{ HostIp: '127.0.0.1', HostPort: '47998' }], '22/tcp': [] },
  ])
    assert.throws(
      () => assertLoopbackViewerPorts(bindings),
      /loopback publication/,
    );
});
