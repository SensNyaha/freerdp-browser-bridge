import { spawnSync } from 'node:child_process';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Writable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { viewerWorkerOptions } from './viewer-worker-options.mjs';

// Manual, independently owned negative peer. Never reads external lab files or
// the host clipboard. The image must first be built from the existing fixture.
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const [action, receipt, ...extra] = process.argv.slice(2);
if (
  process.platform !== 'win32' ||
  process.versions.node.split('.')[0] !== '24' ||
  resolve('.') !== root ||
  action !== '--owned-xrdp-peer' ||
  extra.length ||
  !/^build[\\/]native-clean-[A-Za-z0-9_-]+[\\/]receipt\.json$/.test(
    receipt ?? '',
  )
)
  throw new Error(
    'Use --owned-xrdp-peer and a clean linked native receipt at the project root',
  );
const { options, profile } = await viewerWorkerOptions(receipt, root);
const { createSessionServer } = await import(
  '../apps/bridge-api/dist/session-server.js'
);
const { NativeSessionWorker } = await import(
  '../packages/node-bridge/dist/index.js'
);
const { decodeClipboardChunk } = await import(
  '../packages/protocol/dist/index.js'
);
const { WebSocket } = createRequire(
  new URL('../apps/bridge-api/package.json', import.meta.url),
)('ws');
const nonce = randomBytes(12).toString('hex'),
  bearer = randomBytes(32).toString('base64url');
options.runtimeRoot = resolve('.runtime/html-xrdp-peer-' + nonce);
const image = 'freerdp-bridge-html-xrdp-peer:lab',
  origin = 'http://owned-html-peer.invalid',
  label = 'freerdp-bridge.owned-html-peer';
const report = {
  schema: 1,
  scope:
    'Actual owned XRDP negative HTML peer with explicit public Unicode control',
  actualRdp: true,
  hostClipboardAccess: false,
  externalLabFilesRead: false,
  htmlSelected: false,
  peerRemoteHtml: false,
  unicodeAvailable: false,
  htmlRefused: false,
  noImplicitFallback: false,
  explicitUnicodeRead: false,
  runtimeEmpty: false,
  pidRetired: false,
  ownedContainerRemoved: false,
  passed: false,
  native: {
    receipt,
    sourceHash: profile.sourceHash,
    workerHash: profile.workerHash,
  },
};
let container, server, backend, ws, config, source, workerPid;
let phase = 'prepare',
  state = 'created',
  htmlReads = 0,
  textReads = 0,
  sequence = 0;
let protocolFailed = false,
  expired = false;
const messages = [],
  binary = [];
