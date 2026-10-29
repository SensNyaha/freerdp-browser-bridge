import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { isIP } from 'node:net';
import { physicalScancode } from '../packages/protocol/dist/input.js';

const validId = (id) => typeof id === 'string' && /^[0-9a-f]{32}$/.test(id);
const refused = () => new Error('FILES_LAB_RECEIPT_REFUSED');
const confirmedTarget = (target) => {
  if (
    !target ||
    typeof target.host !== 'string' ||
    isIP(target.host) !== 4 ||
    !Number.isInteger(target.port) ||
    target.port < 1 ||
    target.port > 65535 ||
    target.testCertificateConfirmedByUser !== true ||
    typeof target.fingerprint !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/.test(target.fingerprint)
  )
    return false;
  const [a, b] = target.host.split('.').map(Number);
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    target.host === '127.0.0.1'
  );
};

/** One bounded bootstrap record; credentials are never arguments or environment. */
export async function readWindowsFilesLabInput(stream) {
  const storage = Buffer.alloc(32768);
  let length = 0;
  const timer = setTimeout(
    () => stream.destroy(new Error('FILES_LAB_INPUT_REFUSED')),
    15000,
  );
  try {
    for await (const bytes of stream) {
      if (!Buffer.isBuffer(bytes)) throw new Error();
      try {
        if (bytes.length > storage.length - length) throw new Error();
        bytes.copy(storage, length);
        length += bytes.length;
      } finally {
        bytes.fill(0);
      }
    }
    const input = JSON.parse(storage.subarray(0, length).toString('utf8'));
    if (
      !validId(input?.id) ||
      !confirmedTarget(input) ||
      !['framed-pipes', 'unix-seqpacket-rws1'].includes(input.ipcTransport) ||
      typeof input.workerPath !== 'string' ||
      input.workerPath.length > 4096 ||
      typeof input.workerSha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(input.workerSha256) ||
      (input.fullRoot !== undefined &&
        (typeof input.fullRoot !== 'string' ||
          !input.fullRoot.length ||
          input.fullRoot.length > 4096)) ||
      !input.credentials ||
      typeof input.credentials.username !== 'string' ||
      !input.credentials.username.length ||
      input.credentials.username.length > 256 ||
      typeof input.credentials.password !== 'string' ||
      input.credentials.password.length > 4096 ||
      (input.credentials.domain !== undefined &&
        (typeof input.credentials.domain !== 'string' ||
          input.credentials.domain.length > 256))
    )
      throw new Error();
    return input;
  } catch {
    throw new Error('FILES_LAB_INPUT_REFUSED');
  } finally {
    clearTimeout(timer);
    storage.fill(0);
  }
}

export async function windowsManagedFilesScript() {
  const source = await readFile(
    new URL('../tests/fixtures/windows-managed-files.ps1', import.meta.url),
  );
  if (
    source.length > 16384 ||
    !/^[\x09\x0a\x0d\x20-\x7e]+$/.test(source.toString('utf8'))
  )
    throw new Error('FILES_LAB_SOURCE_REFUSED');
  return source;
}

export function windowsManagedFilesCommand(id, diskFull = false) {
  if (!validId(id)) throw new Error('FILES_LAB_ID_REFUSED');
  if (typeof diskFull !== 'boolean') throw new Error('FILES_LAB_MODE_REFUSED');
  return (
    "& ([scriptblock]::Create([IO.File]::ReadAllText('\\\\tsclient\\RW" +
    id.slice(0, 5) +
    "\\owned-check.ps1'))) '" +
    id +
    "'" +
    (diskFull ? ' -DiskFull' : '')
  );
}

// Fixed US-keyboard lab launcher. This does not implement layout translation
// for the product; Unicode filenames are constructed inside the owned script.
export function windowsManagedFilesKeys(id, diskFull = false) {
  const punctuation = {
    ' ': ['Space', false],
    '&': ['Digit7', true],
    '(': ['Digit9', true],
    ')': ['Digit0', true],
    '[': ['BracketLeft', false],
    ']': ['BracketRight', false],
    ':': ['Semicolon', true],
    '.': ['Period', false],
    "'": ['Quote', false],
    '\\': ['Backslash', false],
    '-': ['Minus', false],
  };
  return Array.from(windowsManagedFilesCommand(id, diskFull), (char) => {
    if (/^[a-z]$/i.test(char))
      return {
        code: 'Key' + char.toUpperCase(),
        shift: char === char.toUpperCase(),
      };
    if (/^[0-9]$/.test(char)) return { code: 'Digit' + char, shift: false };
    const pair = punctuation[char];
    if (!pair) throw new Error('FILES_LAB_COMMAND_REFUSED');
    return { code: pair[0], shift: pair[1] };
  });
}

