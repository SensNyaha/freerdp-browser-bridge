import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { WorkerProcess } from '../packages/node-bridge/dist/index.js';
import { AudioNegotiationDiagnostics } from './audio-negotiation-diagnostics.mjs';
import { LabRdpDiagnostics } from './lab-rdp-diagnostics.mjs';
import { readPrivateLabInput } from './private-lab-input.mjs';

// Authorized local lab only. No remote input or sound-generation commands.
const [
  fingerprint,
  audioOutput = 'pcm',
  bufferMs = '120',
  inputMode,
  ...extra
] = process.argv.slice(2);
if (
  extra.length ||
  !['pcm', 'opus'].includes(audioOutput) ||
  !['120', '200'].includes(bufferMs) ||
  !/^sha256:[0-9a-f]{64}$/.test(fingerprint ?? '') ||
  (inputMode !== undefined &&
    !['--private-stdin', '--private-stdin-framed'].includes(inputMode))
)
  throw new Error('Use sha256:<verified-lab-fingerprint> [pcm|opus] [120|200]');
async function localJson(path) {
  try {
    return JSON.parse(
      (await readFile(resolve(path), 'utf8')).replace(/^\uFEFF/, ''),
    );
  } catch {
    throw new Error('Local lab configuration is missing or invalid');
  }
}
let config, credentials;
if (inputMode) {
  const value = await readPrivateLabInput(process.stdin);
  config = { host: value.host, port: value.port };
  credentials = { username: value.username, password: value.password };
  delete value.password;
} else {
  config = await localJson('.local-tests/xrdp-lab.json');
  credentials = await localJson('.local-tests/xrdp-lab.secrets.json');
}
const report = {
  actualRdp: true,
  audioOutput,
  audioOutputBufferMs: Number(bufferMs),
  browserPlayback: false,
  audibleAcceptance: false,
  states: [],
  configs: 0,
  packets: 0,
  frames: 0,
  closed: false,
  heartbeat: false,
  faultKinds: [],
  channelError: undefined,
  clock: undefined,
  resetReadyRequested: false,
  resetFreshConfig: false,
  resetFreshPacket: false,
  pcmNonzero: audioOutput === 'pcm' ? false : undefined,
};
const audioNegotiation = new AudioNegotiationDiagnostics();
class LabWorker extends WorkerProcess {
  spawnWorker(directory, env) {
    const child = super.spawnWorker(directory, env);
    child.stderr.on('data', (bytes) => {
      rdpDiagnostics.push(bytes);
      report.rdpFailure = rdpDiagnostics.snapshot();
      // Match only fixed code-owned fault messages. Never retain/forward raw upstream logs.
      const summaryAt = bytes.indexOf(
        Buffer.from('bridge.audio.summary chunks='),
      );
      audioNegotiation.push(bytes);
      const negotiation = audioNegotiation.snapshot();
      if (negotiation) report.negotiation = negotiation;
      const summary =
        summaryAt < 0
          ? null
          : bytes
              .subarray(summaryAt, Math.min(bytes.length, summaryAt + 256))
              .toString('ascii')
              .match(
                /^bridge\.audio\.summary chunks=(\d{1,20}) overflow=(\d{1,20}) skipped=(\d{1,20}) late=(\d{1,20}) revisions=(\d{1,20}) resets=(\d{1,20}) packets=(\d{1,20})\r?\n/,
              );
      if (summary)
        report.nativeCounters = Object.fromEntries(
          [
            'chunks',
            'overflow',
            'skipped',
            'late',
            'revisions',
            'resets',
            'packets',
          ].map((key, index) => [key, summary[index + 1]]),
        );
      const causesAt = bytes.indexOf(Buffer.from('bridge.audio.causes first='));
      const causes =
        causesAt < 0
          ? null
          : bytes
              .subarray(causesAt, Math.min(bytes.length, causesAt + 384))
              .toString('ascii')
              .match(
                /^bridge\.audio\.causes first=(\d{1,20}) profile=(\d{1,20}) block=(\d{1,20}) arrivalBackward=(\d{1,20}) arrivalGap=(\d{1,20}) timestampBackward=(\d{1,20}) timestampGap=(\d{1,20}) formats=(\d{1,20}) close=(\d{1,20})\r?\n/,
              );
      if (causes)
        report.nativeCauses = Object.fromEntries(
          [
            'first',
            'profile',
            'block',
            'arrivalBackward',
            'arrivalGap',
            'timestampBackward',
            'timestampGap',
            'formats',
            'close',
          ].map((key, index) => [key, causes[index + 1]]),
        );
      const prefix = Buffer.from('bridge.audio.guard fault=');
      const at = bytes.indexOf(prefix);
      if (at >= 0) {
        const digit = bytes[at + prefix.length];
        if (digit >= 48 && digit <= 55) {
          const kind = 'AUDIO_GUARD_' + (digit - 48);
          if (!report.faultKinds.includes(kind)) report.faultKinds.push(kind);
        }
      }
      const channelPrefix = Buffer.from('bridge.rdp.channel_error=');
      const channelAt = bytes.indexOf(channelPrefix);
      if (channelAt >= 0) {
        let value = 0,
          count = 0;
        for (
          let pos = channelAt + channelPrefix.length;
          pos < bytes.length && count < 10;
          ++pos
        ) {
          const digit = bytes[pos] - 48;
          if (digit < 0 || digit > 9) break;
          value = value * 10 + digit;
          ++count;
        }
        if (count && value <= 0xffffffff) report.channelError = value;
      }
      const clockPrefix = Buffer.from('bridge.audio.clock rate=');
      const clockAt = bytes.indexOf(clockPrefix);
      if (clockAt >= 0) {
        const line = bytes
          .subarray(clockAt, Math.min(bytes.length, clockAt + 100))
          .toString('ascii');
        const match =
          /^bridge\.audio\.clock rate=(\d{1,5}) frames=(\d{1,5}) align=(\d)\r?\n/.exec(
            line,
          );
        if (match)
          report.clock = {
            rate: Number(match[1]),
            frames: Number(match[2]),
            align: Number(match[3]),
          };
      }
    });
    return child;
  }
}
const rdpDiagnostics = new LabRdpDiagnostics();
const worker = new LabWorker({
  workerPath: resolve(
    'build/bundled/rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
  ),
  runtimeRoot: resolve('.runtime/lab-audio'),
  ipcTransport:
    inputMode === '--private-stdin-framed' ? 'framed-pipes' : 'auto',
});
let timer,
  resetEpoch,
  connected = false,
  phase = 'start',
  nativeState = 'created',
  nativeError,
  workerFailure;
