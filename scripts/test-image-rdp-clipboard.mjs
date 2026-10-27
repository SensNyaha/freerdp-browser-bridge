import { open, readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { Writable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { viewerWorkerOptions } from './viewer-worker-options.mjs';
import { imageRdpLabArguments } from './image-rdp-lab-profile.mjs';
import {
  imageLabDocument,
  imageLabPixels,
  parseImageLabReceipt,
} from './image-rdp-lab-fixture.mjs';

// Manual acceptance only. The operator opens/focuses our exact document first.
// No application launch, URL/shell input, prior local clipboard read or argv secret.
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const { nonce, fingerprint, receipt, keepRemoteDocument } =
  imageRdpLabArguments(process.argv.slice(2));
if (
  process.platform !== 'win32' ||
  process.versions.node.split('.')[0] !== '24' ||
  resolve('.') !== root ||
  process.env.BRIDGE_LAB_PROFILE
)
  throw new Error('IMAGE_RDP_LAB_ENVIRONMENT_INVALID');
const { options, profile } = await viewerWorkerOptions(receipt, root);
const { chromium } = await import('playwright-core');
const { createSessionServer } = await import(
  '../apps/bridge-api/dist/session-server.js'
);
const { NativeSessionWorker } = await import(
  '../packages/node-bridge/dist/index.js'
);
const { listenBrowserLoopback } = await import(
  '../tests/fixtures/browser-port.mjs'
);
options.runtimeRoot = resolve('.runtime/image-rdp-' + nonce);
const application = await imageLabDocument(nonce),
  bearer = randomBytes(32).toString('base64url'),
  ports = Array.from({ length: 8 }, () => randomInt(49152, 65536));
const report = {
  schema: 1,
  scope:
    'Owned Windows RDP / prepared Edge opaque PNG application / actual public WS and reference image UI',
  actualRdp: true,
  sessionApiMocked: false,
  browserClipboardMocked: false,
  headedEdge: true,
  remoteApplication: 'operator-prepared-owned-document',
  applicationSha256: application.sha256,
  opaque32x32: true,
  certificateMatched: false,
  ownedApplicationVerified: false,
  localPasteDoesNotSend: false,
  browserToApplication: false,
  applicationToBrowser: false,
  newerRemoteRevision: false,
  ownedApplicationCloseRequested: false,
  ownedApplicationResetVerified: false,
  ownedClipboardCleared: false,
  revokeAccepted: false,
  uiDisposed: false,
  pidRetired: false,
  runtimeEmpty: false,
  passed: false,
  sources: {},
  native: {
    receipt,
    sourceHash: profile.sourceHash,
    workerHash: profile.workerHash,
    helperHash: profile.helperHash,
  },
};
let server, backend, browser, page, config, source, sessionId, workerPid;
let state = 'created',
  phase = 'prepare',
  expired = false,
  writes = 0,
  imageReads = 0,
  textReads = 0,
  revokes = 0;
const requireResult = (value) => {
  if (!value) throw new Error('IMAGE_RDP_CHECK_FAILED');
};
async function wait(predicate, ms = 15000) {
  const end = performance.now() + ms;
  while (!predicate()) {
    if (
      expired ||
      ['failed', 'closed'].includes(state) ||
      performance.now() >= end
    )
      throw new Error('IMAGE_RDP_WAIT_FAILED');
    await delay(20);
  }
}
async function privateJson(name) {
  const bytes = Buffer.alloc(8193);
  let file;
  try {
    file = await open(resolve('.local-tests', name), 'r');
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead > 8192) throw new Error();
    return JSON.parse(
      bytes
        .subarray(0, bytesRead)
        .toString('utf8')
        .replace(/^\uFEFF/, ''),
    );
  } catch {
    throw new Error('IMAGE_RDP_LAB_CONFIGURATION_UNAVAILABLE');
  } finally {
    bytes.fill(0);
    await file?.close();
  }
}
async function press(...codes) {
  await page.evaluate((codes) => window.fixture.press(codes), codes);
  await delay(200);
}
async function readReceipt(label) {
  phase = label + '-select';
  await press('F2');
  const revision = source.revision;
  phase = label + '-copy';
  await press('ControlLeft', 'KeyC');
  phase = label + '-offer';
  await wait(() => source.remoteText && source.revision > revision);
  await page.waitForFunction(() => window.fixture.snapshot.canRead);
  phase = label + '-read';
  return parseImageLabReceipt(
    await page.evaluate(() => window.fixture.receipt()),
    nonce,
  );
}
async function request(path, method = 'GET', payload) {
  const response = await server.inject({
    method,
    url: path,
    headers: { authorization: 'Bearer ' + bearer },
    ...(payload === undefined ? {} : { payload }),
  });
  requireResult([200, 202].includes(response.statusCode));
  return response.json();
}
async function copyApplication(number) {
  const label = 'remote-source-' + number,
    revision = source.revision;
  phase = label + '-copy';
  await press('F8'); // This page writes PNG directly; Ctrl+C would overwrite it with its receipt.
  phase = label + '-offer';
  await wait(() => source.remoteImage && source.revision > revision);
  await page.waitForFunction(() => window.fixture.snapshot.canReadImage);
  const clear = page.locator('[data-image-clipboard=clear]');
  if (await clear.isEnabled()) await clear.click();
  phase = label + '-read';
  await page.locator('[data-image-clipboard=read]').click();
  await page.waitForFunction(() =>
    document
      .querySelector('#clipboard-image [role=status]')
      .textContent.startsWith('Изображение получено.'),
  );
  phase = label + '-os-copy';
  await page.locator('[data-image-clipboard=copy]').click();
  await page.waitForFunction(
    () =>
      document.querySelector('#clipboard-image [role=status]').textContent ===
      'Изображение скопировано',
  );
  await page.evaluate((number) => {
    window.fixture.expectedSource = number;
    window.fixture.inspection = undefined;
  }, number);
  phase = label + '-inspect';
  await page.locator('#inspect').click();
  await page.waitForFunction(() => window.fixture.inspection !== undefined);
  const result = await page.evaluate(() => window.fixture.inspection);
  requireResult(
    !result.failed && result.knownPixels && result.source === number,
  );
  return source.revision;
}
async function retireDocument() {
  if (keepRemoteDocument) {
    await press('F5');
    await delay(1000);
    const reset = await readReceipt('owned-document-reset');
    requireResult(
      reset.ready &&
        !reset.pending &&
        reset.source === 0 &&
        reset.copies === 0 &&
        reset.pastes === 0,
    );
    report.ownedApplicationResetVerified = true;
  } else {
    await press('ControlLeft', 'KeyW');
    report.ownedApplicationCloseRequested = true;
  }
}
const watchdog = setTimeout(() => {
  expired = true;
  void backend?.terminate().catch(() => {});
  void browser?.close().catch(() => {});
}, 180000);
watchdog.unref();
try {
  const assets = new Map();
  for (const name of [
    'clipboard-client.js',
    'clipboard-html.js',
    'clipboard-image.js',
    'clipboard-image-view.js',
    'clipboard-image-conversion.js',
    'clipboard-image-worker.js',
    'clipboard-text.js',
    'clipboard-wire.js',
  ]) {
    const path = 'apps/reference-harness/' + name,
      bytes = await readFile(path);
    assets.set('/' + name, bytes);
    report.sources[path] = createHash('sha256').update(bytes).digest('hex');
  }
  assets.set(
    '/image-lab-pixels.js',
    Buffer.from('export ' + imageLabPixels.toString()),
  );
  for (const path of [
    'scripts/test-image-rdp-clipboard.mjs',
    'scripts/image-rdp-lab-profile.mjs',
    'scripts/image-rdp-lab-fixture.mjs',
    'tests/fixtures/image-rdp-client.html',
    'tests/fixtures/image-rdp-application.html',
    'apps/reference-harness/index.html',
  ])
    report.sources[path] = createHash('sha256')
      .update(await readFile(path))
      .digest('hex');
  const index = await readFile('apps/reference-harness/index.html', 'utf8'),
    start = index.indexOf('<section id="clipboard-image"'),
    end = index.indexOf('<section id="clipboard-html"');
  requireResult(start >= 0 && end > start);
  const fixture = (
    await readFile('tests/fixtures/image-rdp-client.html', 'utf8')
  ).replace('<!--REFERENCE_PANEL-->', index.slice(start, end));
  const lab = await privateJson('xrdp-lab.json');
  requireResult(lab.host === '192.168.21.149' && (lab.port ?? 3389) === 3389);
  const credentials = await privateJson('xrdp-lab.secrets.json');
  config = {
    target: { host: lab.host, port: lab.port ?? 3389 },
    auth: { username: credentials.username, password: credentials.password },
    display: { width: 1280, height: 720 },
    clipboard: {
      mode: 'bidirectional',
      text: true,
      images: true,
      maxItemBytes: 8192,
    },
    security: { certificatePolicy: 'prompt' },
    timeouts: { connectMs: 20000, tcpAckMs: 10000 },
  };
  delete credentials.password;
  server = await createSessionServer({
    worker: options,
    allowedOrigins: ports.map((port) => 'http://127.0.0.1:' + port),
    authenticate: (request) =>
      request.headers.authorization === 'Bearer ' + bearer
        ? { id: 'owned-image-rdp-lab' }
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
        const write = backend.writeClipboardImage.bind(backend);
        backend.writeClipboardImage = (item) => {
          ++writes;
          return write(item);
        };
        const read = backend.readClipboardImage.bind(backend);
        backend.readClipboardImage = (revision) => {
          ++imageReads;
          return read(revision);
        };
        const text = backend.readClipboardText.bind(backend);
        backend.readClipboardText = (revision) => {
          ++textReads;
          return text(revision);
        };
        const revoke = backend.revokeClipboardText.bind(backend);
        backend.revokeClipboardText = () =>
          revoke().then((result) => {
            ++revokes;
            if (result === 'accepted') report.revokeAccepted = true;
            return result;
          });
        return backend;
      },
    },
    logDestination: new Writable({
      write(_bytes, _encoding, done) {
        done();
      },
    }),
  });
  server.get('/', (_request, reply) => reply.type('text/html').send(fixture));
  for (const [path, bytes] of assets)
    server.get(path, (_request, reply) =>
      reply.type('text/javascript').send(bytes),
    );
  let portIndex = 0;
  const port = await listenBrowserLoopback(
      (port) => server.listen({ host: '127.0.0.1', port }),
      () => ports[portIndex++],
    ),
    origin = 'http://127.0.0.1:' + port;
  const capabilities = await request('/v1/capabilities');
  requireResult(
    capabilities.clipboardImage &&
      capabilities.clipboardText &&
      capabilities.clipboardRevoke,
  );
  browser = await chromium.launch({
    channel: 'msedge',
    headless: false,
    timeout: 10000,
  });
  report.browserVersion = browser.version();
  const context = await browser.newContext();
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin,
  });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  let pageErrors = 0;
  page.on('pageerror', () => {
    ++pageErrors;
  });
  await page.goto(origin + '/?id=' + nonce);
  await page.bringToFront();
  await page.waitForFunction(() => Boolean(window.fixture));
  phase = 'connect-certificate';
  const created = await request('/v1/sessions', 'POST', config);
  delete config.auth.password;
  sessionId = created.sessionId;
  await page.evaluate((created) => window.fixture.attach(created), created);
  await page.waitForFunction(() => window.fixture.hasPrompt);
  requireResult(
    await page.evaluate((fp) => window.fixture.accept(fp), fingerprint),
  );
  report.certificateMatched = true;
  await wait(() => state === 'connected' && source?.ready && source.image);
  await page.waitForFunction(() => window.fixture.snapshot?.canSetImage);
  workerPid = backend.pid;
  phase = 'prepared-browser-settle';
  await delay(15000);
  const initial = await readReceipt('owned-document-challenge');
  requireResult(
    initial.ready &&
      !initial.pending &&
      initial.source === 0 &&
      initial.copies === 0 &&
      initial.pastes === 0,
  );
  report.ownedApplicationVerified = true;
  phase = 'owned-local-seed';
  await page.locator('#seed').click();
  await page.waitForFunction(() => window.fixture.seeded);
  phase = 'local-paste';
  await page.locator('[data-image-clipboard=paste]').click();
  await page.waitForFunction(
    () => document.querySelector('[data-image-clipboard-draft]').width === 32,
  );
  requireResult(writes === 0);
  report.localPasteDoesNotSend = true;
  phase = 'browser-to-application';
  await page.locator('[data-image-clipboard=send]').click();
  await wait(
    () => writes === 1 && source.localImageAccepted && !source.localPending,
  );
  await press('F9');
  await press('ControlLeft', 'KeyV');
  await delay(500);
  const pasted = await readReceipt('owned-image-paste-receipt');
  requireResult(
    pasted.ready &&
      !pasted.pending &&
      pasted.pastes === 1 &&
      pasted.png &&
      pasted.ok,
  );
  report.browserToApplication = true;
  const first = await copyApplication(1);
  report.applicationToBrowser = true;
  const second = await copyApplication(2);
  requireResult(
    second > first && writes === 1 && imageReads === 2 && textReads === 2,
  );
  report.newerRemoteRevision = true;
  requireResult(
    pageErrors === 0 &&
      (await page.evaluate(() => window.fixture.failures)) === 0,
  );
  phase = 'owned-document-retire';
  await retireDocument();
  phase = 'retire';
  await page.evaluate(() => window.fixture.dispose());
  report.uiDisposed = true;
  await wait(
    () =>
      revokes >= 1 &&
      report.revokeAccepted &&
      !source.localPending &&
      !source.localAccepted,
  );
  await request('/v1/sessions/' + sessionId, 'DELETE');
  report.passed = true;
} catch {
  report.failure = 'IMAGE_RDP_CHECK_FAILED';
  report.failedPhase = phase;
  process.exitCode = 1;
  if (source)
    report.lastSource = {
      ready: source.ready,
      remoteText: source.remoteText,
      remoteImage: source.remoteImage,
      localPending: source.localPending,
      localAccepted: source.localAccepted,
      localImageAccepted: source.localImageAccepted,
      remotePending: source.remotePending,
    };
  if (page && !page.isClosed())
    report.lastClient = await page
      .evaluate(() => {
        const s = window.fixture?.snapshot;
        return s
          ? {
              available: s.available,
              canRead: s.canRead,
              canReadImage: s.canReadImage,
              busy: s.busy,
              failures: window.fixture.failures,
            }
          : undefined;
      })
      .catch(() => undefined);
} finally {
  if (config?.auth) delete config.auth.password;
  if (page && !page.isClosed()) {
    if (
      report.ownedApplicationVerified &&
      !report.ownedApplicationCloseRequested &&
      !report.ownedApplicationResetVerified &&
      state === 'connected'
    )
      await retireDocument().catch(() => {});
    await page.bringToFront().catch(() => {});
    if (await page.evaluate(() => window.fixture?.seeded).catch(() => false)) {
      await page
        .locator('#clear-os')
        .click()
        .catch(() => {});
      await page
        .waitForFunction(() => window.fixture.cleared, undefined, {
          timeout: 2000,
        })
        .then(
          () => {
            report.ownedClipboardCleared = true;
          },
          () => {},
        );
    }
    await page
      .evaluate(() => window.fixture?.dispose())
      .then(
        () => {
          report.uiDisposed = true;
        },
        () => {},
      );
  }
  await server?.close().catch(() => {
    report.passed = false;
    process.exitCode = 1;
  });
  await browser?.close().catch(() => {
    report.passed = false;
    process.exitCode = 1;
  });
  clearTimeout(watchdog);
  report.runtimeEmpty = await readdir(options.runtimeRoot).then(
    (items) => items.length === 0,
    () => false,
  );
  if (workerPid)
    try {
      process.kill(workerPid, 0);
    } catch (error) {
      report.pidRetired = error.code === 'ESRCH';
    }
  Object.assign(report, {
    writes,
    imageReads,
    textReads,
    revokes,
    nativeState: state,
  });
  if (
    !report.runtimeEmpty ||
    !report.pidRetired ||
    !report.ownedClipboardCleared ||
    !(keepRemoteDocument
      ? report.ownedApplicationResetVerified
      : report.ownedApplicationCloseRequested)
  ) {
    report.passed = false;
    process.exitCode = 1;
  }
  await mkdir('build/current-validation', { recursive: true });
  const output =
    'build/current-validation/image-rdp-clipboard-' +
    Date.now() +
    '-' +
    nonce.slice(0, 6) +
    '.json';
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', {
    flag: 'wx',
  });
  console.log(
    JSON.stringify({ passed: report.passed, actualRdp: true, report: output }),
  );
}
