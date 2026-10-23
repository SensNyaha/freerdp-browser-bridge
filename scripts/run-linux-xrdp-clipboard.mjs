import { open } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { readPrivateLabInput } from './private-lab-input.mjs';

// Repeated controlled fixed-item offer/revoke tests are authorized by the user.
// No remote reads, host clipboard access, credentials in argv/env or raw errors.
const [container, fingerprint, carrier, ...extra] = process.argv.slice(2);
if (
  extra.length ||
  !/^freerdp-bridge-linux-rdp-[0-9]+$/.test(container ?? '') ||
  !/^sha256:[a-f0-9]{64}$/.test(fingerprint ?? '') ||
  (carrier !== undefined && carrier !== '--framed')
)
  throw new Error(
    'Use owned Linux lab container, approved fingerprint and optional --framed',
  );

const boundedJson = async (name) => {
  const storage = Buffer.alloc(8193);
  let file;
  try {
    file = await open(resolve('.local-tests', name), 'r');
    let length = 0;
    while (length < storage.length) {
      const { bytesRead } = await file.read(
        storage,
        length,
        storage.length - length,
      );
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > 8192) throw new Error();
    return JSON.parse(
      storage
        .subarray(0, length)
        .toString('utf8')
        .replace(/^\uFEFF/, ''),
    );
  } finally {
    storage.fill(0);
    await file?.close();
  }
};
let bytes;
try {
  const config = await boundedJson('xrdp-lab.json');
  const credentials = await boundedJson('xrdp-lab.secrets.json');
  try {
    bytes = Buffer.from(
      JSON.stringify({
        host: config.host,
        port: config.port ?? 3389,
        username: credentials.username,
        password: credentials.password,
      }),
    );
  } finally {
    delete credentials.password;
  }
  // Validate the exact bounded private bootstrap before starting Docker.
  const lab = await readPrivateLabInput([Buffer.from(bytes)]);
  delete lab.password;
  if (lab.host !== '192.168.21.149' || lab.port !== 3389) throw new Error();
} catch {
  bytes?.fill(0);
  throw new Error('Local lab input unavailable');
}
const child = spawn(
  'docker',
  [
    'exec',
    '-i',
    '-e',
    'LD_LIBRARY_PATH=/work/.deps/freerdp-install/lib:/work/.deps/installed/x64-linux-bundled/lib',
    container,
    'node',
    'scripts/test-xrdp-clipboard.mjs',
    fingerprint,
    'offer-revoke',
    carrier ? '--private-stdin-framed' : '--private-stdin',
  ],
  { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
);
let received = 0,
  ended = false;
const timer = setTimeout(() => child.kill('SIGKILL'), 55000);
child.stdout.on('data', (chunk) => {
  received += chunk.length;
  if (received > 8192) {
    child.kill('SIGKILL');
    return;
  }
  process.stdout.write(chunk);
});
child.stderr.resume();
child.stdin.on('error', () => {});
child.stdin.end(bytes, () => bytes.fill(0));
child.once('error', () => {
  bytes.fill(0);
  process.exitCode = 1;
});
child.once('close', (code) => {
  ended = true;
  clearTimeout(timer);
  bytes.fill(0);
  if (code !== 0)
    console.error('Linux clipboard probe failed; raw diagnostics suppressed');
  process.exitCode = code === 0 ? 0 : 1;
});
process.once('exit', () => {
  if (!ended) child.kill('SIGKILL');
});
