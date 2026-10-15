import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { WorkerProcess } from '../packages/node-bridge/dist/index.js';
import { readPrivateLabInput } from './private-lab-input.mjs';
import { LabRdpDiagnostics } from './lab-rdp-diagnostics.mjs';

// Authorized lab only. Inventory never reads clipboard data. The optional action
// writes one fixed synthetic value, waits for the peer ACK, then clears it.
// Neither action reads/writes the host OS clipboard or logs remote content.
const [fingerprint, action = 'inventory', inputMode, ...extra] =
  process.argv.slice(2);
if (
  extra.length ||
  !/^sha256:[0-9a-f]{64}$/.test(fingerprint ?? '') ||
  !['inventory', 'set-sentinel'].includes(action) ||
  (inputMode !== undefined &&
    !['--private-stdin', '--private-stdin-framed'].includes(inputMode))
)
  throw new Error(
    'Use approved fingerprint, inventory/set-sentinel and optional private stdin',
  );
let lab;
try {
  if (inputMode) lab = await readPrivateLabInput(process.stdin);
  else {
    const json = async (name) =>
      JSON.parse(
        (await readFile(resolve('.local-tests', name), 'utf8')).replace(
          /^\uFEFF/,
          '',
        ),
      );
    const target = await json('xrdp-lab.json'),
      credentials = await json('xrdp-lab.secrets.json');
    lab = {
      host: target.host,
      port: target.port,
      username: credentials.username,
      password: credentials.password,
    };
    delete credentials.password;
  }
} catch {
  throw new Error('Local lab input unavailable');
}
const runtimeRoot = resolve('.runtime/lab-clipboard');
const diagnostics = new LabRdpDiagnostics();
class LabWorker extends WorkerProcess {
  spawnWorker(...args) {
    const child = super.spawnWorker(...args);
    child.stderr.on('data', (b) => diagnostics.push(b));
    return child;
  }
}
const worker = new LabWorker({
  runtimeRoot,
  workerPath: resolve(
    'build/bundled/rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
  ),
  ipcTransport:
    inputMode === '--private-stdin-framed' ? 'framed-pipes' : 'auto',
});
const report = {
  actualRdp: true,
  action,
  clipboardRead: false,
  hostClipboardAccess: false,
  ready: false,
  heartbeat: false,
  closed: false,
  runtimeEmpty: false,
};
let phase = 'start',
  nativeState = 'created',
  nativeError,
  failure;
worker.on('failure', (e) => {
  failure = /^[A-Z_]{1,64}$/.test(e.code ?? '') ? e.code : 'UNCLASSIFIED';
});
worker.on('rdp-state', (s) => {
  nativeState = s.state;
  nativeError = s.error;
});
worker.on('certificate', (p) => {
  void worker
    .decideCertificate(p, p.fingerprint === fingerprint)
    .catch(() => worker.terminate());
});
const timer = setTimeout(() => worker.terminate(), 30000);
const wait = async (predicate) => {
  const deadline = Date.now() + 22000;
  while (!predicate()) {
    if (
      failure ||
      ['failed', 'closed'].includes(nativeState) ||
      Date.now() >= deadline
    )
      throw new Error('Lab completion unavailable');
    await delay(10);
  }
};
try {
  const build = await worker.start();
  if (!build.capabilities.clipboardText)
    throw new Error('Lab profile unavailable');
  report.transport = build.transport;
  phase = 'connect';
  await worker.connect({
    target: { host: lab.host, port: lab.port ?? 3389 },
    auth: { username: lab.username, password: lab.password },
    security: { certificatePolicy: 'prompt' },
    display: { width: 1920, height: 1080 },
    timeouts: { connectMs: 20000, tcpAckMs: 10000 },
    clipboard: { mode: 'bidirectional', text: true, maxItemBytes: 65536 },
  });
  delete lab.password;
  await wait(() => nativeState === 'connected');
  phase = 'clipboard';
  await wait(
    () => worker.clipboardState?.ready && !worker.clipboardState.localPending,
  );
  report.ready = true;
  if (action === 'set-sentinel') {
    phase = 'set';
    const text = Buffer.from('FreeRDP bridge clipboard smoke: Ж😀\n');
    try {
      report.set = await worker.writeClipboardText(text);
    } finally {
      text.fill(0);
    }
    if (report.set !== 'accepted') throw new Error('Lab set not accepted');
    phase = 'clear';
    report.clear = await worker.writeClipboardText(Buffer.alloc(0));
    if (report.clear !== 'accepted') throw new Error('Lab clear not accepted');
  }
  const source = worker.clipboardState;
  report.source = {
    generation: source.generation.toString(),
    revision: source.revision.toString(),
    maximum: source.maximum,
    toServer: source.toServer,
    fromServer: source.fromServer,
    remoteText: source.remoteText,
    localAccepted: source.localAccepted,
  };
  phase = 'heartbeat';
  await worker.ping();
  report.heartbeat = true;
  phase = 'close';
  await worker.close();
  report.closed = worker.state === 'closed';
  report.runtimeEmpty = (await readdir(runtimeRoot)).length === 0;
  if (!report.closed || !report.runtimeEmpty)
    throw new Error('Lab cleanup unavailable');
  console.log(JSON.stringify(report));
} catch {
  try {
    await worker.close();
    report.closed = worker.state === 'closed';
    report.runtimeEmpty = (await readdir(runtimeRoot)).length === 0;
  } catch {
    /* Report only observed cleanup; omit underlying errors. */
  }
  console.error(
    JSON.stringify({
      ...report,
      phase,
      nativeState,
      nativeError,
      failure,
      diagnostics: diagnostics.snapshot(),
    }),
  );
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  delete lab.password;
  await worker.close();
}
