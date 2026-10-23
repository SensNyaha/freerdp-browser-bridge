import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { WorkerProcess } from '../packages/node-bridge/dist/index.js';
import { loadResourceLabProfile } from './resource-lab-profile.mjs';

const project = fileURLToPath(new URL('..', import.meta.url));
if (resolve('.') !== resolve(project)) throw new Error('Use the project root');
const profile = await loadResourceLabProfile(process.argv.slice(2), project);
const root = resolve(project, '.runtime/lab-performance');
const cases = [
  { profile: 'low-bandwidth', maxFps: 5 },
  { profile: 'balanced', maxFps: 5 },
  { profile: 'lan', maxFps: 5 },
  {
    profile: 'custom',
    maxFps: 5,
    wallpaper: true,
    fontSmoothing: false,
    desktopComposition: true,
    fullWindowDrag: false,
    menuAnimations: true,
    themes: false,
  },
];
async function localJson(name) {
  return JSON.parse(
    (await readFile(resolve(project, '.local-tests', name), 'utf8')).replace(
      /^\uFEFF/,
      '',
    ),
  );
}
async function run(quality) {
  const worker = new WorkerProcess({
    workerPath: profile.workerPath,
    runtimeRoot: root,
    ipcTransport: 'framed-pipes',
  });
  let credentials, config, frame, pid, state;
  let accepted = false;
  let timer;
  const connected = new Promise((done, reject) => {
    timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('LAB_DEADLINE'));
    }, 25000);
    worker.on('failure', () => reject(new Error('LAB_WORKER_FAILED')));
    worker.on('rdp-state', (event) => {
      state = event.state;
      if (state === 'connected') done();
      if (state === 'failed') reject(new Error('LAB_CONNECTION_FAILED'));
    });
    worker.on('certificate', (prompt) => {
      void worker
        .decideCertificate(prompt, prompt.fingerprint === profile.fingerprint)
        .catch(() => reject(new Error('LAB_CERTIFICATE_DECISION_FAILED')));
    });
  });
  void connected.catch(() => {});
  try {
    const build = await worker.start();
    pid = worker.pid;
    if (
      build.freeRdpVersion !== '3.32.1' ||
      !build.capabilities.performanceSettings
    )
      throw new Error('LAB_PERFORMANCE_UNSUPPORTED');
    const target = await localJson('xrdp-lab.json');
    if (target.host !== '192.168.21.149')
      throw new Error('LAB_TARGET_MISMATCH');
    credentials = await localJson('xrdp-lab.secrets.json');
    config = {
      target: { host: target.host, port: target.port },
      auth: { username: credentials.username, password: credentials.password },
      security: { certificatePolicy: 'prompt' },
      display: { width: 1920, height: 1080 },
      timeouts: { connectMs: 20000, tcpAckMs: 10000 },
      quality,
    };
    await worker.connect(config);
    delete credentials.password;
    delete config.auth.password;
    await connected;
    await delay(1000);
    await worker.ping();
    frame = await worker.captureFrame();
    if (
      state !== 'connected' ||
      worker.state !== 'ready' ||
      !frame.jpeg?.length ||
      frame.width !== 1920 ||
      frame.height !== 1080
    )
      throw new Error('LAB_PERFORMANCE_OBSERVATION_FAILED');
    await worker.ping();
    if (state !== 'connected' || worker.state !== 'ready')
      throw new Error('LAB_PERFORMANCE_OBSERVATION_FAILED');
    console.log(
      JSON.stringify({
        type: 'lab.performance',
        quality,
        profile: profile.buildType,
        workerHash: profile.workerHash,
        helperHash: profile.helperHash,
        image: {
          width: frame.width,
          height: frame.height,
          bytes: frame.jpeg.length,
        },
        heartbeat: true,
      }),
    );
    accepted = true;
  } catch {
    console.error(
      JSON.stringify({
        type: 'lab.performance-failure',
        quality: quality.profile,
        code: 'LAB_PERFORMANCE_OBSERVATION_FAILED',
        state: state ?? 'none',
      }),
    );
  } finally {
    clearTimeout(timer);
    if (credentials) delete credentials.password;
    if (config) delete config.auth.password;
    frame?.jpeg?.fill(0);
    let joined = true;
    try {
      await worker.close();
    } catch {
      joined = false;
    }
    let empty = false;
    try {
      empty = (await readdir(root)).length === 0;
    } catch (error) {
      empty = error.code === 'ENOENT';
    }
    let retired = pid === undefined ? null : false;
    if (pid !== undefined) {
      try {
        process.kill(pid, 0);
      } catch (error) {
        retired = error.code === 'ESRCH';
      }
    }
    console.log(
      JSON.stringify({
        type: 'lab.performance-cleanup',
        quality: quality.profile,
        joined,
        runtimeEmpty: empty,
        pidRetired: retired,
      }),
    );
    accepted &&= joined && empty && retired === true;
  }
  return accepted;
}
for (const quality of cases) {
  if (!(await run(quality))) {
    process.exitCode = 1;
    break;
  }
}
