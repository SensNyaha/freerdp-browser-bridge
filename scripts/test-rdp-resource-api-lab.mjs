import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import {
  NativeSessionWorker,
  WorkerProcess,
} from '../packages/node-bridge/dist/index.js';
import { MAX_JPEG_BYTES } from '../packages/protocol/dist/index.js';
import { processQuerySnapshot } from '../packages/node-bridge/dist/process-query-gate.js';
import { createSessionServer } from '../apps/bridge-api/dist/session-server.js';
import {
  loadResourceLabProfile,
  resourceApiLabRequest,
} from './resource-lab-profile.mjs';
import { connectedCpuLoad } from './connected-cpu-load.mjs';
import { viewerLabFiles, requireOwnedLabTarget } from './viewer-lab-files.mjs';

const project = fileURLToPath(new URL('..', import.meta.url));
if (resolve('.') !== resolve(project)) throw new Error('Use the project root');
const args = process.argv.slice(2);
const labFiles = viewerLabFiles(process.env.BRIDGE_LAB_PROFILE);
const mode = resourceApiLabRequest(args);
const profile = await loadResourceLabProfile(mode.nativeArgs, project);
const limits = mode.limits;
const { WebSocket } = createRequire(
  new URL('../apps/bridge-api/package.json', import.meta.url),
)('ws');
const root = resolve(project, '.runtime/lab-resource-api');
const origin = 'https://ui.example.test';
const authorization = 'Bearer ' + randomBytes(32).toString('base64url');
let native,
  adapter,
  closeCompleted = false;
let nativeFailure;
class Observed extends WorkerProcess {
  samples = 0;
  connectedSamples = 0;
  peak = 0;
  rdpState;
  totalCpuSamples = 0;
  cpuSamples = 0;
  firstMicros;
  lastMicros;
  async sampleCpuMicros(pid, signal) {
    const value = await super.sampleCpuMicros(pid, signal);
    ++this.totalCpuSamples;
    if (this.rdpState === 'connected' && this.state === 'ready') {
      ++this.cpuSamples;
      this.firstMicros ??= value;
      this.lastMicros = value;
    }
    return value;
  }
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
    native.on('failure', (error) => {
      nativeFailure = [
        'WORKER_CPU_LIMIT',
        'WORKER_MEMORY_LIMIT',
        'WORKER_RESOURCE_UNAVAILABLE',
      ].includes(error.code)
        ? error.code
        : 'WORKER_FAILED';
    });
    return native;
  }
  async close() {
    await super.close();
    closeCompleted = true;
  }
}
let factories = 0;
const workerOptions = {
  workerPath: profile.workerPath,
  runtimeRoot: root,
  ipcTransport: 'framed-pipes',
  ...limits,
};
const server = await createSessionServer({
  worker: workerOptions,
  authenticate: (request) =>
    request.headers.authorization === authorization
      ? { id: 'local-resource-api-lab' }
      : undefined,
  allowedOrigins: [origin],
  sessions: {
    maxSessions: 1,
    maxPerPrincipal: 1,
    workerFactory() {
      ++factories;
      adapter = new Adapter(workerOptions);
      return adapter;
    },
  },
  logDestination: new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  }),
});
const request = (method, url, payload) =>
  server.inject({
    method,
    url,
    headers: { authorization },
    ...(payload === undefined ? {} : { payload }),
  });
const sockets = [];
let credentials,
  connection,
  targetPid,
  expired = false,
  callbackFailed = false;
let phase = 'configuration',
  frames = 0,
  firstFrameBytes = 0,
  width = 0,
  height = 0;
let controlSequence = 0,
  errorCount = 0,
  publicFailure;
