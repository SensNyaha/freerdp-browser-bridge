// Packaged CLI acceptance helper. Importing this module starts no process.
import { spawn } from 'node:child_process';
import { isUtf8 } from 'node:buffer';
import { isAbsolute, join } from 'node:path';
import { compareReleaseVersions } from '../../scripts/github-delivery/manifest.mjs';

const refuse = () => new Error('STANDALONE_PACKAGED_INVENTORY_REFUSED');
export function standaloneInventoryExpected(version) {
  return compareReleaseVersions(version, '0.7.0') >= 0;
}
export function standaloneInventoryReceipt(bytes) {
  try {
    if (!Buffer.isBuffer(bytes) || bytes.length > 8192 || !isUtf8(bytes))
      throw refuse();
    const report = JSON.parse(bytes.toString('utf8'));
    if (
      Object.keys(report).join(',') !== 'classes' ||
      !Array.isArray(report.classes) ||
      report.classes.length !== 1
    )
      throw refuse();
    const selected = report.classes[0];
    if (
      selected.kind !== 'usb' ||
      !['available', 'unavailable', 'denied', 'limit'].includes(
        selected.status,
      ) ||
      !Array.isArray(selected.devices) ||
      selected.devices.length > 3 ||
      (!['available', 'limit'].includes(selected.status) &&
        selected.devices.length)
    )
      throw refuse();
    for (const device of selected.devices) {
      if (
        device.origin !== 'bridge-host' ||
        typeof device.id !== 'string' ||
        typeof device.name !== 'string' ||
        !device.usb ||
        !['vendorId', 'productId', 'bus', 'address'].every(
          (key) =>
            Number.isInteger(device.usb[key]) &&
            device.usb[key] >= 0 &&
            device.usb[key] <=
              (key === 'bus' || key === 'address' ? 255 : 65535),
        )
      )
        throw refuse();
    }
    return {
      kind: 'usb',
      status: selected.status,
      devices: selected.devices.length,
    };
  } catch {
    throw refuse();
  }
}

export async function checkStandaloneInventory(
  program,
  runtimeRoot,
  { serviceUser = false } = {},
) {
  if (
    !isAbsolute(program) ||
    !isAbsolute(runtimeRoot) ||
    (serviceUser && (process.platform !== 'linux' || process.getuid() !== 0))
  )
    throw refuse();
  const node = join(
    program,
    'node',
    process.platform === 'win32' ? 'node.exe' : 'node',
  );
  const args = [
    join(program, 'service/dist/main.js'),
    '--inventory',
    'usb',
    '--runtime-root',
    runtimeRoot,
    '--max-devices',
    '3',
  ];
  const child = spawn(
    serviceUser ? '/usr/sbin/runuser' : node,
    serviceUser ? ['-u', 'freerdp-bridge', '--', node, ...args] : args,
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const chunks = [];
  let count = 0,
    stderr = 0,
    failed = false;
  child.stdout.on('data', (bytes) => {
    count += bytes.length;
    if (count > 8192) {
      failed = true;
      child.kill();
    } else chunks.push(bytes);
  });
  child.stderr.on('data', (bytes) => {
    stderr += bytes.length;
    if (stderr > 8192) {
      failed = true;
      child.kill();
    }
  });
  const timer = setTimeout(() => {
    failed = true;
    child.kill();
  }, 20000);
  timer.unref();
  try {
    const code = await new Promise((resolve) => {
      child.once('error', () => {
        failed = true;
        resolve(null);
      });
      child.once('close', resolve);
    });
    if (failed || code !== 0 || stderr !== 0) throw refuse();
    const bytes = Buffer.concat(chunks);
    try {
      return standaloneInventoryReceipt(bytes);
    } finally {
      bytes.fill(0);
    }
  } finally {
    clearTimeout(timer);
    for (const bytes of chunks) bytes.fill(0);
  }
}
