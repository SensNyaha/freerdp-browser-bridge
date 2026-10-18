import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { WorkerProcess } from '../packages/node-bridge/dist/index.js';
import { setTimeout as delay } from 'node:timers/promises';
import { requireLabCoreResult } from './lab-core-result.mjs';

// User-authorized local lab exception. Never print or pass credentials in argv/env.
const args = process.argv.slice(2);
const mode = args[0] ?? 'strict';
const connectMode = mode === 'connect' || mode === 'memory';
if (
  !['strict', 'inspect', 'connect', 'memory'].includes(mode) ||
  (connectMode
    ? args.length !== 2 || !/^sha256:[0-9a-f]{64}$/.test(args[1])
    : args.length > 1)
)
  throw new Error(
    'Use strict, inspect, connect or memory sha256:<verified-fingerprint>',
  );
async function localJson(path) {
  try {
    return JSON.parse(
      (await readFile(resolve(path), 'utf8')).replace(/^\uFEFF/, ''),
    );
  } catch {
    throw new Error('Local lab configuration is missing or invalid');
  }
}
const config = await localJson('.local-tests/xrdp-lab.json');
const credentials = await localJson('.local-tests/xrdp-lab.secrets.json');
let lastState;
class LabWorker extends WorkerProcess {
  connectedSamples = 0;
  peakResidentBytes = 0;
  async sampleResidentBytes(pid, signal) {
    const bytes = await super.sampleResidentBytes(pid, signal);
    if (lastState === 'connected' && this.state === 'ready') {
      ++this.connectedSamples;
      this.peakResidentBytes = Math.max(this.peakResidentBytes, bytes);
    }
    return bytes;
  }
}
const residentLimit = 256 * 1024 * 1024;
const runtimeRoot = resolve(
  mode === 'memory' ? '.runtime/lab-memory' : '.runtime/lab',
);
const worker = new LabWorker({
  workerPath: resolve(
    'build/bundled/rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
  ),
  runtimeRoot,
  ...(mode === 'memory'
    ? { maxResidentBytes: residentLimit, residentPollIntervalMs: 100 }
    : {}),
});
let timer;
const completion = new Promise((done, reject) => {
  timer = setTimeout(() => reject(new Error('LAB_DEADLINE')), 25000);
  worker.on('failure', () => reject(new Error('WORKER_FAILED')));
  worker.on('rdp-state', (event) => {
    lastState = event.state;
    console.log(JSON.stringify(event));
    if (event.state === 'connected' || event.state === 'failed') done(event);
  });
  worker.on('certificate', (prompt) => {
    console.log(JSON.stringify({ type: 'certificate.prompt', ...prompt }));
    if (mode === 'inspect') {
      done({ state: 'inspected' });
      return;
    }
    void worker
      .decideCertificate(prompt, connectMode && args[1] === prompt.fingerprint)
      .catch(() => reject(new Error('CERTIFICATE_DECISION_FAILED')));
  });
});
// Start may fail before the completion promise is awaited.
void completion.catch(() => {});
try {
  await worker.start();
  await worker.connect({
    target: { host: config.host, port: config.port },
    auth: { username: credentials.username, password: credentials.password },
    security: { certificatePolicy: mode === 'strict' ? 'strict' : 'prompt' },
    ...(mode === 'memory' ? { display: { width: 1920, height: 1080 } } : {}),
    timeouts: { connectMs: 20000, tcpAckMs: 10000 },
  });
  delete credentials.password;
  const result = await completion;
  requireLabCoreResult(mode, result);
  if (mode === 'strict') await worker.ping();
  if (connectMode) {
    if (result.state !== 'connected') process.exitCode = 1;
    else {
      await delay(3000);
      await worker.ping();
      const frame = await worker.captureFrame();
      if (!frame.jpeg) throw new Error('LAB_FRAME_MISSING');
      if (mode === 'memory' && (frame.width !== 1920 || frame.height !== 1080))
        throw new Error('LAB_MEMORY_DISPLAY_MISMATCH');
      await writeFile(resolve('.local-tests/xrdp-frame.jpg'), frame.jpeg, {
        mode: 0o600,
      });
      let revision = frame.revision;
      let changed = 1,
        unchanged = 0,
        bytes = frame.jpeg.length;
      for (let i = 0; i < 40; i++) {
        const next = await worker.captureFrame(revision);
        if (next.jpeg) {
          changed++;
          bytes += next.jpeg.length;
        } else unchanged++;
        revision = next.revision;
      }
      await worker.ping();
      if (
        mode === 'memory' &&
        (worker.connectedSamples < 3 ||
          worker.peakResidentBytes < 1 ||
          worker.peakResidentBytes > residentLimit)
      )
        throw new Error('LAB_CONNECTED_MEMORY_POLICY_FAILED');
      if (lastState !== 'connected') process.exitCode = 1;
      else
        console.log(
          JSON.stringify({
            type: 'lab.activation',
            connected: true,
            heartbeat: true,
            image: {
              width: frame.width,
              height: frame.height,
              changed,
              unchanged,
              bytes,
            },
            ...(mode === 'memory'
              ? {
                  memoryPolicy: {
                    maximum: residentLimit,
                    intervalMs: 100,
                    connectedSamples: worker.connectedSamples,
                    peakResidentBytes: worker.peakResidentBytes,
                  },
                }
              : {}),
          }),
        );
    }
  }
} catch {
  console.error(
    'XRDP lab check failed; credentials and raw diagnostics omitted',
  );
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  delete credentials.password;
  await worker.close();
  if (mode === 'memory') {
    const empty = (await readdir(runtimeRoot)).length === 0;
    console.log(
      JSON.stringify({ type: 'lab.memory-cleanup', runtimeEmpty: empty }),
    );
    if (!empty) process.exitCode = 1;
  }
}
