import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import {
  NativeSessionWorker,
  SessionManager,
  WorkerProcess,
} from '../packages/node-bridge/dist/index.js';
import { processQuerySnapshot } from '../packages/node-bridge/dist/process-query-gate.js';
import {
  loadResourceLabProfile,
  resourceLabRequest,
} from './resource-lab-profile.mjs';

// Explicit authorized Windows lab; no remote application launch or input.
const project = fileURLToPath(new URL('..', import.meta.url));
if (resolve('.') !== resolve(project)) throw new Error('Use the project root');
const args = process.argv.slice(2);
const profile = await loadResourceLabProfile(args, project);
const limits = resourceLabRequest(['--memory-breach', ...args]).limits;
const root = resolve(project, '.runtime/lab-resource-session');
const owner = { id: 'local-resource-lab' };
let native,
  adapter,
  closeCompleted = false;
let closeFailure = 'NONE',
  terminationCompleted = false;
class Observed extends WorkerProcess {
  samples = 0;
  connectedSamples = 0;
  peak = 0;
  rdpState;
  async sampleResidentBytes(pid, signal) {
    const value = await super.sampleResidentBytes(pid, signal);
    ++this.samples;
    if (this.rdpState === 'connected' && this.state === 'ready') {
      ++this.connectedSamples;
      this.peak = Math.max(this.peak, value);
    }
    return value;
  }
}
class Adapter extends NativeSessionWorker {
  createWorkerProcess(options) {
    native = new Observed(options);
    native.on('rdp-state', ({ state }) => {
      native.rdpState = state;
    });
    return native;
  }
  async close() {
    try {
      await super.close();
      closeCompleted = true;
    } catch (error) {
      closeFailure = [
        'IPC_CLOSE_FAILED',
        'WORKER_RESOURCE_CLOSE_FAILED',
      ].includes(error.code)
        ? error.code
        : 'CLOSE_FAILED';
      throw error;
    }
  }
  async terminate() {
    await super.terminate();
    terminationCompleted = true;
  }
}
let factories = 0;
const manager = new SessionManager({
  maxSessions: 1,
  maxPerPrincipal: 1,
  workerFactory() {
    ++factories;
    adapter = new Adapter({
      workerPath: profile.workerPath,
      runtimeRoot: root,
      ipcTransport: 'framed-pipes',
      ...limits,
    });
    return adapter;
  },
});
let control,
  media,
  credentials,
  frame,
  targetPid,
  sessionId,
  expired = false;
let certificateFailed = false,
  errors = 0;
