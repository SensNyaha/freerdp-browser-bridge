import { EventEmitter } from 'node:events';
import { open, readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
import { createSessionServer } from '../apps/bridge-api/dist/session-server.js';
import { NativeSessionWorker } from '../packages/node-bridge/dist/index.js';

// Lab-only probe. --offer-revoke changes the remote clipboard and requires
// explicit authorization within its scope. --synthetic uses no lab input/RDP.
const args = process.argv.slice(2);
const synthetic = args.length === 1 && args[0] === '--synthetic';
const fingerprint = args[0];
if (
  !synthetic &&
  !(
    args.length === 2 &&
    args[1] === '--offer-revoke' &&
    /^sha256:[0-9a-f]{64}$/.test(fingerprint ?? '')
  )
)
  throw new Error(
    'Use --synthetic, or approved fingerprint and --offer-revoke',
  );
const sentinel = 'FreeRDP browser clipboard probe Ж😀\n';
const expected = Buffer.from(sentinel);
const runtimeRoot = resolve('.runtime/clipboard-control-probe');
const options = {
  workerPath: resolve(
    'build/bundled/rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
  ),
  runtimeRoot,
};
const origin = 'http://127.0.0.1:47996',
  bearer = randomBytes(32).toString('base64url');
const report = {
  actualRdp: !synthetic,
  action: 'one-offer-and-no-format-revoke',
  remoteRead: false,
  readCalls: 0,
  hostClipboardAccess: false,
  writeCalls: 0,
  setAccepted: false,
  revokeCalls: 0,
  revokeAccepted: false,
  sourceEvents: 0,
  replayed: false,
  runtimeEmpty: false,
};
let source,
  nativeState = 'created',
  nativeFailure,
  backend,
  browser,
  page,
  server,
  sessionId,
  expired = false;
class Synthetic extends EventEmitter {
  source = {
    ready: true,
    generation: 1n,
    revision: 0n,
    maximum: 1024,
    toServer: true,
    fromServer: false,
    remoteText: false,
    localAccepted: false,
    localPending: false,
    remotePending: false,
  };
  onState(listener) {
    this.on('state', listener);
    return () => this.off('state', listener);
  }
  onFailure(listener) {
    this.on('failure', listener);
    return () => this.off('failure', listener);
  }
  onClipboard(listener) {
    this.on('clipboard', listener);
    return () => this.off('clipboard', listener);
  }
  publish(patch = {}) {
    Object.assign(this.source, patch);
    this.emit('clipboard', this.source);
  }
  async start() {
    this.emit('state', 'connected');
    this.publish();
  }
  async close() {
    this.emit('state', 'closed');
  }
  async terminate() {
    await this.close();
  }
  async readClipboardText() {
    throw new Error('PROBE_READ_DISABLED');
  }
  writeClipboardText(bytes) {
    if (!bytes.equals(expected)) throw new Error('PROBE_UNEXPECTED_ITEM');
    this.publish({ localAccepted: true });
    return Promise.resolve('accepted');
  }
  async revokeClipboardText() {
    this.publish({ localAccepted: false });
    return 'accepted';
  }
  supportsCodec(codec) {
    return codec === 'jpeg';
  }
  async captureFrame(since) {
    return {
      revision: 1n,
      timestampUs: 123n,
      width: 640,
      height: 480,
      jpeg: since === 1n ? undefined : this.jpeg,
    };
  }
  async sendInput(event) {
    if (event.type !== 'reset') throw new Error('PROBE_INPUT_DISABLED');
  }
  async resetInput() {}
}
const wait = async (predicate, ms = 12000) => {
  const end = performance.now() + ms;
  while (!predicate()) {
    if (
      expired ||
      nativeFailure ||
      ['failed', 'closed'].includes(nativeState) ||
      performance.now() >= end
    )
      throw new Error('PROBE_COMPLETION_UNAVAILABLE');
    await delay(10);
  }
};
async function privateJson(name) {
  const file = await open(resolve('.local-tests', name), 'r');
  const bytes = Buffer.alloc(8193);
  try {
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead > 8192) throw new Error();
    return JSON.parse(
      bytes
        .subarray(0, bytesRead)
        .toString('utf8')
        .replace(/^\uFEFF/, ''),
    );
  } catch {
    throw new Error('Local lab input unavailable');
  } finally {
    bytes.fill(0);
    await file.close();
  }
}
const watchdog = setTimeout(() => {
  expired = true;
  process.exitCode = 1;
  void backend?.terminate().catch(() => {});
  void browser?.close().catch(() => {});
}, 45000);
watchdog.unref();
let phase = 'prepare',
  config;
