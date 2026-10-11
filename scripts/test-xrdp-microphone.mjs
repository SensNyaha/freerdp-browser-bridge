import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { WorkerProcess } from '../packages/node-bridge/dist/index.js';

// Authorized lab inventory only: no microphone capture, PCM submission or remote input.
const [fingerprint, audioOutput = 'off', ...extra] = process.argv.slice(2);
if (
  extra.length ||
  !['off', 'pcm', 'opus'].includes(audioOutput) ||
  !/^sha256:[0-9a-f]{64}$/.test(fingerprint ?? '')
)
  throw new Error('Use sha256:<verified-lab-fingerprint> [off|pcm|opus]');
async function localJson(path) {
  try {
    return JSON.parse(
      (await readFile(resolve(path), 'utf8')).replace(/^\uFEFF/, ''),
    );
  } catch {
    throw new Error('Local lab configuration is missing or invalid');
  }
}
const lab = await localJson('.local-tests/xrdp-lab.json');
const credentials = await localJson('.local-tests/xrdp-lab.secrets.json');
const runtimeRoot = resolve('.runtime/lab-microphone-' + audioOutput);
const worker = new WorkerProcess({
  workerPath: resolve(
    'build/bundled/rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
  ),
  runtimeRoot,
});
const report = {
  actualRdp: true,
  microphone: 'pcm',
  audioOutput,
  microphoneStates: [],
  outputStates: [],
  capturePermissionRequested: false,
  physicalCapture: false,
  pcmSamplesSent: 0,
  remoteInputSent: false,
  remoteAudioGenerated: false,
  audibleAcceptance: false,
  heartbeat: false,
  closed: false,
  runtimeEmpty: false,
};
const scalar = (state) => ({
  enabled: state.enabled,
  availability: state.availability,
  revision: state.revision.toString(),
  epoch: state.epoch.toString(),
});
worker.on('microphone', (state) => {
  if (report.microphoneStates.length < 64)
    report.microphoneStates.push(scalar(state));
});
worker.on('audio', (event) => {
  if (event.type === 'state' && report.outputStates.length < 64)
    report.outputStates.push(scalar(event.state));
});
let timer,
  connected = false;
const activation = new Promise((done, reject) => {
  timer = setTimeout(() => reject(new Error('LAB_DEADLINE')), 25000);
  worker.on('failure', () => reject(new Error('WORKER_FAILED')));
  worker.on('rdp-state', (event) => {
    if (event.state === 'connected') {
      connected = true;
      done();
    }
    if (['failed', 'closed'].includes(event.state) && !connected)
      reject(new Error('LAB_CONNECT_FAILED'));
  });
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
try {
  const build = await worker.start();
  if (!build.capabilities.pcmInput || !build.capabilities.microphoneReset)
    throw new Error('LAB_MICROPHONE_UNSUPPORTED');
  report.capabilities = { pcmInput: true, microphoneReset: true };
  await worker.connect({
    target: { host: lab.host, port: lab.port },
    auth: { username: credentials.username, password: credentials.password },
    security: { certificatePolicy: 'prompt' },
    display: { width: 1920, height: 1080 },
    media: { microphone: 'pcm', audioOutput },
    timeouts: { connectMs: 20000, tcpAckMs: 10000 },
  });
  delete credentials.password;
  await activation;
  clearTimeout(timer);
  await delay(3000);
  await worker.ping();
  report.heartbeat = true;
  const state = worker.microphoneState;
  if (!state?.enabled) throw new Error('LAB_MICROPHONE_STATE_MISSING');
  report.inputSource = scalar(state);
  report.readyObserved = report.microphoneStates.some(
    (value) => value.availability === 'ready',
  );
  const frame = await worker.captureFrame();
  if (!frame.jpeg) throw new Error('LAB_FRAME_MISSING');
  report.display = { width: frame.width, height: frame.height };
  await worker.close();
  report.closed = worker.state === 'closed';
  report.runtimeEmpty = (await readdir(runtimeRoot)).length === 0;
  if (!report.closed || !report.runtimeEmpty)
    throw new Error('LAB_CLEANUP_FAILED');
  await writeFile(
    resolve('.local-tests/xrdp-microphone-' + audioOutput + '-report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report));
} catch {
  console.error(
    'XRDP microphone inventory failed; credentials and raw diagnostics omitted',
  );
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  delete credentials.password;
  await worker.close();
}
