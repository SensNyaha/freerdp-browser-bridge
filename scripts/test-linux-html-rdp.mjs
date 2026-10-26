import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { open, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  linuxHtmlLabArguments,
  requireLinuxHtmlLabContainer,
  requireLinuxHtmlLabCapabilities,
} from './linux-html-lab-profile.mjs';
import { parseHtmlLabReceipt } from './html-rdp-lab-fixture.mjs';

const profile = linuxHtmlLabArguments(process.argv.slice(2));
if (
  process.platform !== 'win32' ||
  process.versions.node.split('.')[0] !== '24' ||
  resolve('.') !== resolve(fileURLToPath(new URL('..', import.meta.url))) ||
  process.env.BRIDGE_LAB_PROFILE
)
  throw new Error(
    'Use the Windows Node 24 project root for the owned Linux HTML lab',
  );
// Validate the real container before generating auth material or loading the lab.
let inspected;
try {
  inspected = JSON.parse(
    (
      await promisify(execFile)('docker', ['inspect', profile.container], {
        encoding: 'utf8',
        timeout: 5000,
        maxBuffer: 1048576,
        windowsHide: true,
      })
    ).stdout,
  )[0];
} catch {
  throw new Error('LINUX_HTML_LAB_PROFILE_REFUSED');
}
const ownedContainer = requireLinuxHtmlLabContainer(inspected);
const { chromium } = await import('playwright-core');
const bearer = randomBytes(32).toString('base64url'),
  origin = 'http://127.0.0.1:47998';
const report = {
  schema: 1,
  scope:
    'Linux native worker / prepared Windows Edge / actual public HTML control and OS Clipboard API',
  actualRdp: !profile.bootstrapOnly,
  sessionApiMocked: false,
  browserClipboardMocked: false,
  hostClipboardAccess: false,
  headedEdge: true,
  transport: profile.transport,
  container: ownedContainer,
  nativeHtmlCapability: false,
  assetsLoaded: false,
  certificateMatched: false,
  ownedApplicationVerified: false,
  localPasteDoesNotSend: false,
  browserToApplication: false,
  applicationToBrowser: false,
  newerRemoteRevision: false,
  staticFormatting: false,
  unicode: false,
  ownedDocumentReset: false,
  ownedApplicationCloseRequested: false,
  ownedClipboardCleared: false,
  revokeAccepted: false,
  uiDisposed: false,
  pidRetired: false,
  runtimeEmpty: false,
  passed: false,
  sources: {},
};
let phase = 'startup',
  browser,
  page,
  sessionId,
  config,
  closed;
let expired = false,
  state = 'created',
  source,
  stats,
  childCode;