try {
  config = {
    target: { host: 'synthetic' },
    auth: {},
    clipboard: { mode: 'browser-to-server', text: true, maxItemBytes: 1024 },
    display: { width: 1920, height: 1080 },
    security: { certificatePolicy: 'prompt' },
    timeouts: { connectMs: 20000, tcpAckMs: 10000 },
  };
  if (!synthetic) {
    const target = await privateJson('xrdp-lab.json'),
      credentials = await privateJson('xrdp-lab.secrets.json');
    if (target.host !== '192.168.21.149' || (target.port ?? 3389) !== 3389)
      throw new Error('PROBE_TARGET_NOT_AUTHORIZED');
    config.target = { host: target.host, port: target.port };
    config.auth = {
      username: credentials.username,
      password: credentials.password,
    };
    delete credentials.password;
  }
  server = await createSessionServer({
    worker: options,
    allowedOrigins: [origin],
    authenticate: (request) =>
      request.headers.authorization === 'Bearer ' + bearer
        ? { id: 'clipboard-control-probe' }
        : undefined,
    sessions: {
      workerFactory: (limits) => {
        backend = synthetic
          ? new Synthetic()
          : new NativeSessionWorker(options, limits);
        backend.readClipboardText = async () => {
          ++report.readCalls;
          throw new Error('PROBE_READ_DISABLED');
        };
        const input = backend.sendInput.bind(backend);
        backend.sendInput = (event) => {
          if (event.type !== 'reset')
            return Promise.reject(new Error('PROBE_INPUT_DISABLED'));
          return input(event);
        };
        backend.onState((state) => {
          nativeState = state;
        });
        backend.onFailure((code) => {
          nativeFailure = /^[A-Z_]{1,64}$/.test(code ?? '')
            ? code
            : 'WORKER_FAILED';
        });
        backend.onClipboard((state) => {
          source = {
            ready: state.ready,
            generation: state.generation,
            localAccepted: state.localAccepted,
            localPending: state.localPending,
          };
          ++report.sourceEvents;
        });
        const write = backend.writeClipboardText.bind(backend),
          revoke = backend.revokeClipboardText.bind(backend);
        backend.writeClipboardText = (bytes) => {
          if (++report.writeCalls !== 1 || !bytes.equals(expected))
            throw new Error('PROBE_UNEXPECTED_WRITE');
          return write(bytes).then((status) => {
            report.setAccepted = status === 'accepted';
            return status;
          });
        };
        backend.revokeClipboardText = () => {
          if (++report.revokeCalls !== 1)
            return Promise.reject(new Error('PROBE_UNEXPECTED_REVOKE'));
          return revoke().then((status) => {
            report.revokeAccepted = status === 'accepted';
            return status;
          });
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
  for (const name of await readdir('apps/reference-harness')) {
    if (name !== 'index.html' && !/^[a-z][a-z0-9-]*\.js$/.test(name)) continue;
    const bytes = await readFile(resolve('apps/reference-harness', name));
    server.get(
      name === 'index.html' ? '/harness/' : '/harness/' + name,
      (_request, reply) =>
        reply
          .header('Cache-Control', 'no-store')
          .type(name.endsWith('.js') ? 'text/javascript' : 'text/html')
          .send(bytes),
    );
  }
  await server.listen({ host: '127.0.0.1', port: 47996 });
  browser = await chromium.launch({
    channel: process.platform === 'win32' ? 'msedge' : 'chromium',
    headless: true,
    timeout: 5000,
  });
  page = await browser.newPage();
  page.setDefaultTimeout(12000);
  await page.addInitScript(() => {
    window.probeClipboardRequests = 0;
    const refused = () => {
      ++window.probeClipboardRequests;
      return Promise.reject(new Error('PROBE_HOST_CLIPBOARD_DISABLED'));
    };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText: refused, writeText: refused },
    });
  });
  await page.goto(origin + '/harness/');
  await page.waitForFunction(() => Boolean(window.bridgeViewer));
  const request = async (path, method = 'GET', payload) => {
    const response = await server.inject({
      method,
      url: path,
      headers: { authorization: 'Bearer ' + bearer },
      ...(payload ? { payload } : {}),
    });
    if (![200, 201, 202].includes(response.statusCode))
      throw new Error('PROBE_API_REFUSED');
    return response.json();
  };
  phase = 'create';
  const created = await request('/v1/sessions', 'POST', config);
  delete config.auth.password;
  sessionId = created.sessionId;
  if (synthetic)
    backend.jpeg = Buffer.from(
      await page.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 640;
        c.height = 480;
        c.getContext('2d').fillRect(0, 0, 640, 480);
        return c.toDataURL('image/jpeg').split(',')[1];
      }),
      'base64',
    );
  await page.evaluate(
    (created) => window.bridgeViewer.attach(created, { codecs: ['jpeg'] }),
    created,
  );
  if (!synthetic) {
    phase = 'certificate';
    await page.waitForFunction(
      () => !document.querySelector('#certificate').hidden,
    );
    if (
      !(await page.evaluate(
        (fp) => window.bridgeViewer.acceptCertificate(fp),
        fingerprint,
      ))
    )
      throw new Error('PROBE_CERTIFICATE_CHANGED');
  }
  phase = 'ready';
  await wait(
    () => source?.ready && !source.localAccepted && !source.localPending,
  );
  await page.waitForFunction(
    () =>
      window.bridgeViewer.stats.frames > 0 &&
      !document.querySelector('[data-clipboard=send]').disabled,
  );
  if (!(await page.locator('[data-clipboard=read]').isDisabled()))
    throw new Error('PROBE_READ_ENABLED');
  if (
    report.readCalls ||
    report.writeCalls ||
    report.revokeCalls ||
    (await page.evaluate(() => window.probeClipboardRequests))
  )
    throw new Error('PROBE_UNEXPECTED_ACTIVATION');
  phase = 'offer';
  report.offerAdmission = {
    ready: source.ready,
    localAccepted: source.localAccepted,
    localPending: source.localPending,
    generation: String(source.generation),
  };
  await page.locator('[data-clipboard-draft]').fill(sentinel);
  await page.locator('[data-clipboard=send]').click();
  await wait(
    () =>
      report.setAccepted &&
      source?.ready &&
      source.localAccepted &&
      !source.localPending,
  );
  await page.waitForFunction(() =>
    document
      .querySelector('#clipboard-text [role=status]')
      .textContent.includes('Текст предложен'),
  );
  const generation = source.generation;
  phase = 'revoke';
  await page.evaluate(() => window.bridgeViewer.detach());
  await wait(
    () =>
      report.revokeAccepted &&
      source?.ready &&
      !source.localAccepted &&
      !source.localPending,
  );
  if (nativeState !== 'connected' || source.generation !== generation)
    throw new Error('PROBE_REVOKE_NOT_CONNECTED');
  report.readyAfterRevoke = true;
  phase = 'replay';
  const attach = {};
  for (const channel of ['control', 'media'])
    attach[channel] = await request(
      '/v1/sessions/' + sessionId + '/attach-token',
      'POST',
      { channel },
    );
  await page.evaluate(
    (created) => window.bridgeViewer.attach(created, { codecs: ['jpeg'] }),
    { sessionId, attach },
  );
  await page.waitForFunction(
    () =>
      window.bridgeViewer.stats.frames > 0 &&
      !document.querySelector('[data-clipboard=send]').disabled,
  );
  if (
    report.readCalls ||
    report.writeCalls !== 1 ||
    report.revokeCalls !== 1 ||
    source.localAccepted ||
    source.localPending ||
    (await page.evaluate(() => window.probeClipboardRequests))
  )
    throw new Error('PROBE_REPLAY_INVALID');
  report.replayed = true;
  report.frames = await page.evaluate(() => window.bridgeViewer.stats.frames);
  report.hostClipboardRequests = await page.evaluate(
    () => window.probeClipboardRequests,
  );
  await page.evaluate(() => window.bridgeViewer.detach());
  phase = 'done';
} catch {
  process.exitCode = 1;
  report.failedPhase = phase;
  if (source)
    report.lastSource = {
      ready: source.ready,
      localAccepted: source.localAccepted,
      localPending: source.localPending,
      generation: String(source.generation),
    };
  report.controlStatus = await page
    ?.evaluate(() => {
      const text =
        document.querySelector('#clipboard-text [role=status]')?.textContent ??
        '';
      return (
        [
          'refused',
          'stale',
          'unavailable',
          'busy',
          'invalid',
          'timeout',
          'disconnected',
        ].find((status) => text.endsWith(': ' + status)) ?? 'unclassified'
      );
    })
    .catch(() => 'unavailable');
  if (server && sessionId) {
    const snapshot = await server
      .inject({
        method: 'GET',
        url: '/v1/sessions/' + sessionId,
        headers: { authorization: 'Bearer ' + bearer },
      })
      .then((response) => response.json())
      .catch(() => undefined);
    if (
      [
        'starting',
        'connecting',
        'connected',
        'closing',
        'closed',
        'failed',
      ].includes(snapshot?.state)
    )
      report.sessionState = snapshot.state;
    if (/^[A-Z_]{1,64}$/.test(snapshot?.error?.code ?? ''))
      report.sessionError = snapshot.error.code;
  }
  if (nativeFailure) report.nativeFailure = nativeFailure;
} finally {
  if (config?.auth) delete config.auth.password;
  await page?.evaluate(() => window.bridgeViewer?.detach()).catch(() => {});
  if (
    report.writeCalls &&
    !report.revokeAccepted &&
    !nativeFailure &&
    nativeState === 'connected'
  )
    await wait(() => report.revokeAccepted, 15000).catch(() => {
      process.exitCode = 1;
    });
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {
    process.exitCode = 1;
  });
  clearTimeout(watchdog);
  expected.fill(0);
  report.runtimeEmpty = await readdir(runtimeRoot).then(
    (items) => items.length === 0,
    () => false,
  );
  if (!report.runtimeEmpty) process.exitCode = 1;
  console.log(JSON.stringify(report));
}
