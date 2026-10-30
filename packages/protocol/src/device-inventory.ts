import { isUtf8 } from 'node:buffer';
import { ProtocolError } from './index.js';

/** Development contract; no worker capability or physical redirection is enabled. */
export const HOST_INVENTORY_MAX_BYTES = 65536;
export const HOST_INVENTORY_MAX_DEVICES = 128;
export const HOST_INVENTORY_TEXT_BYTES = 255;
const classes = [
  'printers',
  'smartcards',
  'serial',
  'parallel',
  'usb',
] as const;
const statuses = [
  'available',
  'unavailable',
  'denied',
  'unsupported',
  'limit',
  'failure',
] as const;
export type HostDeviceClass = (typeof classes)[number];
export type HostInventoryStatus = (typeof statuses)[number];
export interface HostInventoryRequest {
  classes: readonly HostDeviceClass[];
  maxDevices: number;
}
export interface HostInventoryDevice {
  origin: 'bridge-host';
  id: string;
  name: string;
  usb?: {
    vendorId: number;
    productId: number;
    bus: number;
    address: number;
  };
}
export interface HostInventoryClass {
  kind: HostDeviceClass;
  status: HostInventoryStatus;
  devices: readonly HostInventoryDevice[];
}
export interface HostInventoryReport {
  classes: readonly HostInventoryClass[];
}
function refuse(): never {
  throw new ProtocolError();
}
function uint(value: number, maximum: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= maximum;
}
function text(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= HOST_INVENTORY_TEXT_BYTES &&
    Buffer.byteLength(value) <= HOST_INVENTORY_TEXT_BYTES &&
    !/[\u0000-\u001f\u007f-\u009f\ud800-\udfff]/u.test(value)
  );
}
export function encodeHostInventoryRequest(
  value: HostInventoryRequest,
): Buffer {
  if (
    !value ||
    !Array.isArray(value.classes) ||
    !value.classes.length ||
    value.classes.length > classes.length ||
    !uint(value.maxDevices, HOST_INVENTORY_MAX_DEVICES) ||
    value.maxDevices === 0
  )
    refuse();
  let mask = 0;
  for (const kind of value.classes) {
    const index = classes.indexOf(kind);
    if (index < 0 || mask & (1 << index)) refuse();
    mask |= 1 << index;
  }
  const result = Buffer.alloc(8);
  result.writeUInt16BE(1);
  result.writeUInt16BE(mask, 2);
  result.writeUInt16BE(value.maxDevices, 4);
  return result;
}
export function decodeHostInventoryRequest(
  bytes: Buffer,
): HostInventoryRequest {
  if (
    bytes.length !== 8 ||
    bytes.readUInt16BE(0) !== 1 ||
    !bytes.readUInt16BE(2) ||
    bytes.readUInt16BE(2) > 31 ||
    !bytes.readUInt16BE(4) ||
    bytes.readUInt16BE(4) > HOST_INVENTORY_MAX_DEVICES ||
    bytes.readUInt16BE(6)
  )
    refuse();
  return {
    classes: classes.filter((_, i) => bytes.readUInt16BE(2) & (1 << i)),
    maxDevices: bytes.readUInt16BE(4),
  };
}
function admittedReport(value: HostInventoryReport): {
  bytes: number;
  count: number;
} {
  if (
    !value ||
    !Array.isArray(value.classes) ||
    !value.classes.length ||
    value.classes.length > classes.length
  )
    refuse();
  let bytes = 8,
    count = 0,
    previous = -1;
  for (const group of value.classes) {
    if (!group) refuse();
    const kind = classes.indexOf(group.kind);
    if (
      kind <= previous ||
      !statuses.includes(group.status) ||
      !Array.isArray(group.devices) ||
      group.devices.length > HOST_INVENTORY_MAX_DEVICES - count ||
      (!['available', 'limit'].includes(group.status) && group.devices.length)
    )
      refuse();
    previous = kind;
    bytes += 8;
    const ids = new Set<string>();
    for (const device of group.devices) {
      if (
        !device ||
        device.origin !== 'bridge-host' ||
        !text(device.id) ||
        !text(device.name) ||
        ids.has(device.id)
      )
        refuse();
      ids.add(device.id);
      if (group.kind === 'usb') {
        const usb = device.usb;
        if (
          !usb ||
          !uint(usb.vendorId, 65535) ||
          !uint(usb.productId, 65535) ||
          !uint(usb.bus, 255) ||
          !uint(usb.address, 255)
        )
          refuse();
      } else if (device.usb !== undefined) refuse();
      bytes +=
        16 + Buffer.byteLength(device.id) + Buffer.byteLength(device.name);
      if (bytes > HOST_INVENTORY_MAX_BYTES) refuse();
    }
    count += group.devices.length;
  }
  return { bytes, count };
}
export function encodeHostInventoryReport(value: HostInventoryReport): Buffer {
  const size = admittedReport(value);
  const result = Buffer.alloc(size.bytes);
  result.writeUInt16BE(1);
  result.writeUInt16BE(value.classes.length, 2);
  result.writeUInt16BE(size.count, 4);
  let offset = 8;
  for (const group of value.classes) {
    result.writeUInt16BE(classes.indexOf(group.kind) + 1, offset);
    result.writeUInt16BE(statuses.indexOf(group.status), offset + 2);
    result.writeUInt16BE(group.devices.length, offset + 4);
    offset += 8;
    for (const device of group.devices) {
      const idBytes = Buffer.byteLength(device.id),
        nameBytes = Buffer.byteLength(device.name);
      result.writeUInt16BE(idBytes, offset);
      result.writeUInt16BE(nameBytes, offset + 2);
      if (device.usb) {
        result.writeUInt16BE(device.usb.vendorId, offset + 4);
        result.writeUInt16BE(device.usb.productId, offset + 6);
        result[offset + 8] = device.usb.bus;
        result[offset + 9] = device.usb.address;
      }
      offset += 16;
      result.write(device.id, offset, idBytes, 'utf8');
      offset += idBytes;
      result.write(device.name, offset, nameBytes, 'utf8');
      offset += nameBytes;
    }
  }
  return result;
}
export function decodeHostInventoryReport(bytes: Buffer): HostInventoryReport {
  if (
    bytes.length < 16 ||
    bytes.length > HOST_INVENTORY_MAX_BYTES ||
    bytes.readUInt16BE(0) !== 1 ||
    !bytes.readUInt16BE(2) ||
    bytes.readUInt16BE(2) > classes.length ||
    bytes.readUInt16BE(4) > HOST_INVENTORY_MAX_DEVICES ||
    bytes.readUInt16BE(6)
  )
    refuse();
  const result: HostInventoryClass[] = [];
  let offset = 8,
    previous = 0,
    total = 0;
  for (let i = 0; i < bytes.readUInt16BE(2); i++) {
    if (bytes.length - offset < 8) refuse();
    const kind = bytes.readUInt16BE(offset),
      status = bytes.readUInt16BE(offset + 2),
      count = bytes.readUInt16BE(offset + 4);
    if (
      kind <= previous ||
      kind > classes.length ||
      status >= statuses.length ||
      count > bytes.readUInt16BE(4) - total ||
      (status !== 0 && status !== 4 && count !== 0) ||
      bytes.readUInt16BE(offset + 6)
    )
      refuse();
    previous = kind;
    offset += 8;
    const devices: HostInventoryDevice[] = [],
      ids = new Set<string>();
    for (let j = 0; j < count; j++) {
      if (bytes.length - offset < 16) refuse();
      const idBytes = bytes.readUInt16BE(offset),
        nameBytes = bytes.readUInt16BE(offset + 2),
        usb = {
          vendorId: bytes.readUInt16BE(offset + 4),
          productId: bytes.readUInt16BE(offset + 6),
          bus: bytes[offset + 8]!,
          address: bytes[offset + 9]!,
        };
      if (
        !idBytes ||
        !nameBytes ||
        idBytes > HOST_INVENTORY_TEXT_BYTES ||
        nameBytes > HOST_INVENTORY_TEXT_BYTES ||
        bytes.readUInt32BE(offset + 10) ||
        bytes.readUInt16BE(offset + 14) ||
        idBytes + nameBytes > bytes.length - offset - 16 ||
        (kind !== 5 &&
          (usb.vendorId || usb.productId || usb.bus || usb.address))
      )
        refuse();
      offset += 16;
      const idData = bytes.subarray(offset, offset + idBytes),
        nameData = bytes.subarray(
          offset + idBytes,
          offset + idBytes + nameBytes,
        );
      if (!isUtf8(idData) || !isUtf8(nameData)) refuse();
      const id = idData.toString('utf8'),
        name = nameData.toString('utf8');
      if (!text(id) || !text(name) || ids.has(id)) refuse();
      ids.add(id);
      devices.push({
        origin: 'bridge-host',
        id,
        name,
        ...(kind === 5 ? { usb } : {}),
      });
      offset += idBytes + nameBytes;
    }
    total += count;
    result.push({
      kind: classes[kind - 1]!,
      status: statuses[status]!,
      devices,
    });
  }
  if (offset !== bytes.length || total !== bytes.readUInt16BE(4)) refuse();
  return { classes: result };
}
export function validateHostInventorySelection(
  report: HostInventoryReport,
  request: HostInventoryRequest,
): void {
  const expected = decodeHostInventoryRequest(
    encodeHostInventoryRequest(request),
  );
  const size = admittedReport(report);
  if (
    size.count > request.maxDevices ||
    report.classes.length !== expected.classes.length ||
    report.classes.some((group, i) => group.kind !== expected.classes[i])
  )
    refuse();
}
