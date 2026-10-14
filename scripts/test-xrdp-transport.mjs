import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { WorkerProcess } from '../packages/node-bridge/dist/index.js';

// Authorized lab only: one bounded private stdin object, never argv/env/files.
const [mode = 'strict', fingerprint, ...extra] = process.argv.slice(2);
if (
  extra.length ||
  !['strict', 'connect'].includes(mode) ||
  (mode === 'connect'
    ? !/^sha256:[a-f0-9]{64}$/.test(fingerprint ?? '')
    : fingerprint !== undefined)
)
  throw new Error(
    'Use strict or connect sha256:<already-approved-fingerprint>',
  );
let input;
try {
  const scratch = Buffer.alloc(8192);
  let count = 0;
  try {
    for await (const chunk of process.stdin) {
      if (!Buffer.isBuffer(chunk) || chunk.length > scratch.length - count)
        throw new Error();
      chunk.copy(scratch, count);
      count += chunk.length;
      chunk.fill(0);
    }
    input = JSON.parse(scratch.subarray(0, count).toString('utf8'));
  } finally {
    scratch.fill(0);
  }
  if (
    !input ||
    typeof input !== 'object' ||
    typeof input.host !== 'string' ||
    typeof input.username !== 'string' ||
    typeof input.password !== 'string'
  )
    throw new Error();
} catch {
  throw new Error('Invalid private lab input');
}
const runtimeRoot = await mkdtemp(join(tmpdir(), 'rdp-transport-lab-'));
const worker = new WorkerProcess({
  workerPath: resolve(
    'build/bundled/rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
  ),
  runtimeRoot,
});
const report = {
  actualRdp: true,
  platform: process.platform,
  transport: undefined,
  strictRejected: false,
  connected: false,
  heartbeat: false,
  jpeg: 0,
  avc: 0,
  idr: false,
  resized: false,
  restored: false,
  cleanup: false,
  states: [],
};
let original,
  restored = false,
  rejectActivation,
  resolveActivation;
const activation = new Promise((resolve, reject) => {
  resolveActivation = resolve;
  rejectActivation = reject;
});
void activation.catch(() => {});
const timer = setTimeout(() => {
  worker.terminate();
  rejectActivation(new Error('LAB_DEADLINE'));
}, 40000);
worker.on('failure', () => rejectActivation(new Error('WORKER_FAILED')));
worker.on('rdp-state', (event) => {
  if (report.states.length < 32) report.states.push(event.state);
  if (event.state === 'connected') {
    report.connected = true;
    resolveActivation(event);
  } else if (event.state === 'failed') resolveActivation(event);
});
worker.on('certificate', (prompt) => {
  void worker
    .decideCertificate(
      prompt,
      mode === 'connect' && prompt.fingerprint === fingerprint,
    )
    .catch(() => rejectActivation(new Error('LAB_CERTIFICATE_FAILED')));
});
let phase = 'start';
try {
  const build = await worker.start();
  report.transport = build.transport;
  phase = 'connect';
  await worker.connect({
    target: { host: input.host, port: input.port ?? 3389 },
    auth: { username: input.username, password: input.password },
    security: { certificatePolicy: mode === 'strict' ? 'strict' : 'prompt' },
    display: { width: 1920, height: 1080, dynamicResolution: true },
    timeouts: { connectMs: 20000, tcpAckMs: 10000 },
  });
  delete input.password;
  const activated = await activation;
  report.connectionError = activated.error;
  if (mode === 'strict') {
    if (
      activated.state !== 'failed' ||
      activated.error !== 'RDP_CERTIFICATE_REJECTED'
    )
      throw new Error('STRICT_REJECTION_MISSING');
    report.strictRejected = true;
    await worker.ping();
    report.heartbeat = true;
  } else {
    if (activated.state !== 'connected') throw new Error('ACTIVATION_FAILED');
    phase = 'frames';
    let jpeg, avc;
    for (let attempt = 0; attempt < 50; attempt++) {
      jpeg = await worker.captureFrame();
      avc = await worker.captureFrame(0n, {
        codec: 'h264',
        forceKeyframe: true,
      });
      if (jpeg.jpeg && avc.avc?.bytes && avc.avc.keyframe) break;
      await delay(100);
    }
    if (!jpeg.jpeg || !avc.avc?.bytes || !avc.avc.keyframe)
      throw new Error('MEDIA_MISSING');
    report.jpeg = jpeg.jpeg.length;
    report.avc = avc.avc.bytes.length;
    report.idr = true;
    report.width = avc.width;
    report.height = avc.height;
    phase = 'display';
    for (
      let attempt = 0;
      attempt < 80 && !worker.display?.negotiated;
      attempt++
    )
      await delay(50);
    original = worker.display;
    report.displayNegotiated = original?.negotiated === true;
    if (!original?.negotiated) throw new Error('DISPLAY_NEGOTIATION_MISSING');
    if (original?.negotiated) {
      const resize = await worker.resizeDisplay(1280, 720);
      if (resize !== 'applied') throw new Error('RESIZE_FAILED');
      const after = await worker.captureFrame(avc.revision, { codec: 'h264' });
      if (after.width !== 1280 || after.height !== 720 || !after.avc?.keyframe)
        throw new Error('RESIZED_MEDIA_MISSING');
      report.resized = true;
      if (
        (await worker.resizeDisplay(original.width, original.height)) !==
        'applied'
      )
        throw new Error('RESTORE_FAILED');
      restored = true;
      const recovered = await worker.captureFrame(after.revision, {
        codec: 'h264',
      });
      if (
        recovered.width !== original.width ||
        recovered.height !== original.height ||
        !recovered.avc?.keyframe
      )
        throw new Error('RESTORED_MEDIA_MISSING');
      report.restored = true;
    }
    await worker.ping();
    report.heartbeat = true;
  }
} catch {
  console.error(JSON.stringify({ type: 'lab.transport.failed', phase }));
  report.failedPhase = phase;
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  delete input.password;
  if (original?.negotiated && !restored && worker.state === 'ready')
    await worker.resizeDisplay(original.width, original.height).catch(() => {});
  await worker.close();
  report.cleanup = (await readdir(runtimeRoot)).length === 0;
  await rm(runtimeRoot, { recursive: true, force: true });
  console.log(JSON.stringify(report));
}
