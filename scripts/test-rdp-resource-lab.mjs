import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { WorkerProcess } from '../packages/node-bridge/dist/index.js';
import {
  loadResourceLabProfile,
  resourceLabRequest,
} from './resource-lab-profile.mjs';
import { connectedCpuLoad } from './connected-cpu-load.mjs';
import { requireConnectedMemoryBreach } from './connected-memory-result.mjs';

// Explicit authorized lab only. Credentials stay in ignored files/private IPC.
const project = fileURLToPath(new URL('..', import.meta.url));
if (resolve('.') !== resolve(project)) throw new Error('Use the project root');
const request = resourceLabRequest(process.argv.slice(2));
const profile = await loadResourceLabProfile(request.nativeArgs, project);
const root = resolve(project, '.runtime/lab-resources');
const limits = request.limits;
let lastState;
class ResourceWorker extends WorkerProcess {
  residentSamples = 0;
  totalResidentSamples = 0;
  cpuSamples = 0;
  totalCpuSamples = 0;
  peakResidentBytes = 0;
  firstMicros;
  lastMicros;
  async sampleResidentBytes(pid, signal) {
    const value = await super.sampleResidentBytes(pid, signal);
    ++this.totalResidentSamples;
    if (lastState === 'connected' && this.state === 'ready') {
      ++this.residentSamples;
      this.peakResidentBytes = Math.max(this.peakResidentBytes, value);
    }
    return value;
  }
  async sampleCpuMicros(pid, signal) {
    const value = await super.sampleCpuMicros(pid, signal);
    ++this.totalCpuSamples;
    if (lastState === 'connected' && this.state === 'ready') {
      ++this.cpuSamples;
      this.firstMicros ??= value;
      this.lastMicros = value;
    }
    return value;
  }
}
const worker = new ResourceWorker({
  workerPath: profile.workerPath,
  runtimeRoot: root,
  ipcTransport: 'framed-pipes',
  ...limits,
});
let timer, credentials, frame, targetPid, failureCode;
const completion = new Promise((done, reject) => {
  timer = setTimeout(() => {
    worker.terminate();
    reject(new Error('LAB_DEADLINE'));
  }, 25000);
  worker.on('failure', (error) => {
    failureCode = [
      'WORKER_CPU_LIMIT',
      'WORKER_MEMORY_LIMIT',
      'WORKER_RESOURCE_UNAVAILABLE',
      'WORKER_RESOURCE_CLOSE_FAILED',
    ].includes(error.code)
      ? error.code
      : 'WORKER_FAILED';
    reject(new Error('LAB_WORKER_FAILED'));
  });
  worker.on('rdp-state', (event) => {
    lastState = event.state;
    console.log(
      JSON.stringify({ type: 'lab.resource-state', state: event.state }),
    );
    if (event.state === 'connected') done();
    if (event.state === 'failed') reject(new Error('LAB_CONNECTION_FAILED'));
  });
  worker.on('certificate', (prompt) => {
    void worker
      .decideCertificate(prompt, prompt.fingerprint === profile.fingerprint)
      .catch(() => reject(new Error('LAB_CERTIFICATE_DECISION_FAILED')));
  });
});
void completion.catch(() => {});
async function localJson(name) {
  return JSON.parse(
    (await readFile(resolve(project, '.local-tests', name), 'utf8')).replace(
      /^\uFEFF/,
      '',
    ),
  );
}
try {
  const build = await worker.start();
  targetPid = worker.pid;
  if (
    build.freeRdpVersion !== '3.32.1' ||
    build.capabilities.connectCore !== true
  )
    throw new Error('LAB_NATIVE_CORE_UNAVAILABLE');
  const config = await localJson('xrdp-lab.json');
  if (config.host !== '192.168.21.149') throw new Error('LAB_TARGET_MISMATCH');
  credentials = await localJson('xrdp-lab.secrets.json');
  await worker.connect({
    target: { host: config.host, port: config.port },
    auth: { username: credentials.username, password: credentials.password },
    security: { certificatePolicy: 'prompt' },
    display: { width: 1920, height: 1080 },
    timeouts: { connectMs: 20000, tcpAckMs: 10000 },
  });
  delete credentials.password;
  await completion;
  if (request.cpuBreach || request.memoryBreach) {
    await delay(1000);
    await worker.ping();
    frame = await worker.captureFrame();
    if (
      !frame.jpeg?.length ||
      frame.width !== 1920 ||
      frame.height !== 1080 ||
      worker.totalCpuSamples !== 0 ||
      worker.totalResidentSamples !== 0 ||
      lastState !== 'connected' ||
      worker.state !== 'ready'
    )
      throw new Error('LAB_RESOURCE_BASELINE_TOO_EARLY');
  }
  if (request.memoryBreach) {
    const sampleDeadline = performance.now() + 7000;
    while (failureCode === undefined && worker.state === 'ready') {
      if (lastState !== 'connected' || performance.now() >= sampleDeadline)
        throw new Error('LAB_MEMORY_LIMIT_NOT_OBSERVED');
      await delay(25);
    }
    requireConnectedMemoryBreach(worker, failureCode);
    console.log(
      JSON.stringify({
        type: 'lab.connected-memory-limit',
        profile: profile.buildType,
        workerHash: profile.workerHash,
        helperHash: profile.helperHash,
        sourceHash: profile.sourceHash,
        limits,
        residentSamples: worker.residentSamples,
        totalResidentSamples: worker.totalResidentSamples,
        peakResidentBytes: worker.peakResidentBytes,
        image: {
          width: frame.width,
          height: frame.height,
          bytes: frame.jpeg.length,
        },
        heartbeat: true,
        observedFailure: failureCode,
      }),
    );
  } else if (request.cpuBreach) {
    const baselineDeadline = performance.now() + 7000;
    while (worker.cpuSamples < 1 || worker.residentSamples < 1) {
      if (
        lastState !== 'connected' ||
        worker.state !== 'ready' ||
        performance.now() >= baselineDeadline
      )
        throw new Error('LAB_CPU_BASELINE_NOT_CONNECTED');
      await delay(50);
    }
    const completedPings = await connectedCpuLoad(
      worker,
      () => lastState,
      () => failureCode,
    );
    console.log(
      JSON.stringify({
        type: 'lab.connected-cpu-limit',
        profile: profile.buildType,
        workerHash: profile.workerHash,
        helperHash: profile.helperHash,
        sourceHash: profile.sourceHash,
        limits,
        baselineConnected: true,
        cpuSamples: worker.cpuSamples,
        cpuGrowthMicros: worker.lastMicros - worker.firstMicros,
        completedPings,
        image: {
          width: frame.width,
          height: frame.height,
          bytes: frame.jpeg.length,
        },
        observedFailure: failureCode,
      }),
    );
  } else {
    const until = performance.now() + 10000;
    while (worker.cpuSamples < 8 || worker.residentSamples < 8) {
      if (
        lastState !== 'connected' ||
        worker.state !== 'ready' ||
        performance.now() >= until
      )
        throw new Error('LAB_RESOURCE_OBSERVATION_FAILED');
      await delay(50);
    }
    await worker.ping();
    frame = await worker.captureFrame();
    if (
      !frame.jpeg?.length ||
      frame.width !== 1920 ||
      frame.height !== 1080 ||
      worker.peakResidentBytes < 1 ||
      worker.peakResidentBytes > limits.maxResidentBytes ||
      worker.lastMicros < worker.firstMicros ||
      lastState !== 'connected' ||
      worker.state !== 'ready'
    )
      throw new Error('LAB_RESOURCE_OBSERVATION_FAILED');
    await worker.ping();
    if (lastState !== 'connected' || worker.state !== 'ready')
      throw new Error('LAB_RESOURCE_OBSERVATION_FAILED');
    console.log(
      JSON.stringify({
        type: 'lab.resource-smoke',
        profile: profile.buildType,
        workerHash: profile.workerHash,
        helperHash: profile.helperHash,
        sourceHash: profile.sourceHash,
        limits,
        cpuSamples: worker.cpuSamples,
        residentSamples: worker.residentSamples,
        cpuGrowthMicros: worker.lastMicros - worker.firstMicros,
        peakResidentBytes: worker.peakResidentBytes,
        image: {
          width: frame.width,
          height: frame.height,
          bytes: frame.jpeg.length,
        },
        heartbeat: true,
      }),
    );
  }
} catch {
  console.error(
    JSON.stringify({
      type: 'lab.resource-failure',
      code: failureCode ?? 'LAB_RESOURCE_SMOKE_FAILED',
      rdpState: lastState ?? 'none',
    }),
  );
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  if (credentials) delete credentials.password;
  frame?.jpeg?.fill(0);
  let closed = true;
  try {
    await worker.close();
  } catch {
    closed = false;
    process.exitCode = 1;
  }
  let empty = false;
  try {
    empty = (await readdir(root)).length === 0;
  } catch (error) {
    empty = error.code === 'ENOENT';
  }
  let retired = targetPid === undefined ? null : false;
  if (targetPid !== undefined) {
    try {
      process.kill(targetPid, 0);
    } catch (error) {
      retired = error.code === 'ESRCH';
    }
  }
  console.log(
    JSON.stringify({
      type: 'lab.resource-cleanup',
      joined: closed,
      runtimeEmpty: empty,
      pidRetired: retired,
    }),
  );
  if (!closed || !empty || retired === false) process.exitCode = 1;
}