const requireResult = (value) => {
  if (!value) throw new Error('HTML_PEER_CHECK_FAILED');
};
function command(args, input, timeout = 30000) {
  const result = spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    timeout,
    maxBuffer: 1048576,
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error('HTML_PEER_DOCKER_FAILED');
  return result.stdout.trim();
}
async function wait(predicate, ms = 15000) {
  const end = performance.now() + ms;
  while (!predicate()) {
    if (
      expired ||
      protocolFailed ||
      ['failed', 'closed'].includes(state) ||
      performance.now() >= end
    )
      throw new Error('HTML_PEER_WAIT_FAILED');
    await delay(20);
  }
}
function send(type, data) {
  const seq = sequence++;
  ws.send(JSON.stringify({ v: 1, type, seq, ts: Date.now(), data }));
  return seq;
}
async function press(...codes) {
  for (const code of codes)
    send('input.key', { code, down: true, repeat: false });
  for (const code of [...codes].reverse())
    send('input.key', { code, down: false, repeat: false });
  await delay(200);
}
async function event(type, requestSeq) {
  const matches = (message) =>
    message.type === type && message.data.requestSeq === requestSeq;
  await wait(() => messages.some(matches));
  return messages.find(matches).data;
}
const watchdog = setTimeout(() => {
  expired = true;
  void backend?.terminate().catch(() => {});
  ws?.terminate();
}, 120000);
watchdog.unref();
try {
  phase = 'owned-container';
  const identity = JSON.parse(command(['image', 'inspect', image]))[0].Id;
  requireResult(/^sha256:[0-9a-f]{64}$/.test(identity));
  report.image = identity;
  report.dockerfileHash = createHash('sha256')
    .update(await readFile('tests/fixtures/xrdp-lab/Dockerfile.unicode'))
    .digest('hex');
  container = command([
    'run',
    '--detach',
    '--name',
    'freerdp-bridge-html-peer-' + nonce,
    '--label',
    label + '=1',
    '--init',
    '--publish',
    '127.0.0.1:3393:3389',
    '--cpus',
    '2',
    '--memory',
    '2g',
    '--pids-limit',
    '256',
    '--shm-size',
    '128m',
    '--security-opt',
    'no-new-privileges',
    identity,
  ]);
  requireResult(/^[0-9a-f]{64}$/.test(container));
  const inspected = JSON.parse(command(['container', 'inspect', container]))[0];
  const ports = inspected.NetworkSettings.Ports['3389/tcp'];
  requireResult(
    inspected.Config.Labels[label] === '1' &&
      inspected.Mounts.length === 0 &&
      ports.length === 1 &&
      ports[0].HostIp === '127.0.0.1' &&
      ports[0].HostPort === '3393',
  );
  const password = randomBytes(24).toString('base64url'),
    input = Buffer.from('bridge-lab:' + password + '\n');
  try {
    command(['exec', '-i', container, 'chpasswd'], input);
  } finally {
    input.fill(0);
  }
  command([
    'exec',
    container,
    'rm',
    '-f',
    '/etc/xrdp/key.pem',
    '/etc/xrdp/cert.pem',
  ]);
  command([
    'exec',
    container,
    'openssl',
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-days',
    '2',
    '-subj',
    '/CN=bridge-owned-html-peer',
    '-addext',
    'subjectAltName=IP:127.0.0.1',
    '-keyout',
    '/etc/xrdp/key.pem',
    '-out',
    '/etc/xrdp/cert.pem',
  ]);
  command(['exec', container, 'chown', 'root:ssl-cert', '/etc/xrdp/key.pem']);
  command(['exec', container, 'chmod', '640', '/etc/xrdp/key.pem']);
  const certificate = command([
    'exec',
    container,
    'openssl',
    'x509',
    '-in',
    '/etc/xrdp/cert.pem',
    '-noout',
    '-fingerprint',
    '-sha256',
  ]);
  const hex = certificate.split('=').at(-1).replaceAll(':', '').toLowerCase();
  requireResult(/^[0-9a-f]{64}$/.test(hex));
  const fingerprint = 'sha256:' + hex;
  report.peerVersions = command([
    'exec',
    container,
    'dpkg-query',
    '--show',
    '--showformat=${Package}=${Version}\n',
    'xrdp',
    'xorgxrdp',
  ]).split('\n');
  command(['exec', container, '/usr/sbin/xrdp-sesman']);
  command(['exec', container, '/usr/sbin/xrdp']);
  config = {
    target: { host: '127.0.0.1', port: 3393 },
    auth: { username: 'bridge-lab', password },
    display: { width: 1280, height: 720 },
    clipboard: {
      mode: 'bidirectional',
      text: true,
      html: true,
      maxItemBytes: 1048576,
    },
    security: { certificatePolicy: 'prompt' },
    timeouts: { connectMs: 20000, tcpAckMs: 10000 },
  };
  server = await createSessionServer({
    worker: options,
    allowedOrigins: [origin],
    authenticate: (request) =>
      request.headers.authorization === 'Bearer ' + bearer
        ? { id: 'owned-html-peer' }
        : undefined,
    sessions: {
      workerFactory: (limits) => {
        backend = new NativeSessionWorker(options, limits);
        backend.onState((value) => {
          state = value;
        });
        backend.onClipboard((value) => {
          source = { ...value };
        });
        const htmlRead = backend.readClipboardHtml.bind(backend),
          textRead = backend.readClipboardText.bind(backend);
        backend.readClipboardHtml = (revision) => {
          ++htmlReads;
          return htmlRead(revision);
        };
        backend.readClipboardText = (revision) => {
          ++textReads;
          return textRead(revision);
        };
        return backend;
      },
    },
    logDestination: new Writable({
      write(_bytes, _encoding, done) {
        done();
      },
    }),
  });
  await server.listen({ host: '127.0.0.1', port: 0 });
  phase = 'connect';
  const response = await server.inject({
    method: 'POST',
    url: '/v1/sessions',
    headers: { authorization: 'Bearer ' + bearer },
    payload: config,
  });
  delete config.auth.password;
  requireResult(response.statusCode === 202);
  const created = response.json();
  ws = new WebSocket(
    'ws://127.0.0.1:' +
      server.server.address().port +
      '/v1/sessions/' +
      created.sessionId +
      '/control?token=' +
      created.attach.control.token,
    ['freerdp-bridge-v1'],
    { origin },
  );
  ws.on('error', () => {
    protocolFailed = true;
  });
  ws.on('message', (bytes, isBinary) => {
    if (isBinary) {
      if (bytes.length > 4096 || binary.length >= 2) {
        protocolFailed = true;
        bytes.fill(0);
        return;
      }
      binary.push(Buffer.from(bytes));
      bytes.fill(0);
      return;
    }
    if (bytes.length > 4096 || messages.length >= 256) {
      protocolFailed = true;
      return;
    }
    const message = JSON.parse(bytes.toString());
    if (message.type === 'session.error') {
      protocolFailed = true;
      return;
    }
    if (message.type === 'certificate.prompt') {
      if (message.data.fingerprint !== fingerprint) {
        protocolFailed = true;
        return;
      }
      send('certificate.response', {
        challenge: message.data.challenge,
        fingerprint,
        accept: true,
      });
    } else messages.push(message);
  });
  await wait(() => state === 'connected' && source?.ready && source.html);
  workerPid = backend.pid;
  report.htmlSelected = true;
  phase = 'owned-application-copy';
  send('input.sync', { toggles: 0 });
  await delay(15000);
  // This container contains only the fixed fullscreen Tk fixture. As in its
  // existing browser acceptance, focus that owned canvas before its hotkey.
  for (const down of [true, false])
    send('input.pointer', {
      action: 'button',
      x: 640,
      y: 360,
      button: 0,
      down,
    });
  await delay(200);
  const revision = source.revision;
  await press('F3');
  await press('F4');
  await press('ControlLeft', 'KeyC');
  await wait(() => source.remoteText && source.revision > revision);
  report.unicodeAvailable = true;
  report.peerRemoteHtml = source.remoteHtml;
  requireResult(source.remoteHtml === false);
  phase = 'public-html-refusal';
  const requestSeq = send('clipboard.html.request', {
    generation: source.generation.toString(),
    revision: source.revision.toString(),
  });
  const refused = await event('clipboard.html.data', requestSeq);
  requireResult(
    refused.status === 'refused' &&
      refused.bytes === 0 &&
      htmlReads === 0 &&
      textReads === 0 &&
      binary.length === 0,
  );
  report.htmlRefused = report.noImplicitFallback = true;
  phase = 'explicit-unicode-read';
  const textSeq = send('clipboard.request', {
    generation: source.generation.toString(),
    revision: source.revision.toString(),
  });
  const meta = await event('clipboard.data', textSeq);
  requireResult(
    meta.status === 'accepted' &&
      Number.isInteger(meta.bytes) &&
      meta.bytes > 0 &&
      meta.bytes <= 1024,
  );
  await wait(() => binary.length === 1);
  const chunk = decodeClipboardChunk(binary[0]);
  requireResult(
    chunk.requestSeq === textSeq &&
      chunk.offset === 0 &&
      chunk.bytes.length === meta.bytes,
  );
  const expected = Buffer.from(
    'Bridge Tk → browser\nОбратно 日本語 😀\nLine 3',
  );
  try {
    requireResult(chunk.bytes.equals(expected));
  } finally {
    expected.fill(0);
  }
  send('clipboard.ack', { requestSeq: textSeq, offset: meta.bytes });
  requireResult(
    (await event('clipboard.data.complete', textSeq)).status === 'accepted' &&
      textReads === 1 &&
      htmlReads === 0,
  );
  report.explicitUnicodeRead = true;
  report.passed = true;
} catch {
  report.failure = 'HTML_PEER_CHECK_FAILED';
  report.failedPhase = phase;
  // The operator explicitly permits diagnostic RDP screenshots in AGENTS.md.
  // This is only our isolated synthetic desktop, never the external lab host.
  if (container && state === 'connected' && backend) {
    let frame;
    try {
      frame = await backend.captureFrame(0n, { codec: 'jpeg' });
      if (frame?.jpeg?.length && frame.jpeg.length <= 16777216) {
        const path =
          'build/current-validation/html-xrdp-peer-' + nonce + '.jpg';
        await writeFile(path, frame.jpeg, { flag: 'wx' });
        report.diagnosticFrame = {
          path,
          width: frame.width,
          height: frame.height,
          sha256: createHash('sha256').update(frame.jpeg).digest('hex'),
        };
      }
    } catch {
      report.diagnosticFrameUnavailable = true;
    } finally {
      frame?.jpeg?.fill(0);
    }
  }
  if (source)
    report.lastSource = {
      ready: source.ready,
      html: source.html,
      remoteText: source.remoteText,
      remoteHtml: source.remoteHtml,
      remotePending: source.remotePending,
    };
  process.exitCode = 1;
} finally {
  if (container && /^[0-9a-f]{64}$/.test(container)) {
    try {
      report.desktopProcesses = JSON.parse(
        command([
          'exec',
          container,
          'python3',
          '-c',
          "import os,json,pathlib; names=[]\nfor p in pathlib.Path('/proc').glob('[0-9]*/comm'):\n try:\n  if int(p.parent.name)!=os.getpid(): names.append(p.read_text().strip())\n except (OSError,ValueError): pass\nf=pathlib.Path('/home/bridge-lab/.xsession-errors'); s=f.open('rb').read(16384) if f.exists() else b''; print(json.dumps({'python':names.count('python3'),'xorg':names.count('Xorg'),'channel':names.count('xrdp-chansrv'),'sessionLog':f.exists(),'pythonError':b'Traceback' in s,'tkError':b'TclError' in s}))",
        ]),
      );
    } catch {
      report.desktopProcesses = { unavailable: true };
    }
  }
  if (config?.auth) delete config.auth.password;
  ws?.close();
  await server?.close().catch(() => {
    report.passed = false;
    process.exitCode = 1;
  });
  ws?.terminate();
  for (const bytes of binary) bytes.fill(0);
  clearTimeout(watchdog);
  report.runtimeEmpty = await readdir(options.runtimeRoot).then(
    (items) => items.length === 0,
    () => false,
  );
  if (workerPid) {
    try {
      process.kill(workerPid, 0);
    } catch (error) {
      report.pidRetired = error.code === 'ESRCH';
    }
  }
  if (container && /^[0-9a-f]{64}$/.test(container)) {
    try {
      const current = JSON.parse(
        command(['container', 'inspect', container]),
      )[0];
      requireResult(
        current.Id === container && current.Config.Labels[label] === '1',
      );
      command(['rm', '--force', container]);
      report.ownedContainerRemoved = true;
    } catch {
      report.passed = false;
      process.exitCode = 1;
    }
  }
  report.htmlReads = htmlReads;
  report.textReads = textReads;
  if (
    !report.runtimeEmpty ||
    !report.pidRetired ||
    !report.ownedContainerRemoved
  ) {
    report.passed = false;
    process.exitCode = 1;
  }
  await mkdir('build/current-validation', { recursive: true });
  const output =
    'build/current-validation/html-xrdp-peer-' +
    Date.now() +
    '-' +
    nonce.slice(0, 6) +
    '.json';
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report, report: output }));
}
