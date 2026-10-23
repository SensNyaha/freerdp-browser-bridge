import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const [
  container,
  fingerprint,
  audioOutput = 'off',
  microphone = 'pcm',
  carrier,
  ...extra
] = process.argv.slice(2);
if (
  extra.length ||
  !/^freerdp-bridge-linux-rdp-[0-9]+$/.test(container ?? '') ||
  !/^sha256:[a-f0-9]{64}$/.test(fingerprint ?? '') ||
  !['off', 'pcm', 'opus'].includes(audioOutput) ||
  !['pcm', 'opus'].includes(microphone) ||
  (carrier !== undefined && carrier !== '--framed')
)
  throw new Error(
    'Use owned Linux lab container, approved fingerprint, output off/pcm/opus and input pcm/opus',
  );
let bytes;
try {
  const read = async (name) =>
    JSON.parse(
      (await readFile(resolve('.local-tests', name), 'utf8')).replace(
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
    'scripts/test-xrdp-microphone.mjs',
    fingerprint,
    audioOutput,
    microphone,
    carrier ? '--private-stdin-framed' : '--private-stdin',
  ],
  { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
);
let received = 0,
  ended = false;
const timer = setTimeout(() => child.kill('SIGKILL'), 50000);
child.stdout.on('data', (chunk) => {
  received += chunk.length;
  if (received > 16384) {
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
  process.exitCode = code === 0 ? 0 : 1;
});
process.once('exit', () => {
  if (!ended) child.kill('SIGKILL');
});
