import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { WorkerProcess } from '../packages/node-bridge/dist/index.js';
import { readPrivateLabInput } from './private-lab-input.mjs';
import { LabRdpDiagnostics } from './lab-rdp-diagnostics.mjs';

// Authorized lab only. Inventory never reads clipboard data. The optional action
// writes one fixed synthetic value, waits for the peer ACK, then clears it.
// offer-revoke uses the separately authorized fixed browser probe item and
// removes all formats instead of offering empty Unicode. No content retries.
// Neither action reads/writes the host OS clipboard or logs remote content.
const [fingerprint, action = 'inventory', inputMode, ...extra] =
  process.argv.slice(2);
if (
  extra.length ||
  !/^sha256:[0-9a-f]{64}$/.test(fingerprint ?? '') ||
  !['inventory', 'set-sentinel', 'offer-revoke'].includes(action) ||
  (inputMode !== undefined &&
    !['--private-stdin', '--private-stdin-framed'].includes(inputMode))
)
  throw new Error(
    'Use approved fingerprint, inventory/set-sentinel/offer-revoke and optional private stdin',
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
const revocationProbe = action === 'offer-revoke';
if (
  revocationProbe &&
  (!inputMode || lab.host !== '192.168.21.149' || (lab.port ?? 3389) !== 3389)
)
  throw new Error(
    'Offer/revoke requires private stdin and the authorized target',
  );
const runtimeRoot = resolve('.runtime/lab-clipboard');
const diagnostics = new LabRdpDiagnostics();
class LabWorker extends WorkerProcess {
  spawnWorker(...args) {
    const child = super.spawnWorker(...args);
    child.stderr.on('data', (b) => diagnostics.push(b));
    return child;
  }
  readClipboardText() {
    ++report.readCalls;
    throw new Error('LAB_CLIPBOARD_READ_DISABLED');
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
  writeCalls: 0,
  revokeCalls: 0,
  readCalls: 0,
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
let revokeAttempted = false;
const revoke = async () => {
  if (revokeAttempted) throw new Error('Lab revoke already attempted');
  revokeAttempted = true;
  ++report.revokeCalls;
  report.revoke = await worker.revokeClipboardText();
};
const timer = setTimeout(() => worker.terminate(), 45000);
const wait = async (predicate) => {
  const deadline = performance.now() + 22000;
  while (!predicate()) {
    if (
      failure ||
      ['failed', 'closed'].includes(nativeState) ||
      performance.now() >= deadline
    )
      throw new Error('Lab completion unavailable');
    await delay(10);
  }
};
try {
  const build = await worker.start();
  if (
    !build.capabilities.clipboardText ||
    (revocationProbe && !build.capabilities.clipboardRevoke)
  )
    throw new Error('Lab profile unavailable');
  report.transport = build.transport;
  phase = 'connect';
  await worker.connect({
    target: { host: lab.host, port: lab.port ?? 3389 },
    auth: { username: lab.username, password: lab.password },
    security: { certificatePolicy: 'prompt' },
    display: { width: 1920, height: 1080 },
    timeouts: { connectMs: 20000, tcpAckMs: 10000 },
    clipboard: {
      mode: revocationProbe ? 'browser-to-server' : 'bidirectional',
      text: true,
      maxItemBytes: revocationProbe ? 1024 : 65536,
    },
  });
  delete lab.password;
  await wait(() => nativeState === 'connected');
  phase = 'clipboard';
  await wait(
    () =>
      worker.clipboardState?.ready &&
      !worker.clipboardState.localPending &&
      !worker.clipboardState.remotePending &&
      !worker.clipboardState.localAccepted,
  );
  report.ready = true;
  const generation = worker.clipboardState.generation;
  if (
    revocationProbe &&
    (worker.clipboardState.maximum !== 1024 ||
      !worker.clipboardState.toServer ||
      worker.clipboardState.fromServer)
  )
    throw new Error('Lab clipboard policy mismatch');
  if (action === 'set-sentinel' || revocationProbe) {
    phase = 'set';
    const text = Buffer.from(
      revocationProbe
        ? 'FreeRDP browser clipboard probe Ж😀\n'
        : 'FreeRDP bridge clipboard smoke: Ж😀\n',
    );
    try {
      ++report.writeCalls;
      report.set = await worker.writeClipboardText(text);
    } finally {
      text.fill(0);
    }
    if (report.set !== 'accepted') throw new Error('Lab set not accepted');
    if (revocationProbe) {
      if (!worker.clipboardState.localAccepted)
        throw new Error('Lab accepted offer unavailable');
      phase = 'revoke';
      await revoke();
      const source = worker.clipboardState;
      report.readyAfterRevoke =
        report.revoke === 'accepted' &&
        nativeState === 'connected' &&
        source?.ready &&
        source.generation === generation &&
        !source.localAccepted &&
        !source.localPending &&
        !source.remotePending;
      if (!report.readyAfterRevoke) throw new Error('Lab revoke not accepted');
    } else {
      phase = 'clear';
      ++report.writeCalls;
      report.clear = await worker.writeClipboardText(Buffer.alloc(0));
      if (report.clear !== 'accepted')
        throw new Error('Lab clear not accepted');
    }
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
  if (revocationProbe && report.writeCalls && !revokeAttempted) {
    try {
      // One cleanup attempt after an uncertain set, never a content retry.
      await revoke();
    } catch {
      /* Failed/uncertain revoke remains a failed probe, never a disconnect ACK. */
    }
  }
  try {
    await worker.close();
    report.closed = worker.state === 'closed';
    report.runtimeEmpty = (await readdir(runtimeRoot)).length === 0;
  } catch {
    /* Report only observed cleanup; omit underlying errors. */
  }
  (revocationProbe ? console.log : console.error)(
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
