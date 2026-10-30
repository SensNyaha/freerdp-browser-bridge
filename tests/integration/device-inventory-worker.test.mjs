import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  Kind,
  encodePacket,
  helloPayload,
  encodeHostInventoryRequest,
  encodeFileRecord,
} from '../../packages/protocol/dist/index.js';
import {
  WorkerProcess,
  discoverHostDevices,
} from '../../packages/node-bridge/dist/index.js';

const binaryDir = process.env.BRIDGE_TEST_BINARY_DIR;
const workerPath = join(
  resolve(binaryDir ?? 'build/foundation'),
  'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
);
for (const ipcTransport of process.platform === 'linux'
  ? ['framed-pipes', 'unix-seqpacket-rws1']
  : ['framed-pipes']) {
  test(
    `actual native ${ipcTransport}: host metadata only, single-use inventory, healthy heartbeat and joined cleanup; no RDP`,
    { skip: !binaryDir, timeout: 25000 },
    async (context) => {
      const root = await mkdtemp(join(tmpdir(), 'bridge-owned-inventory-'));
      const worker = new WorkerProcess({
        workerPath,
        runtimeRoot: root,
        ipcTransport,
        requestTimeoutMs: 8000,
        heartbeatIntervalMs: 10000,
      });
      let pid;
      try {
        const build = await worker.start();
        pid = worker.pid;
        assert.equal(build.capabilities.hostDeviceInventory, true);
        const report = await worker.nativeHostInventory({
          classes: ['printers', 'smartcards', 'serial', 'parallel', 'usb'],
          maxDevices: 8,
        });
        assert.deepEqual(
          report.classes.map((x) => x.kind),
          ['printers', 'smartcards', 'serial', 'parallel', 'usb'],
        );
        for (const kind of process.platform === 'win32'
          ? ['printers', 'smartcards', 'serial', 'parallel']
          : ['serial', 'parallel'])
          assert.notEqual(
            report.classes.find((x) => x.kind === kind).status,
            'unsupported',
          );
        if (build.freeRdpVersion !== null)
          assert.notEqual(
            report.classes.find((x) => x.kind === 'usb').status,
            'unsupported',
          );
        context.diagnostic(
          JSON.stringify({
            scope: 'actual-native-host-inventory-no-RDP',
            platform: process.platform,
            linked: build.freeRdpVersion !== null,
            classes: report.classes.map(({ kind, status, devices }) => ({
              kind,
              status,
              count: devices.length,
            })),
          }),
        );
        assert.ok(
          report.classes.reduce((n, x) => n + x.devices.length, 0) <= 8,
        );
        for (const group of report.classes) {
          assert.ok(
            [
              'available',
              'unavailable',
              'denied',
              'unsupported',
              'limit',
              'failure',
            ].includes(group.status),
          );
          for (const device of group.devices)
            assert.equal(device.origin, 'bridge-host');
        }
        await worker.ping();
        await assert.rejects(
          worker.nativeHostInventory({ classes: ['serial'], maxDevices: 1 }),
          { code: 'INVALID_STATE' },
        );
        await assert.rejects(
          worker.nativeFileCommand({
            operation: 'initialize',
            id: 0n,
            argument: 0n,
            value: 0n,
          }),
          { code: 'INVALID_STATE' },
        );
        await assert.rejects(worker.connect({}), { code: 'INVALID_STATE' });
      } finally {
        await worker.close();
        assert.deepEqual(await readdir(root), []);
        if (pid) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
        await rmdir(root);
      }
    },
  );
}
test('host inventory refuses an invalid selector before creating a runtime', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bridge-owned-inventory-guard-'));
  try {
    await assert.rejects(
      discoverHostDevices(
        {
          workerPath: join(root, 'absent'),
          runtimeRoot: join(root, 'must-not-exist'),
        },
        { classes: ['browser'], maxDevices: 1 },
      ),
    );
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rmdir(root);
  }
});
test(
  'actual native SDK discovery isolates a selected USB inventory and joins its private runtime',
  { skip: !binaryDir, timeout: 15000 },
  async (context) => {
    const root = await mkdtemp(join(tmpdir(), 'bridge-owned-usb-inventory-'));
    try {
      const report = await discoverHostDevices(
        { workerPath, runtimeRoot: root, requestTimeoutMs: 5000 },
        { classes: ['usb'], maxDevices: 8 },
      );
      assert.equal(report.classes.length, 1);
      assert.equal(report.classes[0].kind, 'usb');
      assert.ok(report.classes[0].devices.length <= 8);
      for (const device of report.classes[0].devices) {
        assert.equal(device.origin, 'bridge-host');
        assert.ok(device.usb);
      }
      context.diagnostic(
        JSON.stringify({
          scope: 'actual-native-selected-usb-no-RDP',
          status: report.classes[0].status,
          count: report.classes[0].devices.length,
        }),
      );
      assert.deepEqual(await readdir(root), []);
    } finally {
      await rmdir(root);
    }
  },
);
test(
  'actual native inventory mode rejects duplicate queries and ordinary IO independently of Node guards',
  { skip: !binaryDir, timeout: 15000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'bridge-owned-inventory-wire-'));
    const packet = (kind, requestId, payload) =>
      encodePacket({ kind, requestId, payload });
    const hello = packet(Kind.Hello, 1n, helloPayload());
    const query = packet(
      Kind.HostInventory,
      2n,
      encodeHostInventoryRequest({ classes: ['serial'], maxDevices: 1 }),
    );
    const file = packet(
      Kind.FileCommand,
      3n,
      encodeFileRecord(
        {
          operation: 'retire',
          status: 'ok',
          flags: 0,
          id: 0n,
          argument: 0n,
          value: 0n,
          data: Buffer.alloc(0),
        },
        false,
      ),
    );
    try {
      for (const records of [
        [hello, query, query],
        [hello, query, file],
        [hello, file, query],
      ]) {
        const child = spawnSync(workerPath, [], {
          cwd: root,
          input: Buffer.concat(records),
          timeout: 4000,
          maxBuffer: 131072,
          windowsHide: true,
        });
        assert.ifError(child.error);
        assert.equal(child.status, 2);
        assert.deepEqual(await readdir(root), []);
      }
    } finally {
      await rmdir(root);
    }
  },
);
