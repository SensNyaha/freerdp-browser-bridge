import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { WorkerProcess } from '../packages/node-bridge/dist/index.js';
// Authorized lab credentials stay in ignored files/private IPC. Never send touch.
const fingerprint = process.argv[2];
if (
  process.argv.length !== 3 ||
  !/^sha256:[0-9a-f]{64}$/.test(fingerprint ?? '')
)
  throw new Error('Pass verified certificate fingerprint');
const local = async (path) =>
  JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
const lab = await local('.local-tests/xrdp-lab.json');
const credentials = await local('.local-tests/xrdp-lab.secrets.json');
const worker = new WorkerProcess({
  workerPath: resolve(
    'build/bundled/rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
  ),
  runtimeRoot: resolve('.runtime/touch-lab'),
});
worker.on('certificate', (prompt) => {
  void worker
    .decideCertificate(prompt, prompt.fingerprint === fingerprint)
    .catch(() => worker.terminate());
});
let timer;
try {
  await worker.start();
  const completion = Promise.race([
    once(worker, 'touch'),
    once(worker, 'failure').then(() => {
      throw new Error('WORKER_FAILED');
    }),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('LAB_DEADLINE')), 25000);
    }),
  ]);
  void completion.catch(() => {});
  await worker.connect({
    target: { host: lab.host, port: lab.port },
    auth: { username: credentials.username, password: credentials.password },
    input: { touch: true },
    security: { certificatePolicy: 'prompt' },
    display: { width: 1920, height: 1080 },
  });
  delete credentials.password;
  await completion;
  await delay(3000);
  const state = worker.touch;
  if (!state) throw new Error('LAB_TOUCH_STATUS_MISSING');
  await worker.ping();
  const frame = await worker.captureFrame();
  if (!frame.jpeg) throw new Error('LAB_FRAME_MISSING');
  console.log(
    JSON.stringify({
      type: 'lab.touch-inventory',
      availability: state.availability,
      enabled: state.enabled,
      width: state.width,
      height: state.height,
      maxContacts: state.maxContacts,
      heartbeat: true,
      frame: true,
      remoteTouchSent: false,
    }),
  );
} catch {
  console.error(
    'XRDP touch inventory failed; raw diagnostics and credentials omitted',
  );
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  delete credentials.password;
  await worker.close();
}
