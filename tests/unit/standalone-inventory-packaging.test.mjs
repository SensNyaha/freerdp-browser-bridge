import test from 'node:test';
import assert from 'node:assert/strict';
import {
  standaloneInventoryExpected,
  standaloneInventoryReceipt,
  checkStandaloneInventory,
} from '../fixtures/standalone-inventory.mjs';
const encode = (value) => Buffer.from(JSON.stringify(value));
const device = {
  origin: 'bridge-host',
  id: 'owned-id',
  name: 'PRIVATE-owned-name',
  usb: { vendorId: 65535, productId: 0, bus: 255, address: 0 },
};
const good = {
  classes: [{ kind: 'usb', status: 'available', devices: [device] }],
};
test('packaged inventory is required from its 0.7.0 capability boundary, including upgrades', () => {
  assert.equal(standaloneInventoryExpected('0.6.0'), false);
  for (const version of ['0.7.0', '0.7.1', '0.8.0'])
    assert.equal(standaloneInventoryExpected(version), true);
  assert.throws(() => standaloneInventoryExpected('0.7.0-PRIVATE-owned'));
});
test('packaged CLI inventory receipts retain only scalar evidence and reject malformed/private output without echo', () => {
  assert.deepEqual(standaloneInventoryReceipt(encode(good)), {
    kind: 'usb',
    status: 'available',
    devices: 1,
  });
  const bad = [
    Buffer.alloc(8193),
    Buffer.from([255]),
    Buffer.from('PRIVATE-owned'),
    encode(null),
    encode({ classes: [] }),
  ];
  for (const change of [
    (value) => value.classes.push(value.classes[0]),
    (value) => (value.classes[0].kind = 'serial'),
    (value) => (value.classes[0].status = 'unsupported'),
    (value) => (value.classes[0].status = 'failure'),
    (value) => (value.classes[0].status = 'denied'),
    (value) => (value.classes[0].devices = Array(4).fill(device)),
    (value) => (value.classes[0].devices[0].origin = 'companion'),
    (value) => (value.classes[0].devices[0].usb.bus = 256),
    (value) => (value.classes[0].devices[0].usb.vendorId = true),
  ]) {
    const value = structuredClone(good);
    change(value);
    bad.push(encode(value));
  }
  for (const bytes of bad)
    assert.throws(() => standaloneInventoryReceipt(bytes), {
      message: 'STANDALONE_PACKAGED_INVENTORY_REFUSED',
    });
  assert.deepEqual(
    standaloneInventoryReceipt(
      encode({ classes: [{ kind: 'usb', status: 'available', devices: [] }] }),
    ),
    { kind: 'usb', status: 'available', devices: 0 },
  );
});
test('packaged inventory helper rejects relative deployment paths before spawning', async () => {
  await assert.rejects(checkStandaloneInventory('relative', 'relative'), {
    message: 'STANDALONE_PACKAGED_INVENTORY_REFUSED',
  });
});