const requireResult = (value) => {
  if (!value) throw new Error('LINUX_HTML_RDP_CHECK_FAILED');
};
let ready, failed;
const readiness = new Promise((resolve, reject) => {
  ready = resolve;
  failed = reject;
});
void readiness.catch(() => {});
const child = spawn(
  'docker',
  [
    'exec',
    '--user',
    '1000:1000',
    '-i',
    profile.container,
    'node',
    'scripts/linux-xrdp-viewer-server.mjs',
  ],
  { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
);
const bootstrap = Buffer.from(
  JSON.stringify({
    bearer,
    htmlClipboard: true,
    ipcTransport: profile.transport,
  }),
);
child.stdin.on('error', () => {});
child.stdin.end(bootstrap, () => bootstrap.fill(0));
child.stderr.resume();
let stdout = '',
  received = 0;
child.stdout.on('data', (chunk) => {
  received += chunk.length;
  if (received > 8192) {
    failed(new Error('Linux lab output limit'));
    child.kill();
    return;
  }
  stdout += chunk.toString('utf8');
  for (let n; (n = stdout.indexOf('\n')) >= 0; ) {
    const line = stdout.slice(0, n);
    stdout = stdout.slice(n + 1);
    try {
      const event = JSON.parse(line);
      if (event.type === 'lab.server.ready') ready();
      else if (event.type === 'lab.server.closed') closed = event;
      else failed(new Error('Linux lab event refused'));
    } catch {
      failed(new Error('Linux lab event refused'));
    }
  }
});
const exited = new Promise((resolve) => {
  child.once('error', () => {
    failed(new Error('Linux lab child failed'));
    resolve(1);
  });
  child.once('close', (code) => {
    childCode = code ?? 1;
    failed(new Error('Linux lab child closed'));
    resolve(childCode);
  });
});
const startupTimer = setTimeout(
  () => failed(new Error('Linux lab startup deadline')),
  15000,
);
const watchdog = setTimeout(() => {
  expired = true;
  void browser?.close().catch(() => {});
  failed(new Error('Linux lab deadline'));
}, 180000);
async function request(path, method = 'GET', body) {
  const response = await fetch(origin + path, {
    method,
    headers: {
      authorization: 'Bearer ' + bearer,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(8000),
  });
  if (![200, 202].includes(response.status)) {
    report.lastHttpStatus = response.status;
    throw new Error('Linux lab HTTP refused');
  }
  const chunks = [];
  let length = 0;
  for await (const bytes of response.body) {
    if ((length += bytes.length) > 131072)
      throw new Error('Linux lab response limit');
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function refresh() {
  stats = await request('/lab/stats');
  requireResult(
    ['writes', 'htmlReads', 'textReads', 'revokes'].every(
      (key) =>
        Number.isInteger(stats[key]) && stats[key] >= 0 && stats[key] <= 32,
    ),
  );
  state = stats.state ?? 'created';
  if (stats.source) {
    requireResult(
      ['generation', 'revision'].every(
        (key) =>
          /^(0|[1-9][0-9]{0,19})$/.test(stats.source[key]) &&
          BigInt(stats.source[key]) <= 0xffffffffffffffffn,
      ),
    );
    source = {
      ...stats.source,
      generation: BigInt(stats.source.generation),
      revision: BigInt(stats.source.revision),
    };
  }
}
async function wait(predicate, ms = 15000) {
  const until = performance.now() + ms;
  for (;;) {
    await refresh();
    if (predicate()) return;
    if (
      expired ||
      childCode !== undefined ||
      ['failed', 'closed'].includes(state) ||
      performance.now() >= until
    )
      throw new Error('Linux HTML progress refused');
    await delay(80);
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
    throw new Error('Linux HTML private lab input unavailable');
  } finally {
    bytes.fill(0);
    await file?.close();
  }
}
async function press(...codes) {
  await page.evaluate((codes) => window.fixture.press(codes), codes);
  await delay(200);
}
async function receipt(label) {
  phase = label + '-select';
  await press('F2');
  await refresh();
  const revision = source.revision;
  phase = label + '-copy';
  await press('ControlLeft', 'KeyC');
  phase = label + '-offer';
  await wait(() => source.remoteText && source.revision > revision);
  await page.waitForFunction(() => window.fixture.snapshot.canRead);
  phase = label + '-read';
  return parseHtmlLabReceipt(
    await page.evaluate(() => window.fixture.receipt()),
    profile.nonce,
  );
}
async function copyApplication(number) {
  phase = 'source-' + number + '-copy';
  await refresh();
  const revision = source.revision;
  await press('F8');
  await press('ControlLeft', 'KeyC');
  await wait(
    () => source.remoteHtml && source.remoteText && source.revision > revision,
  );
  await page.waitForFunction(() => window.fixture.snapshot.canReadHtml);
  const clear = page.locator('[data-html-clipboard=clear]');
  if (await clear.isEnabled()) await clear.click();
  phase = 'source-' + number + '-html-read';
  await page.locator('[data-html-clipboard=read]').click();
  await page.waitForFunction(() =>
    document
      .querySelector('#clipboard-html [role=status]')
      .textContent.startsWith('HTML получен.'),
  );
  phase = 'source-' + number + '-os-copy';
  await page.locator('[data-html-clipboard=copy]').click();
  await page.waitForFunction(
    () =>
      document.querySelector('#clipboard-html [role=status]').textContent ===
      'HTML скопирован',
  );
  await page.evaluate(() => {
    window.fixture.inspection = undefined;
  });
  await page.locator('#inspect').click();
  await page.waitForFunction(() => window.fixture.inspection !== undefined);
  const value = await page.evaluate(() => window.fixture.inspection);
  requireResult(
    !value.failed &&
      value.source === number &&
      value.knownText &&
      value.knownHtml &&
      value.table === 1 &&
      value.bold >= 1 &&
      value.italic >= 1 &&
      value.listItems === 2 &&
      value.listStart === '4' &&
      !value.privateText,
  );
  await refresh();
  return source.revision;
}
try {
  await readiness;
  clearTimeout(startupTimer);
  phase = 'native-capabilities';
  const capabilities = await request('/v1/capabilities');
  report.nativeCapabilities = {
    rdp: capabilities.rdp === true,
    connectCore: capabilities.connectCore === true,
    clipboardHtml: capabilities.clipboardHtml === true,
  };
  requireLinuxHtmlLabCapabilities(capabilities);
  report.nativeHtmlCapability = true;
  const build = await request('/v1/build');
  requireResult(
    build.os === 'linux' &&
      build.arch === 'x64' &&
      build.freeRdpVersion === '3.32.1' &&
      build.targetFreeRdpVersion === '3.32.1' &&
      build.transport ===
        (profile.transport === 'auto' ? 'unix-seqpacket-rws1' : 'framed-pipes'),
  );
  report.native = Object.fromEntries(
    [
      'os',
      'arch',
      'bridgeVersion',
      'gitCommit',
      'freeRdpVersion',
      'targetFreeRdpVersion',
      'transport',
    ].map((key) => [key, build[key]]),
  );
  for (const name of [
    'scripts/test-linux-html-rdp.mjs',
    'scripts/linux-html-lab-profile.mjs',
    'scripts/linux-xrdp-viewer-server.mjs',
    'scripts/linux-viewer-bootstrap.mjs',
    'tests/fixtures/html-rdp-client.html',
  ])
    report.sources[name] = createHash('sha256')
      .update(await readFile(name))
      .digest('hex');
  browser = await chromium.launch({
    channel: 'msedge',
    headless: false,
    timeout: 10000,
  });
  report.browserVersion = browser.version();
  const context = await browser.newContext();
  if (!profile.bootstrapOnly)
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin,
    });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  let pageErrors = 0;
  page.on('pageerror', () => {
    ++pageErrors;
  });
  await page.goto(origin + '/html-lab/?id=' + profile.nonce);
  await page.bringToFront();
  await page.waitForFunction(() => Boolean(window.fixture));
  report.assetsLoaded = true;
  if (!profile.bootstrapOnly) {
    phase = 'private-lab-input';
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
    phase = 'connect';
    const created = await request('/v1/sessions', 'POST', config);
    delete config.auth.password;
    sessionId = created.sessionId;
    await page.evaluate((value) => window.fixture.attach(value), created);
    await page.waitForFunction(() => window.fixture.hasPrompt);
    requireResult(
      await page.evaluate(
        (fp) => window.fixture.accept(fp),
        profile.fingerprint,
      ),
    );
    report.certificateMatched = true;
    await wait(() => state === 'connected' && source?.ready && source.html);
    await page.waitForFunction(() => window.fixture.snapshot?.canSetHtml);
    phase = 'prepared-application-settle';
    await delay(15000);
    const initial = await receipt('owned-document');
    requireResult(initial.source === 0 && initial.pastes === 0 && !initial.ok);
    report.ownedApplicationVerified = true;
    phase = 'local-paste';
    await page.locator('#seed').click();
    await page.waitForFunction(() => window.fixture.seeded);
    report.hostClipboardAccess = true;
    await page.locator('[data-html-clipboard=paste]').click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-html-clipboard-draft]').value.length > 0,
    );
    await refresh();
    requireResult(stats.writes === 0);
    report.localPasteDoesNotSend = true;
    phase = 'browser-to-application';
    await page.locator('[data-html-clipboard=send]').click();
    await wait(
      () =>
        stats.writes === 1 && source.localHtmlAccepted && !source.localPending,
    );
    await press('F9');
    await press('ControlLeft', 'KeyV');
    await delay(500);
    const pasted = await receipt('application-paste');
    requireResult(
      pasted.pastes === 1 && pasted.ok && pasted.html && pasted.text,
    );
    report.browserToApplication = true;
    const first = await copyApplication(1),
      second = await copyApplication(2);
    requireResult(
      second > first &&
        stats.htmlReads === 2 &&
        stats.textReads === 2 &&
        stats.writes === 1,
    );
    report.applicationToBrowser =
      report.staticFormatting =
      report.unicode =
      report.newerRemoteRevision =
        true;
    if (profile.keepDocument) {
      phase = 'owned-document-reset';
      await press('F5');
      await delay(500);
      const reset = await receipt('owned-document-reset');
      requireResult(reset.source === 0 && reset.pastes === 0 && !reset.ok);
      report.ownedDocumentReset = true;
    } else {
      phase = 'owned-document-close';
      await press('ControlLeft', 'KeyW');
      report.ownedApplicationCloseRequested = true;
    }
    await page.evaluate(() => window.fixture.dispose());
    report.uiDisposed = true;
    await wait(
      () =>
        stats.revokeAccepted &&
        stats.revokes === 1 &&
        !source.localPending &&
        !source.localAccepted,
    );
    report.revokeAccepted = true;
    await request('/v1/sessions/' + sessionId, 'DELETE');
  }
  requireResult(
    pageErrors === 0 &&
      (await page.evaluate(() => window.fixture.failures)) === 0,
  );
  report.passed = true;
} catch {
  report.failure = 'LINUX_HTML_RDP_CHECK_FAILED';
  report.failedPhase = phase;
  if (source)
    report.lastSource = {
      ready: source.ready,
      remoteText: source.remoteText,
      remoteHtml: source.remoteHtml,
      localPending: source.localPending,
      localAccepted: source.localAccepted,
    };
  process.exitCode = 1;
} finally {
  clearTimeout(startupTimer);
  if (config?.auth) delete config.auth.password;
  if (page && !page.isClosed()) {
    if (
      report.ownedApplicationVerified &&
      !report.ownedApplicationCloseRequested &&
      !report.ownedDocumentReset &&
      state === 'connected'
    )
      await press('ControlLeft', 'KeyW').then(
        () => {
          report.ownedApplicationCloseRequested = true;
        },
        () => {},
      );
    if (await page.evaluate(() => window.fixture?.seeded).catch(() => false)) {
      await page.bringToFront().catch(() => {});
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
  if (sessionId)
    await request('/v1/sessions/' + sessionId, 'DELETE').catch(() => {});
  await request('/lab/stop', 'POST').catch(() => {});
  const killTimer = setTimeout(() => child.kill(), 20000);
  const code = await exited;
  clearTimeout(killTimer);
  clearTimeout(watchdog);
  bootstrap.fill(0);
  await browser?.close().catch(() => {
    report.passed = false;
  });
  report.runtimeEmpty = closed?.cleanup === true;
  report.pidRetired = closed?.pidRetired === true;
  if (closed?.clipboard) {
    const value = closed.clipboard;
    report.nativeCalls = Object.fromEntries(
      ['writes', 'htmlReads', 'textReads', 'revokes'].map((key) => [
        key,
        Number.isInteger(value[key]) && value[key] >= 0 && value[key] <= 32
          ? value[key]
          : -1,
      ]),
    );
  }
  if (
    code !== 0 ||
    !report.runtimeEmpty ||
    !report.pidRetired ||
    (!profile.bootstrapOnly &&
      (!report.ownedClipboardCleared ||
        (!report.ownedApplicationCloseRequested && !report.ownedDocumentReset)))
  ) {
    report.passed = false;
    process.exitCode = 1;
  }
  await mkdir('build/current-validation', { recursive: true });
  const output =
    'build/current-validation/linux-html-rdp-' +
    Date.now() +
    '-' +
    profile.transport +
    '.json';
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report, report: output }));
}
