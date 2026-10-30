import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import {
  ProtocolError,
  HOST_INVENTORY_MAX_BYTES,
  encodeHostInventoryRequest,
  decodeHostInventoryRequest,
  encodeHostInventoryReport,
  decodeHostInventoryReport,
  validateHostInventorySelection,
} from '../../packages/protocol/dist/index.js';

// Independently specified v1 header, USB class, one record and UTF-8 Zhe label.
const golden = Buffer.from(
  '00010001000100000005000000010000000100021234abcd020300000000000075d096',
  'hex',
);
const report = {
  classes: [
    {
      kind: 'usb',
      status: 'available',
      devices: [
        {
          origin: 'bridge-host',
          id: 'u',
          name: '\u0416',
          usb: { vendorId: 0x1234, productId: 0xabcd, bus: 2, address: 3 },
        },
      ],
    },
  ],
};
test('host inventory agrees with independent fixed request/report vectors', () => {
  const request = { classes: ['usb', 'printers'], maxDevices: 128 };
  const vector = Buffer.from('0001001100800000', 'hex');
  assert.deepEqual(encodeHostInventoryRequest(request), vector);
  assert.deepEqual(decodeHostInventoryRequest(vector), {
    classes: ['printers', 'usb'],
    maxDevices: 128,
  });
  assert.deepEqual(encodeHostInventoryReport(report), golden);
  assert.deepEqual(decodeHostInventoryReport(golden), report);
  assert.deepEqual(
    encodeHostInventoryReport(decodeHostInventoryReport(golden)),
    golden,
  );
});
test('host inventory rejects every truncation, trailing data, bad counters and reserved fields', () => {
  for (let length = 0; length < golden.length; length++)
    assert.throws(
      () => decodeHostInventoryReport(golden.subarray(0, length)),
      ProtocolError,
    );
  for (const [offset, value] of [
    [1, 2],
    [3, 0],
    [3, 6],
    [5, 0],
    [5, 129],
    [7, 1],
    [9, 0],
    [9, 6],
    [11, 6],
    [13, 2],
    [15, 1],
    [17, 0],
    [16, 1],
    [19, 0],
    [18, 1],
    [26, 1],
    [31, 1],
    [32, 0],
    [33, 0xc0],
    [34, 0xff],
  ]) {
    const changed = Buffer.from(golden);
    changed[offset] = value;
    assert.throws(() => decodeHostInventoryReport(changed), ProtocolError);
  }
  assert.throws(
    () => decodeHostInventoryReport(Buffer.concat([golden, Buffer.of(0)])),
    ProtocolError,
  );
  assert.throws(
    () => decodeHostInventoryReport(Buffer.alloc(HOST_INVENTORY_MAX_BYTES + 1)),
    ProtocolError,
  );
  for (let length = 0; length < 8; length++)
    assert.throws(
      () => decodeHostInventoryRequest(Buffer.alloc(length)),
      ProtocolError,
    );
  for (const input of [
    { classes: [], maxDevices: 1 },
    { classes: ['usb', 'usb'], maxDevices: 1 },
    { classes: ['browser'], maxDevices: 1 },
    { classes: ['usb'], maxDevices: 0 },
    { classes: ['usb'], maxDevices: 129 },
    { classes: ['usb'], maxDevices: 1.5 },
  ])
    assert.throws(() => encodeHostInventoryRequest(input), ProtocolError);
  for (const hex of [
    '0001000000010000',
    '0001002000010000',
    '0001001000000000',
    '0001001000810000',
    '0001001000010001',
    '0002001000010000',
  ])
    assert.throws(
      () => decodeHostInventoryRequest(Buffer.from(hex, 'hex')),
      ProtocolError,
    );
});
test('inventory class status, Unicode metadata and request authority remain distinct', () => {
  const statuses = [
    'available',
    'unavailable',
    'denied',
    'unsupported',
    'limit',
    'failure',
  ];
  for (const status of statuses) {
    const value = { classes: [{ kind: 'smartcards', status, devices: [] }] };
    assert.deepEqual(
      decodeHostInventoryReport(encodeHostInventoryReport(value)),
      value,
    );
  }
  const value = {
    classes: [
      {
        kind: 'printers',
        status: 'available',
        devices: [
          {
            origin: 'bridge-host',
            id: 'queue',
            name: '\u65e5\u672c\u8a9e\ud83d\ude00',
          },
        ],
      },
      {
        kind: 'serial',
        status: 'limit',
        devices: [{ origin: 'bridge-host', id: '/dev/ttyS0', name: 'Port 0' }],
      },
    ],
  };
  assert.deepEqual(
    decodeHostInventoryReport(encodeHostInventoryReport(value)),
    value,
  );
  validateHostInventorySelection(value, {
    classes: ['serial', 'printers'],
    maxDevices: 2,
  });
  assert.throws(
    () =>
      validateHostInventorySelection(value, {
        classes: ['printers'],
        maxDevices: 2,
      }),
    ProtocolError,
  );
  assert.throws(
    () =>
      validateHostInventorySelection(value, {
        classes: ['serial', 'printers'],
        maxDevices: 1,
      }),
    ProtocolError,
  );
  for (const status of ['denied', 'unavailable', 'unsupported', 'failure']) {
    const copy = structuredClone(report);
    copy.classes[0].status = status;
    assert.throws(() => encodeHostInventoryReport(copy), ProtocolError);
    const bytes = Buffer.from(golden);
    bytes.writeUInt16BE(statuses.indexOf(status), 10);
    assert.throws(() => decodeHostInventoryReport(bytes), ProtocolError);
  }
});
test('inventory bounds duplicate identifiers, Unicode scalars and aggregate bytes before output allocation', () => {
  for (const value of [
    '',
    'x'.repeat(256),
    '\u0416'.repeat(128),
    'a\0b',
    'a\nb',
    '\u0080',
    '\u009f',
    '\ud800',
  ]) {
    const copy = structuredClone(report);
    copy.classes[0].devices[0].name = value;
    assert.throws(() => encodeHostInventoryReport(copy), ProtocolError);
  }
  const duplicate = structuredClone(report);
  duplicate.classes[0].devices.push(
    structuredClone(duplicate.classes[0].devices[0]),
  );
  assert.throws(() => encodeHostInventoryReport(duplicate), ProtocolError);
  const rawDuplicate = Buffer.concat([golden, golden.subarray(16)]);
  rawDuplicate.writeUInt16BE(2, 4);
  rawDuplicate.writeUInt16BE(2, 12);
  assert.throws(() => decodeHostInventoryReport(rawDuplicate), ProtocolError);
  const wrongClass = Buffer.from(golden);
  wrongClass.writeUInt16BE(3, 8);
  assert.throws(() => decodeHostInventoryReport(wrongClass), ProtocolError);
  for (const usb of [
    undefined,
    { vendorId: 65536, productId: 0, bus: 0, address: 0 },
    { vendorId: 1, productId: 2, bus: 256, address: 0 },
  ]) {
    const copy = structuredClone(report);
    copy.classes[0].devices[0].usb = usb;
    assert.throws(() => encodeHostInventoryReport(copy), ProtocolError);
  }
  const tooBig = {
    classes: [
      {
        kind: 'serial',
        status: 'available',
        devices: Array.from({ length: 128 }, (_, i) => ({
          origin: 'bridge-host',
          id: String(i).padEnd(255, 'x'),
          name: 'n'.repeat(255),
        })),
      },
    ],
  };
  const allocation = mock.method(Buffer, 'alloc', () => {
    throw new Error('unexpected output allocation');
  });
  try {
    assert.throws(() => encodeHostInventoryReport(tooBig), ProtocolError);
    assert.equal(allocation.mock.callCount(), 0);
  } finally {
    allocation.mock.restore();
  }
});
test('inventory enforces canonical unique classes and accepts its exact global count ceiling', () => {
  const value = {
    classes: [
      {
        kind: 'serial',
        status: 'available',
        devices: Array.from({ length: 128 }, (_, i) => ({
          origin: 'bridge-host',
          id: String(i),
          name: 'port',
        })),
      },
    ],
  };
  const bytes = encodeHostInventoryReport(value);
  assert.deepEqual(decodeHostInventoryReport(bytes), value);
  value.classes[0].devices.push({
    origin: 'bridge-host',
    id: 'extra',
    name: 'port',
  });
  assert.throws(() => encodeHostInventoryReport(value), ProtocolError);
  const empty = { kind: 'serial', status: 'available', devices: [] };
  assert.throws(
    () => encodeHostInventoryReport({ classes: [empty, empty] }),
    ProtocolError,
  );
  const repeated = Buffer.from(
    '000100020000000000030000000000000003000000000000',
    'hex',
  );
  assert.throws(() => decodeHostInventoryReport(repeated), ProtocolError);
});
test('inventory admits the exact byte ceiling, refuses one extra byte and never accepts a foreign origin', () => {
  const value = {
    classes: [
      {
        kind: 'serial',
        status: 'available',
        devices: Array.from({ length: 128 }, (_, i) => ({
          origin: 'bridge-host',
          id: i < 124 ? String(i).padEnd(255, 'x') : i.toString(36),
          name: 'n'.repeat(i < 124 ? 255 : 56),
        })),
      },
    ],
  };
  const bytes = encodeHostInventoryReport(value);
  assert.equal(bytes.length, HOST_INVENTORY_MAX_BYTES);
  assert.deepEqual(decodeHostInventoryReport(bytes), value);
  value.classes[0].devices[127].name += 'n';
  assert.throws(() => encodeHostInventoryReport(value), ProtocolError);
  const copy = structuredClone(report);
  copy.classes[0].devices[0].origin = 'companion';
  assert.throws(() => encodeHostInventoryReport(copy), ProtocolError);
  const control = Buffer.from(golden);
  control[33] = 0xc2;
  control[34] = 0x80;
  assert.throws(() => decodeHostInventoryReport(control), ProtocolError);
});
