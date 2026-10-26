import { open, readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { Writable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { viewerWorkerOptions } from './viewer-worker-options.mjs';
import {
  htmlLabDocument,
  parseHtmlLabReceipt,
} from './html-rdp-lab-fixture.mjs';

// Manual fixture only. The user first opens/focuses a separate blank Edge window
// on the authorized Windows RDP lab. No application launch, screenshot or shell.
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const [prepared, owned, fingerprint, receipt, ...extra] = process.argv.slice(2);
const preparedDocument = /^--prepared-remote-document=([0-9a-f]{32})$/.exec(
  prepared ?? '',
);
if (
  process.platform !== 'win32' ||
  process.versions.node.split('.')[0] !== '24' ||
  resolve('.') !== root ||
  (prepared !== '--prepared-remote-edge' && !preparedDocument) ||
  owned !== '--owned-os-clipboard' ||
  !/^sha256:[0-9a-f]{64}$/.test(fingerprint ?? '') ||
  !/^build[\\/]native-clean-[A-Za-z0-9_-]+[\\/]receipt\.json$/.test(
    receipt ?? '',
  ) ||
  extra.length ||
  process.env.BRIDGE_LAB_PROFILE
)
  throw new Error(
    'Use --prepared-remote-edge --owned-os-clipboard, approved fingerprint and clean linked receipt at the project root',
  );
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
const nonce = preparedDocument?.[1] ?? randomBytes(16).toString('hex'),
  application = await htmlLabDocument(nonce),
  bearer = randomBytes(32).toString('base64url'),
  ports = Array.from({ length: 8 }, () => randomInt(49152, 65536));
options.runtimeRoot = resolve('.runtime/html-rdp-' + nonce);
const report = {
  schema: 1,
  scope:
    'Owned Windows RDP / prepared Edge application / actual public control WS and reference HTML UI',
  actualRdp: true,
  sessionApiMocked: false,
  browserClipboardMocked: false,
  headedEdge: true,
  remoteApplication: 'user-prepared-edge-owned-document',
  navigation: preparedDocument
    ? 'operator-prepared-document'
    : 'public-input-data-url',
  certificateMatched: false,
  ownedApplicationVerified: false,
  localPasteDoesNotSend: false,
  browserToApplication: false,
  applicationToBrowser: false,
  newerRemoteRevision: false,
  staticFormatting: false,
  unicode: false,
  ownedApplicationCloseRequested: false,
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
  expired = false;
let writes = 0,
  htmlReads = 0,
  textReads = 0,
  revokes = 0;
const requireResult = (value) => {
  if (!value) throw new Error('HTML_RDP_CHECK_FAILED');
};
async function wait(predicate, ms = 15000) {
  const end = performance.now() + ms;
  while (!predicate()) {
    if (
      expired ||
      ['failed', 'closed'].includes(state) ||
      performance.now() >= end
    )
      throw new Error('HTML_RDP_WAIT_FAILED');
    await delay(20);
  }
}
async function privateJson(name) {
  let file;
  const bytes = Buffer.alloc(8193);
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
    throw new Error('HTML_RDP_LAB_CONFIGURATION_UNAVAILABLE');
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
  phase = label + '-read-ready';
  await page.waitForFunction(() => window.fixture.snapshot.canRead);
  phase = label + '-read';
  return parseHtmlLabReceipt(
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
async function copyApplication(expectedSource) {
  const label = 'remote-source-' + expectedSource;
  phase = label + '-select';
  const revision = source.revision;
  await press('F8');
  await press('ControlLeft', 'KeyC');
  phase = label + '-offer';
  await wait(
    () => source.remoteHtml && source.remoteText && source.revision > revision,
  );
  await page.waitForFunction(() => window.fixture.snapshot.canReadHtml);
  phase = label + '-clear';
  const clear = page.locator('[data-html-clipboard=clear]');
  if (await clear.isEnabled()) await clear.click();
  phase = label + '-read';
  await page.locator('[data-html-clipboard=read]').click();
  await page.waitForFunction(() =>
    document
      .querySelector('#clipboard-html [role=status]')
      .textContent.startsWith('HTML получен.'),
  );
  phase = label + '-os-copy';
  await page.locator('[data-html-clipboard=copy]').click();
  await page.waitForFunction(
    () =>
      document.querySelector('#clipboard-html [role=status]').textContent ===
      'HTML скопирован',
  );
  await page.evaluate(() => {
    window.fixture.inspection = undefined;
  });
  phase = label + '-os-inspect';
  await page.locator('#inspect').click();
  await page.waitForFunction(() => window.fixture.inspection !== undefined);
  const result = await page.evaluate(() => window.fixture.inspection);
  requireResult(
    !result.failed &&
      result.source === expectedSource &&
      result.knownText &&
      result.knownHtml &&
      result.table === 1 &&
      result.bold >= 1 &&
      result.italic >= 1 &&
      result.listItems === 2 &&
      result.listStart === '4' &&
      !result.privateText,
  );
  return source.revision;
}
const watchdog = setTimeout(() => {
  expired = true;
  void backend?.terminate().catch(() => {});
  void browser?.close().catch(() => {});
}, 180000);
watchdog.unref();
try {
  const names = [
    'clipboard-client.js',
    'clipboard-html-view.js',
    'clipboard-html-normalize.js',
    'clipboard-html.js',
    'clipboard-text.js',
    'clipboard-wire.js',
  ];
  const assets = new Map();
  for (const name of names) {
    const path = 'apps/reference-harness/' + name,
      bytes = await readFile(path);
    assets.set('/' + name, bytes);
    report.sources[path] = createHash('sha256').update(bytes).digest('hex');
  }
  for (const path of [
    'scripts/test-html-rdp-clipboard.mjs',
    'scripts/html-rdp-lab-fixture.mjs',
    'tests/fixtures/html-rdp-client.html',
    'tests/fixtures/html-rdp-application.html',
    'apps/reference-harness/index.html',
  ])
    report.sources[path] = createHash('sha256')
      .update(await readFile(path))
      .digest('hex');
  const index = await readFile('apps/reference-harness/index.html', 'utf8'),
    start = index.indexOf('<section id="clipboard-html"'),
    end = index.indexOf('<section id="clipboard-text"');
  requireResult(start >= 0 && end > start);
  const fixture = (
    await readFile('tests/fixtures/html-rdp-client.html', 'utf8')
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
      html: true,
      maxItemBytes: 1048576,
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
        ? { id: 'owned-html-rdp-lab' }
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
        const write = backend.writeClipboardHtml.bind(backend);
        backend.writeClipboardHtml = (item) => {
          ++writes;
          return write(item);
        };
        const htmlRead = backend.readClipboardHtml.bind(backend);
        backend.readClipboardHtml = (revision) => {
          ++htmlReads;
          return htmlRead(revision);
        };
        const textRead = backend.readClipboardText.bind(backend);
        backend.readClipboardText = (revision) => {
          ++textReads;
          return textRead(revision);
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
  await wait(() => state === 'connected' && source?.ready && source.html);
  await page.waitForFunction(() => window.fixture.snapshot?.canSetHtml);
  workerPid = backend.pid;
  phase = 'prepared-browser-settle';
  await delay(15000);
  if (!preparedDocument) {
    phase = 'owned-document-navigation';
    await press('ControlLeft', 'KeyL');
    for (let offset = 0; offset < application.uri.length; offset += 256) {
      requireResult(
        await page.evaluate(
          (value) => window.fixture.text(value),
          application.uri.slice(offset, offset + 256),
        ),
      );
      await delay(30);
    }
    await press('Enter');
    await delay(1500);
  }
  phase = 'owned-document-challenge';
  const initial = await readReceipt('owned-document-challenge');
  requireResult(initial.source === 0 && initial.pastes === 0 && !initial.ok);
  report.ownedApplicationVerified = true;
  phase = 'local-paste';
  await page.locator('#seed').click();
  await page.waitForFunction(() => window.fixture.seeded);
  await page.locator('[data-html-clipboard=paste]').click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-html-clipboard-draft]').value.length > 0,
  );
  requireResult(writes === 0);
  report.localPasteDoesNotSend = true;
  phase = 'browser-to-application';
  await page.locator('[data-html-clipboard=send]').click();
  await wait(
    () => writes === 1 && source.localHtmlAccepted && !source.localPending,
  );
  await press('F9');
  await press('ControlLeft', 'KeyV');
  await delay(500);
  const pasted = await readReceipt('owned-application-paste-receipt');
  requireResult(pasted.pastes === 1 && pasted.ok && pasted.html && pasted.text);
  report.browserToApplication = true;
  phase = 'application-to-browser';
  const firstRevision = await copyApplication(1);
  report.applicationToBrowser = report.staticFormatting = report.unicode = true;
  phase = 'newer-remote-revision';
  const secondRevision = await copyApplication(2);
  requireResult(
    secondRevision > firstRevision &&
      htmlReads === 2 &&
      textReads === 2 &&
      writes === 1,
  );
  report.newerRemoteRevision = true;
  requireResult(
    pageErrors === 0 &&
      (await page.evaluate(() => window.fixture.failures)) === 0,
  );
  phase = 'owned-document-close';
  await press('ControlLeft', 'KeyW');
  report.ownedApplicationCloseRequested = true;
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
  report.failure = 'HTML_RDP_CHECK_FAILED';
  report.failedPhase = phase;
  if (source)
    report.lastSource = {
      ready: source.ready,
      remoteText: source.remoteText,
      remoteHtml: source.remoteHtml,
      localPending: source.localPending,
      localAccepted: source.localAccepted,
      remotePending: source.remotePending,
    };
  if (page && !page.isClosed())
    report.lastClient = await page
      .evaluate(() => {
        const snapshot = window.fixture?.snapshot;
        return snapshot
          ? {
              available: snapshot.available,
              canRead: snapshot.canRead,
              canReadHtml: snapshot.canReadHtml,
              busy: snapshot.busy,
              failures: window.fixture.failures,
            }
          : undefined;
      })
      .catch(() => undefined);
  process.exitCode = 1;
} finally {
  if (config?.auth) delete config.auth.password;
  if (page && !page.isClosed()) {
    if (
      report.ownedApplicationVerified &&
      !report.ownedApplicationCloseRequested &&
      state === 'connected'
    ) {
      await press('ControlLeft', 'KeyW').then(
        () => {
          report.ownedApplicationCloseRequested = true;
        },
        () => {},
      );
    }
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
  if (workerPid) {
    try {
      process.kill(workerPid, 0);
    } catch (error) {
      report.pidRetired = error.code === 'ESRCH';
    }
  }
  report.writes = writes;
  report.htmlReads = htmlReads;
  report.textReads = textReads;
  report.revokes = revokes;
  report.nativeState = state;
  if (
    !report.runtimeEmpty ||
    !report.pidRetired ||
    !report.ownedClipboardCleared ||
    !report.ownedApplicationCloseRequested
  ) {
    report.passed = false;
    process.exitCode = 1;
  }
  await mkdir('build/current-validation', { recursive: true });
  const output =
    'build/current-validation/html-rdp-clipboard-' +
    Date.now() +
    '-' +
    nonce.slice(0, 6) +
    '.json';
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report, report: output }));
}
