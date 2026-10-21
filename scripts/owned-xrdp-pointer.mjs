import { execFile } from 'node:child_process';
import { open } from 'node:fs/promises';
import { promisify } from 'node:util';
import { parsePointerReceipt } from './windows-lab-pointer.mjs';

const execute = promisify(execFile);
const containerName = 'freerdp-bridge-owned-xrdp';
// F2 in the prepared Tk application selects only its bounded scalar receipt.
// This reads the owned X11 PRIMARY selection, not Bridge/CLIPRDR or host clipboard.
const observer = `import signal
import tkinter as tk
signal.alarm(2)
root = tk.Tk()
root.withdraw()
try:
    value = root.selection_get(selection='PRIMARY')
    assert len(value.encode('utf-8')) <= 512
    print(value)
finally:
    root.destroy()
`;

async function requireOwnedContainer() {
  try {
    const file = await open('.local-tests/owned-xrdp-lab.receipt.json', 'r');
    let receipt;
    try {
      const bytes = Buffer.alloc(8193);
      const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
      if (bytesRead > 8192) throw new Error();
      receipt = JSON.parse(bytes.subarray(0, bytesRead).toString('utf8'));
    } finally {
      await file.close();
    }
    if (
      receipt.v !== 1 ||
      receipt.host !== '127.0.0.1' ||
      receipt.port !== 3391 ||
      receipt.hostMounts !== 0 ||
      !/^[0-9a-f]{64}$/.test(receipt.container)
    )
      throw new Error();
    const { stdout } = await execute(
      'docker',
      [
        'inspect',
        '--format',
        '{{.Id}} {{index .Config.Labels "freerdp-bridge.owned-lab"}}',
        containerName,
      ],
      { timeout: 3000, maxBuffer: 1024, windowsHide: true },
    );
    if (stdout.trim() !== receipt.container + ' 397') throw new Error();
  } catch {
    throw new Error('LAB_OWNED_POINTER_TARGET_REFUSED');
  }
}

async function readObserver(source) {
  try {
    const { stdout } = await execute(
      'docker',
      [
        'exec',
        '--user',
        'bridge-lab',
        '-e',
        'DISPLAY=:10',
        '-e',
        'XAUTHORITY=/home/bridge-lab/.Xauthority',
        containerName,
        'python3',
        '-c',
        source,
      ],
      { timeout: 3000, maxBuffer: 512, windowsHide: true },
    );
    return stdout.trim();
  } catch {
    throw new Error('LAB_OWNED_POINTER_READBACK_FAILED');
  }
}

export async function ownedPointerReader() {
  await requireOwnedContainer();
  return async () => parsePointerReceipt(await readObserver(observer));
}

const inputObserver = `import ctypes as c
import json, signal
signal.alarm(2)
x = c.CDLL('libX11.so.6')
x.XOpenDisplay.argtypes = [c.c_char_p]
x.XOpenDisplay.restype = c.c_void_p
x.XDefaultRootWindow.argtypes = [c.c_void_p]
x.XDefaultRootWindow.restype = c.c_ulong
x.XKeysymToKeycode.argtypes = [c.c_void_p, c.c_ulong]
x.XKeysymToKeycode.restype = c.c_ubyte
x.XQueryKeymap.argtypes = [c.c_void_p, c.c_void_p]
x.XQueryPointer.argtypes = [c.c_void_p, c.c_ulong, c.POINTER(c.c_ulong), c.POINTER(c.c_ulong), c.POINTER(c.c_int), c.POINTER(c.c_int), c.POINTER(c.c_int), c.POINTER(c.c_int), c.POINTER(c.c_uint)]
x.XCloseDisplay.argtypes = [c.c_void_p]
d = x.XOpenDisplay(b':10')
assert d
try:
    keys = (c.c_ubyte * 32)()
    x.XQueryKeymap(d, keys)
    code = x.XKeysymToKeycode(d, 0xffe3)
    assert code
    root, child = c.c_ulong(), c.c_ulong()
    rx, ry, wx, wy, mask = c.c_int(), c.c_int(), c.c_int(), c.c_int(), c.c_uint()
    assert x.XQueryPointer(d, x.XDefaultRootWindow(d), c.byref(root), c.byref(child), c.byref(rx), c.byref(ry), c.byref(wx), c.byref(wy), c.byref(mask))
    m = mask.value
    buttons = ((m >> 8) & 1) | (((m >> 9) & 1) << 2) | (((m >> 10) & 1) << 1)
    print(json.dumps(dict(v=1, controlLeft=bool(keys[code >> 3] & (1 << (code & 7))), buttons=buttons)))
finally:
    x.XCloseDisplay(d)
`;

export function parseOwnedInputState(text) {
  try {
    if (typeof text !== 'string' || text.length > 128) throw new Error();
    const value = JSON.parse(text);
    if (
      !value ||
      Object.keys(value).sort().join(',') !== 'buttons,controlLeft,v' ||
      value.v !== 1 ||
      typeof value.controlLeft !== 'boolean' ||
      !Number.isSafeInteger(value.buttons) ||
      value.buttons < 0 ||
      value.buttons > 7
    )
      throw new Error();
    return value;
  } catch {
    throw new Error('LAB_OWNED_INPUT_STATE_INVALID');
  }
}

export async function ownedInputStateReader() {
  await requireOwnedContainer();
  return async () => parseOwnedInputState(await readObserver(inputObserver));
}
