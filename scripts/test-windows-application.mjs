import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { WorkerProcess } from '../packages/node-bridge/dist/index.js';
import { physicalScancode } from '../packages/protocol/dist/input.js';
import { requireWindowsLabReadback } from './windows-lab-readback.mjs';

// Authorized Windows lab only: user-opened fresh unsaved Notepad, fixed synthetic data,
// private credentials, no host clipboard, arbitrary command or remote file path.
const [fingerprint, ...extra] = process.argv.slice(2);
if (
  process.platform !== 'win32' ||
  extra.length ||
  !/^sha256:[0-9a-f]{64}$/.test(fingerprint ?? '')
)
  throw new Error('Use the previously approved lab fingerprint');
const json = async (name) => {
  try {
    return JSON.parse(
      (await readFile(resolve('.local-tests', name), 'utf8')).replace(
        /^\uFEFF/,
        '',
      ),
    );
  } catch {
    throw new Error('LAB_CONFIGURATION_UNAVAILABLE');
  }
};
const lab = await json('xrdp-lab.json');
if (lab.host !== '192.168.21.149' || (lab.port ?? 3389) !== 3389)
  throw new Error('Windows application test requires the authorized target');
const credentials = await json('xrdp-lab.secrets.json');
const runtimeRoot = resolve('.runtime/windows-app-lab');
const worker = new WorkerProcess({
  workerPath: resolve('build/bundled/rdp-worker.exe'),
  runtimeRoot,
  ipcTransport: 'framed-pipes',
});
const report = {
  actualRdp: true,
  endpoint: 'windows',
  applicationProvidedByUser: true,
  hostClipboardAccess: false,
  arbitraryRemoteCommand: false,
  remoteFileSaved: false,
  unicodeReadback: false,
  clipboardPasteReadback: false,
  physicalKeysResetReadback: false,
  mouseFocusReadback: false,
  emptyOfferAck: false,
  revokeAck: false,
  operatorCloseConfirmed: false,
  heartbeat: false,
  runtimeEmpty: false,
};
let phase = 'connect',
  connected = false,
  failed = false,
  timer;
