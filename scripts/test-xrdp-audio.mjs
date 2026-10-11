import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { WorkerProcess } from '../packages/node-bridge/dist/index.js';

// Authorized local lab only. No remote input or sound-generation commands.
const [fingerprint, audioOutput = 'pcm', ...extra] = process.argv.slice(2);
if (
  extra.length ||
  !['pcm', 'opus'].includes(audioOutput) ||
  !/^sha256:[0-9a-f]{64}$/.test(fingerprint ?? '')
)
  throw new Error('Use sha256:<verified-lab-fingerprint> [pcm|opus]');
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
  workerPath: resolve('build/bundled/rdp-worker.exe'),
  runtimeRoot: resolve('.runtime/lab-audio'),
});
const report = {
  actualRdp: true,
  audioOutput,
  browserPlayback: false,
  audibleAcceptance: false,
  states: [],
  configs: 0,
  packets: 0,
  frames: 0,
  closed: false,
  heartbeat: false,
};
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
worker.on('audio', (event) => {
  if (event.type === 'state') {
    if (report.states.length < 64)
      report.states.push({
        availability: event.state.availability,
        revision: event.state.revision.toString(),
        epoch: event.state.epoch.toString(),
      });
  } else if (event.type === 'config') report.configs++;
  else {
    report.packets++;
    report.frames += event.packet.frames;
  }
});
try {
  await worker.start();
  await worker.connect({
    target: { host: config.host, port: config.port },
    auth: { username: credentials.username, password: credentials.password },
    security: { certificatePolicy: 'prompt' },
    media: { audioOutput },
    timeouts: { connectMs: 20000, tcpAckMs: 10000 },
  });
  delete credentials.password;
  await activation;
  clearTimeout(timer);
  await delay(3000);
  await worker.ping();
  report.heartbeat = true;
  if (!worker.audioState) throw new Error('LAB_AUDIO_STATE_MISSING');
  if (worker.build.capabilities.audioReset)
    report.resetResult = await worker.resetAudio(worker.audioState.epoch);
  const frame = await worker.captureFrame();
  if (!frame.jpeg) throw new Error('LAB_FRAME_MISSING');
  report.display = { width: frame.width, height: frame.height };
  await worker.close();
  report.closed = worker.state === 'closed';
  report.terminalSource = worker.audioState?.availability;
  if (!report.closed) throw new Error('LAB_CLEANUP_FAILED');
  await writeFile(
    resolve(
      audioOutput === 'opus'
        ? '.local-tests/xrdp-audio-opus-report.json'
        : '.local-tests/xrdp-audio-report.json',
    ),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report));
} catch {
  console.error(
    'XRDP audio lab check failed; credentials and raw diagnostics omitted',
  );
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  delete credentials.password;
  await worker.close();
}
