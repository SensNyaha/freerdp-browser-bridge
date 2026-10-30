// Copied into an independent npm project. No checkout import, RDP or device open.
import assert from 'node:assert/strict';
import { mkdtemp, realpath, readdir, rmdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const [kind, version] = process.argv.slice(2);
assert.equal(process.argv.length, 4);
assert.ok(['http', 'express', 'fastify', 'nestjs'].includes(kind));
const modules = await realpath('node_modules');
const entry = import.meta.resolve('@freerdp-bridge/' + kind);
assert.ok((await realpath(fileURLToPath(entry))).startsWith(modules + sep));
const manifest = JSON.parse(
  await readFile(new URL('../package.json', entry), 'utf8'),
);
assert.equal(manifest.version, version);
const sdk = await import(entry);
assert.equal(typeof sdk.discoverHostDevices, 'function');
const root = await mkdtemp(
  join(await realpath(tmpdir()), 'bridge-package-inventory-'),
);
const profiles = [];
try {
  const options = await sdk.resolveNativeRuntime({ runtimeRoot: root });
  assert.ok((await realpath(options.workerPath)).startsWith(modules + sep));
  for (const transport of process.platform === 'linux'
    ? ['framed-pipes', 'unix-seqpacket-rws1']
    : ['framed-pipes']) {
    const selected = await sdk.discoverHostDevices(
      { ...options, ipcTransport: transport },
      { classes: ['usb'], maxDevices: 3 },
    );
    assert.equal(selected.classes.length, 1);
    const usb = selected.classes[0];
    assert.equal(usb.kind, 'usb');
    assert.ok(
      ['available', 'unavailable', 'denied', 'limit'].includes(usb.status),
    );
    assert.ok(usb.devices.length <= 3);
    for (const device of usb.devices) {
      assert.equal(device.origin, 'bridge-host');
      assert.ok(device.usb);
      for (const key of ['vendorId', 'productId', 'bus', 'address'])
        assert.ok(
          Number.isInteger(device.usb[key]) &&
            device.usb[key] >= 0 &&
            device.usb[key] <=
              (key === 'bus' || key === 'address' ? 255 : 65535),
        );
    }
    assert.deepEqual(await readdir(root), []);
    const all = await sdk.discoverHostDevices(
      { ...options, ipcTransport: transport },
      {
        classes: ['printers', 'smartcards', 'serial', 'parallel', 'usb'],
        maxDevices: 16,
      },
    );
    assert.deepEqual(
      all.classes.map((group) => group.kind),
      ['printers', 'smartcards', 'serial', 'parallel', 'usb'],
    );
    assert.ok(
      all.classes.reduce((n, group) => n + group.devices.length, 0) <= 16,
    );
    assert.deepEqual(await readdir(root), []);
    profiles.push({
      transport,
      usb: { status: usb.status, count: usb.devices.length },
      all: all.classes.map((group) => ({
        kind: group.kind,
        status: group.status,
        count: group.devices.length,
      })),
    });
  }
} finally {
  await rmdir(root);
}
console.log(
  JSON.stringify({
    kind,
    version,
    inventory: true,
    checkoutImports: false,
    automaticPackagedRuntime: true,
    rdp: false,
    deviceOpen: false,
    profiles,
  }),
);