const timer = setTimeout(() => {
  expired = true;
  native?.terminate();
  for (const ws of sockets) ws.terminate();
}, 25000);
async function waitFor(predicate, milliseconds) {
  const deadline = performance.now() + milliseconds;
  while (!predicate()) {
    targetPid ??= native?.pid;
    if (expired || callbackFailed || performance.now() >= deadline)
      throw new Error('LAB_API_OBSERVATION_FAILED');
    await delay(25);
  }
}
async function localJson(name) {
  return JSON.parse(
    (await readFile(resolve(project, name), 'utf8')).replace(/^\uFEFF/, ''),
  );
}
async function refusedUpgrade(url, token) {
  return new Promise((done, reject) => {
    const ws = new WebSocket(url, ['freerdp-bridge-v1'], {
      origin,
      headers: { authorization: 'Bearer ' + token },
    });
    const bound = setTimeout(() => {
      ws.terminate();
      reject(new Error('LAB_RETIRED_TOKEN_ACCEPTED'));
    }, 3000);
    ws.on('error', () => {});
    ws.on('open', () => {
      clearTimeout(bound);
      ws.terminate();
      reject(new Error('LAB_RETIRED_TOKEN_ACCEPTED'));
    });
    ws.on('unexpected-response', (_request, response) => {
      clearTimeout(bound);
      response.resume();
      ws.terminate();
      done(response.statusCode);
    });
  });
}
try {
  const config = await localJson(labFiles.config);
  if (labFiles.ownedContainer) requireOwnedLabTarget(config);
  else if (config.host !== '192.168.21.149')
    throw new Error('LAB_TARGET_MISMATCH');
  credentials = await localJson(labFiles.credentials);
  connection = {
    target: { host: config.host, port: config.port },
    auth: { username: credentials.username, password: credentials.password },
    security: { certificatePolicy: 'prompt' },
    display: { width: 1920, height: 1080 },
    timeouts: { connectMs: 20000, tcpAckMs: 10000 },
  };
  await server.listen({ host: '127.0.0.1', port: 0 });
  const createdResponse = await request('POST', '/v1/sessions', connection);
  delete credentials.password;
  delete connection.auth.password;
  assert.equal(createdResponse.statusCode, 202);
  const created = createdResponse.json(),
    path = '/v1/sessions/' + created.sessionId;
  const base = 'ws://127.0.0.1:' + server.server.address().port + path;
  const spareResponse = await request('POST', path + '/attach-token', {
    channel: 'media',
  });
  assert.equal(spareResponse.statusCode, 200);
  const spare = spareResponse.json().token;
  const overflow = await request('POST', '/v1/sessions', {
    target: { host: config.host },
    auth: {},
  });
  assert.equal(overflow.statusCode, 429);
  assert.equal(overflow.json().code, 'SESSION_LIMIT');
  assert.equal(factories, 1);
  phase = 'public-connection';
  const closes = [];
  for (const channel of ['control', 'media']) {
    const ws = new WebSocket(base + '/' + channel, ['freerdp-bridge-v1'], {
      origin,
      headers: { authorization: 'Bearer ' + created.attach[channel].token },
      maxPayload: channel === 'control' ? 4096 : MAX_JPEG_BYTES + 64,
    });
    sockets.push(ws);
    ws.on('error', () => {});
    const closed = once(ws, 'close');
    void closed.catch(() => {});
    closes.push(closed);
    ws.on('message', (bytes, binary) => {
      try {
        if (channel === 'control') {
          assert.equal(binary, false);
          const event = JSON.parse(bytes.toString());
          if (event.type === 'certificate.prompt')
            ws.send(
              JSON.stringify({
                v: 1,
                type: 'certificate.response',
                seq: ++controlSequence,
                ts: Date.now(),
                data: {
                  challenge: event.data.challenge,
                  fingerprint: event.data.fingerprint,
                  accept: event.data.fingerprint === profile.fingerprint,
                },
              }),
            );
          if (event.type === 'session.error') {
            ++errorCount;
            publicFailure = event.data;
          }
        } else if (binary) {
          assert.ok(bytes.length >= 28 && bytes.length <= MAX_JPEG_BYTES + 28);
          assert.equal(bytes.toString('ascii', 0, 4), 'RWB1');
          assert.equal(bytes[4], 1);
          assert.equal(bytes.readUInt32BE(8), 1);
          assert.equal(bytes.readUInt32BE(24), bytes.length - 28);
          if (bytes[5] === 1) {
            assert.equal(bytes.length, 36);
            assert.equal(bytes[28], 1);
            assert.equal(bytes[29], 2);
            width = bytes.readUInt16BE(30);
            height = bytes.readUInt16BE(32);
          } else {
            assert.equal(bytes[5], 2);
            assert.equal(width, 1920);
            assert.equal(height, 1080);
            assert.ok(bytes.length >= 32);
            assert.equal(bytes.readUInt16BE(28), 0xffd8);
            assert.equal(bytes.readUInt16BE(bytes.length - 2), 0xffd9);
            if (frames === 0) {
              assert.equal(native.samples, 0);
              assert.equal(native.totalCpuSamples, 0);
              firstFrameBytes = bytes.length - 28;
            }
            ++frames;
            ws.send(
              JSON.stringify({
                v: 1,
                type: 'media.ack',
                data: { sequence: bytes.readUInt32BE(12) },
              }),
            );
          }
        } else {
          const event = JSON.parse(bytes.toString());
          if (event.type === 'media.error') callbackFailed = true;
        }
      } catch {
        callbackFailed = true;
      } finally {
        bytes.fill(0);
      }
    });
    await once(ws, 'open');
    if (channel === 'media')
      ws.send(
        JSON.stringify({
          v: 1,
          type: 'media.hello',
          data: { codecs: ['jpeg'] },
        }),
      );
  }
  await waitFor(() => frames > 0, 7000);
  targetPid = adapter.pid;
  let completedPings;
  if (mode.cpuBreach) {
    phase = 'connected-cpu-baseline';
    await waitFor(
      () => native.cpuSamples >= 1 && native.connectedSamples >= 1,
      7000,
    );
    phase = 'connected-cpu-load';
    completedPings = await connectedCpuLoad(
      native,
      () => (callbackFailed ? 'failed' : native.rdpState),
      () => nativeFailure,
    );
  }
  phase = 'resource-failure';
  const closeResults = await Promise.all(closes);
  assert.equal(callbackFailed, false);
  assert.equal(expired, false);
  for (const [code, reason] of closeResults) {
    assert.equal(code, 1000);
    assert.equal(reason.toString(), 'session terminal');
  }
  const expected = {
    code: mode.cpuBreach ? 'WORKER_CPU_LIMIT' : 'WORKER_MEMORY_LIMIT',
    message: mode.cpuBreach
      ? 'Session worker CPU policy exceeded'
      : 'Session worker memory policy exceeded',
    retryable: false,
  };
  assert.equal(errorCount, 1);
  assert.deepEqual(publicFailure, expected);
  if (mode.cpuBreach) {
    assert.ok(native.connectedSamples >= 1);
    assert.ok(native.peak <= limits.maxResidentBytes);
  } else {
    assert.equal(native.samples, 1);
    assert.equal(native.connectedSamples, 1);
  }
  assert.ok(native.peak > 1);
  const snapshot = await request('GET', path);
  assert.equal(snapshot.statusCode, 200);
  assert.equal(snapshot.headers['cache-control'], 'no-store');
  assert.equal(snapshot.json().state, 'failed');
  assert.deepEqual(snapshot.json().error, expected);
  const tokenResult = await request('POST', path + '/attach-token', {
    channel: 'control',
  });
  assert.equal(tokenResult.statusCode, 409);
  assert.equal(tokenResult.json().code, 'SESSION_NOT_ATTACHABLE');
  assert.equal(await refusedUpgrade(base + '/media', spare), 401);
  phase = 'joined-close';
  await waitFor(() => closeCompleted, 5000);
  assert.equal(processQuerySnapshot().active, 0);
  assert.equal(processQuerySnapshot().waiting, 0);
  console.log(
    JSON.stringify({
      type: mode.cpuBreach ? 'lab.api-cpu-limit' : 'lab.api-memory-limit',
      profile: profile.buildType,
      workerHash: profile.workerHash,
      helperHash: profile.helperHash,
      limits,
      connectedSamples: native.connectedSamples,
      ...(mode.cpuBreach
        ? {
            cpuSamples: native.cpuSamples,
            cpuGrowthMicros: native.lastMicros - native.firstMicros,
            completedPings,
            baselineConnected: true,
          }
        : {}),
      peakResidentBytes: native.peak,
      frames,
      image: { width, height, bytes: firstFrameBytes },
      observedFailure: expected.code,
      errorEvents: errorCount,
      terminalChannels: closeResults.length,
      snapshotStatus: snapshot.statusCode,
      tokenStatus: tokenResult.statusCode,
      retiredUpgradeStatus: 401,
      overflowBeforeFactory: true,
      joinedClose: true,
      queryOwnersEmpty: true,
    }),
  );
} catch {
  console.error(
    JSON.stringify({
      type: 'lab.api-resource-failure',
      code: 'LAB_API_OBSERVATION_FAILED',
      phase,
    }),
  );
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  if (credentials) delete credentials.password;
  if (connection) delete connection.auth.password;
  for (const ws of sockets) ws.terminate();
  let joined = true;
  try {
    await server.close();
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
      type: 'lab.api-cleanup',
      joined,
      runtimeEmpty: empty,
      pidRetired: retired,
    }),
  );
  if (!joined || !empty || retired === false) process.exitCode = 1;
}
