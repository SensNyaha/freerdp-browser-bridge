import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { WorkerProcess } from '../packages/node-bridge/dist/index.js';
import { readPrivateLabInput } from './private-lab-input.mjs';
import { MicrophoneNegotiationDiagnostics } from './microphone-negotiation-diagnostics.mjs';

// Authorized lab inventory only: no microphone capture, sample submission or remote input.
const [
  fingerprint,
  audioOutput = 'off',
  microphone = 'pcm',
  inputMode,
  ...extra
] = process.argv.slice(2);
if (
  extra.length ||
  !['off', 'pcm', 'opus'].includes(audioOutput) ||
  !['pcm', 'opus'].includes(microphone) ||
  (inputMode !== undefined &&
    !['--private-stdin', '--private-stdin-framed'].includes(inputMode)) ||
  !/^sha256:[0-9a-f]{64}$/.test(fingerprint ?? '')
)
  throw new Error(
    'Use sha256:<verified-lab-fingerprint> [output:off|pcm|opus] [input:pcm|opus]',
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
let lab, credentials;
if (inputMode) {
  const value = await readPrivateLabInput(process.stdin);
  lab = { host: value.host, port: value.port };
  credentials = { username: value.username, password: value.password };
  delete value.password;
} else {
  lab = await localJson('.local-tests/xrdp-lab.json');
  credentials = await localJson('.local-tests/xrdp-lab.secrets.json');
}
const reportTag = microphone === 'pcm' ? audioOutput : 'opus-' + audioOutput;
const runtimeRoot = resolve('.runtime/lab-microphone-' + reportTag);
const diagnostics = new MicrophoneNegotiationDiagnostics();
class LabWorker extends WorkerProcess {
  spawnWorker(directory, env) {
    const child = super.spawnWorker(directory, env);
    child.stderr.on('data', (bytes) => diagnostics.push(bytes));
    return child;
  }
}
const worker = new LabWorker({
  workerPath: resolve(
    'build/bundled/rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
  ),
  runtimeRoot,
  ipcTransport:
    inputMode === '--private-stdin-framed' ? 'framed-pipes' : 'auto',
});
const report = {
  actualRdp: true,
  platform: process.platform,
  microphone,
  audioOutput,
  microphoneStates: [],
  outputStates: [],
  capturePermissionRequested: false,
  physicalCapture: false,
  pcmSamplesSent: 0,
  opusPacketsSent: 0,
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
    report.nativeState = event.state;
    report.nativeError = event.error;
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
  report.transport = build.transport;
  if (
    !build.capabilities.pcmInput ||
    !build.capabilities.microphoneReset ||
    (microphone === 'opus' && !build.capabilities.opusInput)
  )
    throw new Error('LAB_MICROPHONE_UNSUPPORTED');
  report.capabilities = {
    pcmInput: true,
    microphoneReset: true,
    opusInput: build.capabilities.opusInput,
  };
  await worker.connect({
    target: { host: lab.host, port: lab.port },
    auth: { username: credentials.username, password: credentials.password },
    security: { certificatePolicy: 'prompt' },
    display: { width: 1920, height: 1080 },
    media: { microphone, audioOutput },
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
  report.negotiation = diagnostics.snapshot();
  report.closed = worker.state === 'closed';
  report.runtimeEmpty = (await readdir(runtimeRoot)).length === 0;
  if (!report.closed || !report.runtimeEmpty)
    throw new Error('LAB_CLEANUP_FAILED');
  if (!inputMode)
    await writeFile(
      resolve('.local-tests/xrdp-microphone-' + reportTag + '-report.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
  console.log(JSON.stringify(report));
} catch {
  await worker.close();
  report.negotiation = diagnostics.snapshot();
  report.closed = worker.state === 'closed';
  report.runtimeEmpty = (await readdir(runtimeRoot)).length === 0;
  if (inputMode) console.log(JSON.stringify({ ...report, failed: true }));
  console.error(
    'XRDP microphone inventory failed; credentials and raw diagnostics omitted',
  );
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  delete credentials.password;
  await worker.close();
}