const activation = new Promise((done, reject) => {
  timer = setTimeout(() => reject(new Error('LAB_DEADLINE')), 25000);
  worker.on('failure', (error) => {
    workerFailure = /^[A-Z_]{1,64}$/.test(error.code ?? '')
      ? error.code
      : 'UNCLASSIFIED';
    reject(new Error('WORKER_FAILED'));
  });
  worker.on('rdp-state', (event) => {
    nativeState = event.state;
    nativeError = event.error;
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
  } else if (event.type === 'config') {
    report.configs++;
    if (resetEpoch !== undefined && event.config.epoch > resetEpoch)
      report.resetFreshConfig = true;
  } else {
    report.packets++;
    report.frames += event.packet.frames;
    if (resetEpoch !== undefined && event.packet.epoch > resetEpoch)
      report.resetFreshPacket = true;
    if (event.packet.pcm?.some((byte) => byte !== 0)) report.pcmNonzero = true;
  }
});
try {
  const build = await worker.start();
  report.platform = build.os;
  report.transport = build.transport;
  phase = 'connect';
  await worker.connect({
    target: { host: config.host, port: config.port },
    auth: { username: credentials.username, password: credentials.password },
    security: { certificatePolicy: 'prompt' },
    display: { width: 1920, height: 1080 },
    media: { audioOutput, audioOutputBufferMs: Number(bufferMs) },
    timeouts: { connectMs: 20000, tcpAckMs: 10000 },
  });
  delete credentials.password;
  phase = 'activate';
  await activation;
  clearTimeout(timer);
  phase = 'observe';
  const observeUntil = performance.now() + 10000;
  while (performance.now() < observeUntil) {
    if (
      !report.resetReadyRequested &&
      worker.build.capabilities.audioReset &&
      worker.audioState?.availability === 'ready'
    ) {
      phase = 'reset';
      report.resetReadyRequested = true;
      resetEpoch = worker.audioState.epoch;
      // Exactly one attempt; never retry an uncertain reset or any sample packet.
      report.resetResult = await worker.resetAudio(resetEpoch);
      phase = 'observe';
    }
    await delay(20);
  }
  phase = 'heartbeat';
  await worker.ping();
  report.heartbeat = true;
  if (!worker.audioState) throw new Error('LAB_AUDIO_STATE_MISSING');
  phase = 'frame';
  const frame = await worker.captureFrame();
  if (!frame.jpeg) throw new Error('LAB_FRAME_MISSING');
  report.display = { width: frame.width, height: frame.height };
  phase = 'close';
  await worker.close();
  report.closed = worker.state === 'closed';
  report.terminalSource = worker.audioState?.availability;
  if (!report.closed) throw new Error('LAB_CLEANUP_FAILED');
  if (!inputMode)
    await writeFile(
      resolve(
        '.local-tests/xrdp-audio' +
          (audioOutput === 'opus' ? '-opus' : '') +
          (bufferMs === '200' ? '-200' : '') +
          '-report.json',
      ),
      JSON.stringify(report, null, 2) + '\n',
    );
  console.log(JSON.stringify(report));
} catch {
  if (inputMode)
    console.log(
      JSON.stringify({
        ...report,
        failedPhase: phase,
        nativeState,
        nativeError,
        workerFailure,
      }),
    );
  console.error(
    JSON.stringify({
      type: 'lab.audio.failure',
      phase,
      nativeState,
      nativeError,
      workerFailure,
      ...report,
    }),
  );
  console.error(
    'XRDP audio lab check failed; credentials and raw diagnostics omitted',
  );
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  delete credentials.password;
  await worker.close();
}
