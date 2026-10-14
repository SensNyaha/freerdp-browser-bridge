import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const [container, mode = 'strict', fingerprint, ...extra] =
  process.argv.slice(2);
if (
  extra.length ||
  !/^freerdp-bridge-linux-rdp-[0-9]+$/.test(container ?? '') ||
  !['strict', 'connect'].includes(mode) ||
  (mode === 'connect'
    ? !/^sha256:[a-f0-9]{64}$/.test(fingerprint ?? '')
    : fingerprint !== undefined)
)
  throw new Error(
    'Use the owned Linux RDP test container and strict/connect fingerprint',
  );
let bytes;
try {
  const read = async (file) =>
    JSON.parse(
      (await readFile(resolve('.local-tests', file), 'utf8')).replace(
        /^\uFEFF/,
        '',
      ),
    );
  const config = await read('xrdp-lab.json');
  const credentials = await read('xrdp-lab.secrets.json');
  bytes = Buffer.from(
    JSON.stringify({
      host: config.host,
      port: config.port,
      username: credentials.username,
      password: credentials.password,
    }),
  );
  delete credentials.password;
  if (bytes.length > 8192) throw new Error();
} catch {
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
    'scripts/test-xrdp-transport.mjs',
    mode,
    ...(fingerprint ? [fingerprint] : []),
  ],
  { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
);
let received = 0;
let ended = false;
const timer = setTimeout(() => child.kill('SIGKILL'), 50000);
const consume = (chunk) => {
  received += chunk.length;
  if (received > 8192) {
    child.kill('SIGKILL');
    return;
  }
  process.stdout.write(chunk);
};
child.stdout.on('data', consume);
// Suppress raw process/runtime diagnostics; helper semantic report remains stdout.
child.stderr.resume();
child.stdin.on('error', () => {});
child.stdin.end(bytes, () => bytes.fill(0));
child.on('error', () => {
  bytes.fill(0);
  process.exitCode = 1;
});
child.once('close', (code) => {
  ended = true;
  clearTimeout(timer);
  bytes.fill(0);
  process.exitCode = code === 0 ? 0 : 1;
});
process.once('exit', () => {
  if (!ended) child.kill('SIGKILL');
});
