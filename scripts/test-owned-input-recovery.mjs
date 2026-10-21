import { open, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { WorkerProcess } from '../packages/node-bridge/dist/index.js';
import { viewerWorkerOptions } from './viewer-worker-options.mjs';
import { viewerLabFiles, requireOwnedLabTarget } from './viewer-lab-files.mjs';
import { ownedInputStateReader } from './owned-xrdp-pointer.mjs';

// Requires a real held button left by the separately controlled own RDP loss.
// The observer never injects release. Only the new worker can clear that state.
const root = resolve('.runtime/owned-input-recovery');
const readJson = async (path) => {
  const file = await open(path, 'r');
  const bytes = Buffer.alloc(8193);
  try {
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead > 8192) throw new Error();
    return JSON.parse(bytes.subarray(0, bytesRead).toString('utf8'));
  } finally {
    bytes.fill(0);
    await file.close();
  }
};
let worker, credentials, timer, pid;
let phase = 'configuration';
const requireResult = (ok) => {
  if (!ok) throw new Error('LAB_OWNED_RECOVERY_FAILED');
};
try {
  requireResult(process.argv.length === 3);
  const files = viewerLabFiles('owned-container');
  const target = await readJson(files.config);
  requireOwnedLabTarget(target);
  const lab = await readJson('.local-tests/owned-xrdp-lab.receipt.json');
  requireResult(lab.v === 1 && /^sha256:[0-9a-f]{64}$/.test(lab.fingerprint));
  const readInput = await ownedInputStateReader();
  const before = await readInput();
  phase = 'held-precondition';
  requireResult(before.buttons === 1);
  credentials = await readJson(files.credentials);
  const { options, profile } = await viewerWorkerOptions(
    process.argv[2],
    resolve('.'),
  );
  options.runtimeRoot = root;
  worker = new WorkerProcess(options);
  const connected = new Promise((done, reject) => {
    worker.on('rdp-state', (state) => {
      if (state.state === 'connected') done();
      else if (['failed', 'closed'].includes(state.state))
        reject(new Error('LAB_OWNED_RECOVERY_CONNECT_FAILED'));
    });
    worker.on('failure', () =>
      reject(new Error('LAB_OWNED_RECOVERY_NATIVE_FAILED')),
    );
  });
  void connected.catch(() => {});
  worker.on('certificate', (prompt) => {
    void worker
      .decideCertificate(prompt, prompt.fingerprint === lab.fingerprint)
      .catch(() => worker.terminate());
  });
  timer = setTimeout(() => worker.terminate(), 30000);
  phase = 'connect';
  await worker.start();
  pid = worker.pid;
  await worker.connect({
    target: { host: target.host, port: target.port },
    auth: { username: credentials.username, password: credentials.password },
    display: { width: 1920, height: 1080 },
    security: { certificatePolicy: 'prompt' },
    timeouts: { connectMs: 20000, tcpAckMs: 10000 },
  });
  delete credentials.password;
  await connected;
  await worker.ping();
  // Match fresh viewer control initialization after its desktop has rendered.
  // XRDP activation precedes its backend attachment; an immediate connect-time
  // send alone is not proof that the remote application consumed the reset.
  await worker.captureFrame();
  await delay(1500);
  await worker.sendInput({ type: 'reset' });
  phase = 'remote-release';
  const deadline = performance.now() + 5000;
  let after;
  do {
    after = await readInput();
    if (!after.controlLeft && after.buttons === 0) break;
    await delay(250);
  } while (performance.now() < deadline);
  console.log(
    JSON.stringify({
      type: 'lab.owned-input-recovery',
      before,
      after,
      workerHash: profile.workerHash,
      observerInjectedInput: false,
      freshControllerReset: true,
    }),
  );
  requireResult(!after.controlLeft && after.buttons === 0);
} catch {
  console.error(
    JSON.stringify({ type: 'lab.owned-input-recovery.failure', phase }),
  );
  process.exitCode = 1;
} finally {
  if (credentials) delete credentials.password;
  clearTimeout(timer);
  await worker?.close();
  let pidRetired = !pid;
  if (pid) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      pidRetired = error.code === 'ESRCH';
    }
  }
  const runtimeEmpty = await readdir(root).then(
    (entries) => entries.length === 0,
    () => !worker,
  );
  console.log(
    JSON.stringify({
      type: 'lab.owned-input-recovery.cleanup',
      pidRetired,
      runtimeEmpty,
    }),
  );
  if (!pidRetired || !runtimeEmpty) process.exitCode = 1;
}