let phase = 'configuration';
manager.on('event', (event) => {
  if (event.type === 'certificate.prompt') {
    void control
      .respondCertificate({
        challenge: event.certificate.challenge,
        fingerprint: event.certificate.fingerprint,
        accept: event.certificate.fingerprint === profile.fingerprint,
      })
      .catch(() => {
        certificateFailed = true;
      });
  }
  if (event.type === 'session.state')
    console.log(
      JSON.stringify({
        type: 'lab.registry-state',
        state: event.session.state,
      }),
    );
  if (event.type === 'session.error') ++errors;
});
const timer = setTimeout(() => {
  expired = true;
  void adapter?.terminate().catch(() => {});
}, 25000);
async function waitFor(predicate, milliseconds, allowFailed = false) {
  const deadline = performance.now() + milliseconds;
  while (!predicate()) {
    targetPid ??= native?.pid;
    if (
      expired ||
      certificateFailed ||
      performance.now() >= deadline ||
      (!allowFailed &&
        sessionId &&
        manager.get(sessionId, owner).state === 'failed')
    )
      throw new Error('LAB_REGISTRY_OBSERVATION_FAILED');
    await delay(25);
  }
}
async function localJson(name) {
  return JSON.parse(
    (await readFile(resolve(project, '.local-tests', name), 'utf8')).replace(
      /^\uFEFF/,
      '',
    ),
  );
}
try {
  const config = await localJson('xrdp-lab.json');
  if (config.host !== '192.168.21.149') throw new Error('LAB_TARGET_MISMATCH');
  credentials = await localJson('xrdp-lab.secrets.json');
  const connection = {
    target: { host: config.host, port: config.port },
    auth: { username: credentials.username, password: credentials.password },
    security: { certificatePolicy: 'prompt' },
    display: { width: 1920, height: 1080 },
    timeouts: { connectMs: 20000, tcpAckMs: 10000 },
  };
  const created = manager.create(connection, owner, '127.0.0.1');
  delete credentials.password;
  delete connection.auth.password;
  sessionId = created.sessionId;
  const spareToken = manager.mintToken(sessionId, owner, 'control').token;
  control = manager.attach(
    sessionId,
    manager.mintToken(sessionId, owner, 'control').token,
    'control',
  );
  media = manager.attach(
    sessionId,
    manager.mintToken(sessionId, owner, 'media').token,
    'media',
  );
  assert.equal(manager.statistics().active, 1);
  assert.throws(
    () =>
      manager.create(
        { target: { host: config.host }, auth: {} },
        owner,
        '127.0.0.1',
      ),
    { code: 'SESSION_LIMIT' },
  );
  assert.equal(factories, 1);
  phase = 'connection';
  await waitFor(
    () => manager.get(sessionId, owner).state === 'connected',
    7000,
  );
  targetPid = adapter.pid;
  phase = 'connected-frame';
  await delay(1000);
  await native.ping();
  frame = await media.captureFrame(0n, { codec: 'jpeg' });
  assert.ok(frame?.jpeg?.length);
  assert.equal(frame.width, 1920);
  assert.equal(frame.height, 1080);
  assert.equal(native.samples, 0);
  assert.equal(manager.get(sessionId, owner).state, 'connected');
  phase = 'resource-failure';
  await waitFor(() => manager.get(sessionId, owner).state === 'failed', 7000);
  assert.deepEqual(manager.get(sessionId, owner).error, {
    code: 'WORKER_MEMORY_LIMIT',
    message: 'Session worker memory policy exceeded',
    retryable: false,
  });
  assert.equal(errors, 1);
  assert.equal(native.samples, 1);
  assert.equal(native.connectedSamples, 1);
  assert.ok(native.peak > 1);
  phase = 'retired-authority';
  assert.throws(() => manager.mintToken(sessionId, owner, 'media'), {
    code: 'SESSION_NOT_ATTACHABLE',
  });
  assert.throws(() => manager.attach(sessionId, spareToken, 'control'), {
    code: 'ATTACH_INVALID',
  });
  phase = 'joined-close';
  await waitFor(() => manager.statistics().active === 0, 5000, true);
  assert.equal(closeCompleted, true);
  phase = 'retired-media';
  await assert.rejects(media.captureFrame(0n, { codec: 'jpeg' }), {
    code: 'ATTACH_INVALID',
  });
  assert.equal(processQuerySnapshot().active, 0);
  assert.equal(processQuerySnapshot().waiting, 0);
  phase = 'result';
  console.log(
    JSON.stringify({
      type: 'lab.registry-memory-limit',
      profile: profile.buildType,
      workerHash: profile.workerHash,
      helperHash: profile.helperHash,
      limits,
      connectedSamples: native.connectedSamples,
      peakResidentBytes: native.peak,
      image: {
        width: frame.width,
        height: frame.height,
        bytes: frame.jpeg.length,
      },
      observedFailure: 'WORKER_MEMORY_LIMIT',
      fixedFailureEnvelope: true,
      errorEvents: errors,
      overflowBeforeFactory: true,
      activeAfterJoinedClose: manager.statistics().active,
      expiredAuthorityRefused: true,
      queryOwnersEmpty: true,
    }),
  );
} catch {
  console.error(
    JSON.stringify({
      type: 'lab.registry-resource-failure',
      code: 'LAB_REGISTRY_OBSERVATION_FAILED',
      phase,
      closeFailure,
      terminationCompleted,
      sessionFailure: sessionId
        ? (manager.get(sessionId, owner).error?.code ?? 'NONE')
        : 'NONE',
    }),
  );
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  if (credentials) delete credentials.password;
  frame?.jpeg?.fill(0);
  control?.release();
  media?.release();
  let joined = true;
  try {
    await manager.shutdown();
  } catch {
    joined = false;
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
      type: 'lab.registry-cleanup',
      joined,
      runtimeEmpty: empty,
      pidRetired: retired,
    }),
  );
  if (!joined || !empty || retired === false) process.exitCode = 1;
}