/** Input delivery only, into an empty PowerShell window confirmed by the user.
 * The caller first uploads the fixed script into this session's managed share.
 * No shell is launched, execution policy changed, or host clipboard accessed.
 */
export async function dispatchWindowsManagedFiles(
  sendInput,
  target,
  id,
  preparedWindow,
  pause = delay,
  diskFull = false,
) {
  if (!confirmedTarget(target)) throw new Error('FILES_LAB_TARGET_REFUSED');
  if (preparedWindow !== true)
    throw new Error('FILES_LAB_WINDOW_NOT_CONFIRMED');
  const keys = windowsManagedFilesKeys(id, diskFull);
  const key = (code, down) =>
    sendInput({
      type: 'key',
      scancode: physicalScancode(code),
      down,
      repeat: false,
    });
  try {
    await sendInput({ type: 'reset' });
    for (const [code, down] of [
      ['ControlLeft', true],
      ['KeyC', true],
      ['KeyC', false],
      ['ControlLeft', false],
    ])
      await sendInput({
        type: 'key',
        scancode: physicalScancode(code),
        down,
        repeat: false,
      });
    await pause(200);
    // The operator prepares an English keyboard in the owned window. Keep
    // console command delivery separate from the unaccepted Unicode-burst path.
    for (const { code, shift } of keys) {
      if (shift) await key('ShiftLeft', true);
      await key(code, true);
      await pause(10);
      await key(code, false);
      if (shift) await key('ShiftLeft', false);
      await pause(25);
    }
    for (const down of [true, false])
      await sendInput({
        type: 'key',
        scancode: physicalScancode('Enter'),
        down,
        repeat: false,
      });
  } catch {
    throw new Error('FILES_LAB_INPUT_FAILED');
  } finally {
    await sendInput({ type: 'reset' }).catch(() => {});
  }
}

/** Only bounded scalar receipts from the owned script may leave the lab. */
export function parseWindowsFilesReceipt(text, id, phase) {
  if (
    !validId(id) ||
    !['created', 'clean', 'failed', 'full'].includes(phase) ||
    typeof text !== 'string' ||
    Buffer.byteLength(text) > 2048
  )
    throw refused();
  try {
    const value = JSON.parse(text);
    if (
      !value ||
      value.v !== 1 ||
      value.id !== id ||
      value.ok !== (phase !== 'failed') ||
      (phase === 'failed'
        ? ![
            'mount',
            'read-only',
            'read-only-create',
            'read-only-open',
            'read-only-delete',
            'create-write',
            'rename',
            'wait-host',
            'host-readback',
            'delete',
            'receipt-reserve',
            'disk-full',
            'wait-full-host',
          ].includes(value.phase)
        : value.phase !== phase)
    )
      throw refused();
    const keys = Object.keys(value).sort().join(',');
    if (phase === 'failed') {
      if (
        keys !== 'errno,id,ok,phase,v' ||
        !Number.isInteger(value.errno) ||
        value.errno < 0 ||
        value.errno > 65535
      )
        throw refused();
    } else if (phase === 'full') {
      if (
        keys !== 'acknowledgedBytes,errno,id,ok,phase,v' ||
        ![39, 112].includes(value.errno) ||
        !Number.isInteger(value.acknowledgedBytes) ||
        value.acknowledgedBytes < 65536 ||
        value.acknowledgedBytes >= 2097152 ||
        value.acknowledgedBytes % 65536 !== 0
      )
        throw refused();
    } else if (phase === 'created') {
      if (
        keys !== 'bytes,id,ok,phase,readOnlyRefusals,sha256,v' ||
        value.bytes !== 65599 ||
        value.readOnlyRefusals !== 3 ||
        typeof value.sha256 !== 'string' ||
        !/^[0-9a-f]{64}$/.test(value.sha256)
      )
        throw refused();
    } else if (
      keys !== 'hostUploadBytes,id,ok,phase,readOnlySeedIntact,v' ||
      value.hostUploadBytes !== 131111 ||
      value.readOnlySeedIntact !== true
    )
      throw refused();
    return value;
  } catch {
    throw refused();
  }
}