const activation = new Promise((done, reject) => {
  worker.on('rdp-state', (state) => {
    connected = state.state === 'connected';
    if (connected) done();
    else if (state.state === 'failed') reject(new Error('LAB_CONNECT_FAILED'));
  });
  worker.on('failure', () => reject(new Error('LAB_WORKER_FAILED')));
  worker.on('certificate', (prompt) => {
    if (prompt.fingerprint !== fingerprint) {
      reject(new Error('LAB_CERTIFICATE_CHANGED'));
      return;
    }
    void worker
      .decideCertificate(prompt, true)
      .catch(() => reject(new Error('LAB_CERTIFICATE_REPLY_FAILED')));
  });
});
void activation.catch(() => {});
async function wait(predicate) {
  const end = performance.now() + 6500;
  while (!predicate()) {
    if (!connected || performance.now() >= end)
      throw new Error('LAB_WAIT_FAILED');
    await delay(20);
  }
}
async function key(code, down) {
  await worker.sendInput({
    type: 'key',
    scancode: physicalScancode(code),
    down,
    repeat: false,
  });
}
async function chord(...codes) {
  try {
    for (const code of codes) await key(code, true);
    for (const code of [...codes].reverse()) await key(code, false);
  } catch {
    await worker.sendInput({ type: 'reset' });
    throw new Error('LAB_INPUT_FAILED');
  }
}
async function image(tag) {
  await delay(350);
  const frame = await worker.captureFrame();
  if (!frame.jpeg || frame.width !== 1920 || frame.height !== 1080)
    throw new Error('LAB_FRAME_MISSING');
  await writeFile(
    resolve('.local-tests/windows-app-' + tag + '.jpg'),
    frame.jpeg,
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      type: 'lab.windows-application.frame',
      phase: tag,
      width: frame.width,
      height: frame.height,
    }),
  );
}
async function clear() {
  await chord('ControlLeft', 'KeyA');
  await chord('Backspace');
}
async function copyAndCheck(expected, control = 'ControlLeft') {
  const revision = worker.clipboardState.revision;
  await chord(control, 'KeyA');
  await chord(control, 'KeyC');
  await wait(
    () =>
      worker.clipboardState.remoteText &&
      worker.clipboardState.revision > revision,
  );
  const result = await worker.readClipboardText(worker.clipboardState.revision);
  requireWindowsLabReadback(result, expected);
}
async function action(name) {
  phase = name;
  if (name === 'unicode') {
    await clear();
    const text = 'FreeRDP Bridge 303 — Привет 日本語 😀';
    await worker.sendInput({ type: 'text', text });
    await copyAndCheck(text);
    report.unicodeReadback = true;
  } else if (name === 'paste') {
    const text = 'CLIPRDR 303 — Тест 日本語 😀';
    const bytes = Buffer.from(text);
    try {
      if ((await worker.writeClipboardText(bytes)) !== 'accepted')
        throw new Error('LAB_OFFER_FAILED');
    } finally {
      bytes.fill(0);
    }
    await clear();
    await chord('ControlLeft', 'KeyV');
    await delay(250);
    await copyAndCheck(text);
    report.clipboardPasteReadback = true;
  } else if (name === 'keyboard') {
    await clear();
    await chord('ShiftLeft', 'Digit1');
    await chord('Digit2');
    await key('ControlLeft', true);
    await worker.sendInput({ type: 'reset' });
    await chord('Digit3');
    await copyAndCheck('!23', 'ControlRight');
    report.physicalKeysResetReadback = true;
  } else if (name === 'mouse') {
    await chord('MetaLeft');
    await delay(200);
    await worker.sendInput({ type: 'move', x: 1000, y: 300 });
    await worker.sendInput({
      type: 'button',
      x: 1000,
      y: 300,
      button: 0,
      down: true,
    });
    await worker.sendInput({
      type: 'button',
      x: 1000,
      y: 300,
      button: 0,
      down: false,
    });
    await clear();
    await worker.sendInput({ type: 'text', text: 'Mouse focus 303' });
    await copyAndCheck('Mouse focus 303');
    report.mouseFocusReadback = true;
  } else if (name === 'close') {
    await clear();
    report.emptyOfferAck =
      (await worker.writeClipboardText(Buffer.alloc(0))) === 'accepted';
    report.revokeAck = (await worker.revokeClipboardText()) === 'accepted';
    if (!report.emptyOfferAck || !report.revokeAck)
      throw new Error('LAB_REVOKE_FAILED');
    await chord('AltLeft', 'F4');
  }
  await image(name);
  console.log(
    JSON.stringify({
      type: 'lab.windows-application.step',
      phase: name,
      failed,
    }),
  );
}
const scratch = Buffer.alloc(32);
try {
  timer = setTimeout(() => {
    worker.terminate();
    process.stdin.destroy();
  }, 300000);
  const build = await worker.start();
  if (
    !build.capabilities.basicInput ||
    !build.capabilities.unicodeInput ||
    !build.capabilities.clipboardText ||
    !build.capabilities.clipboardRevoke
  )
    throw new Error('LAB_CAPABILITY_MISSING');
  await worker.connect({
    target: { host: lab.host, port: lab.port ?? 3389 },
    auth: { username: credentials.username, password: credentials.password },
    security: { certificatePolicy: 'prompt' },
    display: { width: 1920, height: 1080 },
    clipboard: { mode: 'bidirectional', text: true, maxItemBytes: 1024 },
    timeouts: { connectMs: 20000, tcpAckMs: 10000 },
  });
  delete credentials.password;
  await activation;
  await wait(
    () => worker.clipboardState?.ready && !worker.clipboardState.localPending,
  );
  phase = 'desktop';
  await image('desktop');
  const steps = ['unicode', 'paste', 'keyboard', 'mouse', 'close', 'finish'];
  let step = 0,
    length = 0,
    consumed = 0,
    finished = false;
  console.log(
    JSON.stringify({
      type: 'lab.windows-application.ready',
      next: steps[step],
    }),
  );
  for await (const chunk of process.stdin) {
    if (!Buffer.isBuffer(chunk) || (consumed += chunk.length) > 512)
      throw new Error('LAB_COMMAND_INVALID');
    for (const byte of chunk) {
      if (byte === 13) continue;
      if (byte !== 10) {
        if (byte < 97 || byte > 122 || length >= scratch.length)
          throw new Error('LAB_COMMAND_INVALID');
        scratch[length++] = byte;
        continue;
      }
      const command = scratch.subarray(0, length).toString('ascii');
      scratch.fill(0);
      length = 0;
      if (command === 'snapshot') {
        await image('inspect');
        continue;
      }
      if (command === 'abort') {
        failed = true;
        finished = true;
        phase = 'abort';
        break;
      }
      if (command !== steps[step]) throw new Error('LAB_COMMAND_INVALID');
      if (command === 'finish') {
        report.operatorCloseConfirmed = true;
        finished = true;
        break;
      }
      try {
        await action(command);
        ++step;
      } catch {
        failed = true;
        console.log(
          JSON.stringify({ type: 'lab.windows-application.failed', phase }),
        );
        await image('failure');
        if (command === 'close') step = steps.indexOf('finish');
        else step = steps.indexOf('close');
      }
      console.log(
        JSON.stringify({
          type: 'lab.windows-application.ready',
          next: steps[step],
        }),
      );
    }
    if (finished) break;
  }
  if (!finished) throw new Error('LAB_FINISH_MISSING');
  await worker.ping();
  report.heartbeat = true;
} catch {
  failed = true;
  console.log(
    JSON.stringify({ type: 'lab.windows-application.failed', phase }),
  );
} finally {
  clearTimeout(timer);
  delete credentials.password;
  scratch.fill(0);
  try {
    if (connected) await worker.sendInput({ type: 'reset' });
  } catch {
    failed = true;
  }
  await worker.close();
  report.runtimeEmpty = (await readdir(runtimeRoot)).length === 0;
  await writeFile(
    resolve('.local-tests/windows-app-report.json'),
    JSON.stringify({ ...report, failed }, null, 2) + '\n',
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      type: 'lab.windows-application.result',
      ...report,
      failed,
    }),
  );
  if (failed || !report.runtimeEmpty) process.exitCode = 1;
  process.stdin.destroy();
}
