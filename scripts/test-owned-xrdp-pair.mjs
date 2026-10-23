import { open, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { WorkerProcess } from '../packages/node-bridge/dist/index.js';
import { viewerWorkerOptions } from './viewer-worker-options.mjs';
import { requireOwnedLabTarget, viewerLabFiles } from './viewer-lab-files.mjs';

// Two actual private Node/native RDP sessions on the owned fixture only.
const readJson = async (path) => {
  const bytes = Buffer.alloc(8193);
  const file = await open(path, 'r');
  try {
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead > 8192) throw new Error('LAB_OWNED_PAIR_INPUT_REFUSED');
    return JSON.parse(bytes.subarray(0, bytesRead).toString('utf8'));
  } finally {
    bytes.fill(0);
    await file.close();
  }
};
const root = resolve('.runtime/owned-xrdp-pair');
const workers = [],
  pids = [],
  states = [],
  frames = [0, 0],
  bytes = [0, 0];
const displays = [
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
];
let phase = 'configuration',
  credentials,
  timer,
  passed = false;
const requireResult = (ok) => {
  if (!ok) throw new Error('LAB_OWNED_PAIR_FAILED');
};
try {
  requireResult(process.argv.length === 3);
  const files = viewerLabFiles('owned-container');
  const target = await readJson(files.config);
  requireOwnedLabTarget(target);
  const lab = await readJson('.local-tests/owned-xrdp-lab.receipt.json');
  requireResult(lab.v === 1 && /^sha256:[0-9a-f]{64}$/.test(lab.fingerprint));
  credentials = await readJson(files.credentials);
  requireResult(credentials.username === 'bridge-lab');
  const { options, profile } = await viewerWorkerOptions(
    process.argv[2],
    resolve('.'),
  );
  options.runtimeRoot = root;
  timer = setTimeout(() => {
    for (const worker of workers) worker.terminate();
  }, 45000);
  phase = 'connect';
  const pending = displays.map(async (display, index) => {
    const worker = new WorkerProcess(options);
    workers[index] = worker;
    const connected = new Promise((done, reject) => {
      worker.on('rdp-state', (value) => {
        states[index] = value.state;
        if (value.state === 'connected') done();
        else if (value.state === 'failed')
          reject(new Error('LAB_OWNED_PAIR_CONNECT_FAILED'));
      });
      worker.on('failure', () =>
        reject(new Error('LAB_OWNED_PAIR_NATIVE_FAILED')),
      );
    });
    void connected.catch(() => {});
    worker.on('certificate', (prompt) => {
      void worker
        .decideCertificate(prompt, prompt.fingerprint === lab.fingerprint)
        .catch(() => worker.terminate());
    });
    await worker.start();
    pids[index] = worker.pid;
    await worker.connect({
      target: { host: target.host, port: target.port },
      auth: {
        username: index === 0 ? 'bridge-lab' : 'bridge-lab-2',
        password: credentials.password,
      },
      display,
      security: { certificatePolicy: 'prompt' },
      timeouts: { connectMs: 20000, tcpAckMs: 10000 },
    });
    await connected;
  });
  const started = await Promise.allSettled(pending);
  delete credentials.password;
  requireResult(started.every((value) => value.status === 'fulfilled'));
  requireResult(
    pids.every((pid) => Number.isSafeInteger(pid) && pid > 0) &&
      pids[0] !== pids[1],
  );
  const sample = async (index) => {
    requireResult(states[index] === 'connected');
    await workers[index].ping();
    const frame = await workers[index].captureFrame();
    requireResult(
      frame?.jpeg?.length > 0 &&
        frame.width === displays[index].width &&
        frame.height === displays[index].height,
    );
    frames[index]++;
    bytes[index] += frame.jpeg.length;
  };
  phase = 'coexistence';
  await delay(2000);
  for (let round = 0; round < 5; round++) {
    const values = await Promise.allSettled([sample(0), sample(1)]);
    requireResult(values.every((value) => value.status === 'fulfilled'));
    await delay(1000);
  }
  phase = 'sibling-retirement';
  workers[1].terminate();
  await workers[1].close();
  for (let round = 0; round < 3; round++) {
    await sample(0);
    await delay(500);
  }
  console.log(
    JSON.stringify({
      type: 'lab.owned-pair',
      privateNativeSessions: 2,
      distinctPids: true,
      displays,
      frames,
      bytes,
      survivorAfterSiblingRetirement: true,
      workerHash: profile.workerHash,
    }),
  );
  passed = true;
} catch {
  console.error(
    JSON.stringify({ type: 'lab.owned-pair.failure', phase, states }),
  );
  process.exitCode = 1;
} finally {
  if (credentials) delete credentials.password;
  clearTimeout(timer);
  const closed = await Promise.allSettled(
    workers.map((worker) => worker.close()),
  );
  const pidRetired = pids.every((pid) => {
    try {
      process.kill(pid, 0);
      return false;
    } catch (error) {
      return error.code === 'ESRCH';
    }
  });
  const runtimeEmpty = await readdir(root).then(
    (entries) => entries.length === 0,
    () => false,
  );
  const joined = closed.every((value) => value.status === 'fulfilled');
  console.log(
    JSON.stringify({
      type: 'lab.owned-pair.cleanup',
      joined,
      pidRetired,
      runtimeEmpty,
    }),
  );
  if (!passed || !joined || !pidRetired || !runtimeEmpty) process.exitCode = 1;
}
