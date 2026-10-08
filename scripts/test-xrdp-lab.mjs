import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { WorkerProcess } from '../packages/node-bridge/dist/index.js';
import { setTimeout as delay } from 'node:timers/promises';

// User-authorized local lab exception. Never print or pass credentials in argv/env.
const args = process.argv.slice(2);
const mode = args[0] ?? 'strict';
if (
  !['strict', 'inspect', 'connect'].includes(mode) ||
  (mode === 'connect'
    ? args.length !== 2 || !/^sha256:[0-9a-f]{64}$/.test(args[1])
    : args.length > 1)
)
  throw new Error(
    'Use strict, inspect, or connect sha256:<verified-fingerprint>',
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
const worker = new WorkerProcess({
  workerPath: resolve(
    'build/bundled/rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
  ),
  runtimeRoot: resolve('.runtime/lab'),
});
let timer;
let lastState;
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
      .decideCertificate(
        prompt,
        mode === 'connect' && args[1] === prompt.fingerprint,
      )
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
    timeouts: { connectMs: 20000, tcpAckMs: 10000 },
  });
  delete credentials.password;
  const result = await completion;
  if (mode === 'connect') {
    if (result.state !== 'connected') process.exitCode = 1;
    else {
      await delay(3000);
      await worker.ping();
      if (lastState !== 'connected') process.exitCode = 1;
      else
        console.log(
          JSON.stringify({
            type: 'lab.activation',
            connected: true,
            heartbeat: true,
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
}
