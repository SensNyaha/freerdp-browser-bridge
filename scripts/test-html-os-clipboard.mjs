import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';

// Manual authorized fixture: replaces the system clipboard with known synthetic
// data, never reads its previous contents and never connects to an RDP target.
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
if (
  process.platform !== 'win32' ||
  process.versions.node.split('.')[0] !== '24' ||
  resolve('.') !== root ||
  process.argv.length !== 3 ||
  process.argv[2] !== '--owned-os-clipboard'
)
  throw new Error(
    'Use Node 24 at the project root with --owned-os-clipboard for the owned Windows clipboard scenario',
  );
const { chromium } = await import('playwright-core');
const { listenBrowserHttp } = await import(
  '../tests/fixtures/browser-port.mjs'
);
const names = [
  'clipboard-html-view.js',
  'clipboard-html-normalize.js',
  'clipboard-html.js',
  'clipboard-text.js',
];
const assets = new Map(),
  hashes = {};
for (const name of names) {
  const path = 'apps/reference-harness/' + name,
    bytes = await readFile(path);
  assets.set('/' + name, bytes);
  hashes[path] = createHash('sha256').update(bytes).digest('hex');
}
const index = await readFile('apps/reference-harness/index.html', 'utf8');
const start = index.indexOf('<section id="clipboard-html"'),
  end = index.indexOf('<section id="clipboard-text"');
if (start < 0 || end <= start) throw new Error('Owned HTML panel unavailable');
const fixturePath = 'tests/fixtures/html-os-clipboard.html';
const fixture = await readFile(fixturePath, 'utf8');
hashes[fixturePath] = createHash('sha256').update(fixture).digest('hex');
hashes['apps/reference-harness/index.html'] = createHash('sha256')
  .update(index)
  .digest('hex');
const html = fixture.replace('<!--REFERENCE_PANEL-->', index.slice(start, end));
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (url.pathname === '/') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(html);
    return;
  }
  const bytes = assets.get(url.pathname);
  if (!bytes) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.setHeader('Content-Type', 'text/javascript');
  response.end(bytes);
});
const report = {
  schema: 1,
  scope:
    'Owned headed Edge/Windows OS ClipboardItem roundtrip with reference HTML UI and synthetic session API',
  headedEdge: true,
  browserClipboardMocked: false,
  actualRdp: false,
  sessionApiMocked: true,
  sourceCopy: false,
  localPasteDoesNotSend: false,
  staticFormatting: false,
  unicode: false,
  remoteSelectionOnly: false,
  returnedBuffersWiped: false,
  osHtmlReadback: false,
  osPlainReadback: false,
  independentBrowserProcessReadback: false,
  ownedClipboardCleared: false,
  uiDisposed: false,
  passed: false,
  sources: hashes,
};
const requireResult = (value) => {
  if (!value) throw new Error('HTML_OS_CHECK_FAILED');
};
let browser,
  observer,
  page,
  phase = 'prepare';
try {
  const port = await listenBrowserHttp(server),
    origin = 'http://127.0.0.1:' + port;
  browser = await chromium.launch({ channel: 'msedge', headless: false });
  report.browserVersion = browser.version();
  const context = await browser.newContext();
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin,
  });
  page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', () => errors.push('pageerror'));
  const fixtureUrl = origin + '/?id=' + randomBytes(16).toString('hex');
  await page.goto(fixtureUrl);
  await page.bringToFront();
  await page.waitForFunction(() => Boolean(window.fixture && window.view));
  phase = 'owned-source-copy';
  await page.locator('#seed').click();
  requireResult(await page.evaluate(() => window.fixture.seeded));
  report.sourceCopy = true;
  phase = 'local-paste';
  await page.locator('[data-html-clipboard=paste]').click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-html-clipboard-draft]').value.length > 0,
  );
  requireResult(await page.evaluate(() => window.fixture.writes === 0));
  report.localPasteDoesNotSend = true;
  phase = 'synthetic-send';
  await page.locator('[data-html-clipboard=send]').click();
  await page.waitForFunction(() => window.fixture.writes === 1);
  const sent = await page.evaluate(() => window.fixture.sent());
  requireResult(
    sent.table === 1 &&
      sent.bold >= 1 &&
      sent.italic >= 1 &&
      sent.lists === 1 &&
      sent.listItems === 2 &&
      sent.listStart === '4' &&
      sent.knownLocalContents &&
      !sent.privateText,
  );
  report.staticFormatting = true;
  requireResult(sent.hasLocal && sent.textPresent && sent.plainKnown);
  report.unicode = true;
  phase = 'synthetic-read';
  await page.locator('[data-html-clipboard=read]').click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-html-clipboard-received]').value.length > 0,
  );
  requireResult(
    await page.evaluate(
      () =>
        !document
          .querySelector('[data-html-clipboard-received]')
          .value.includes('PRIVATE-'),
    ),
  );
  report.remoteSelectionOnly = true;
  requireResult(await page.evaluate(() => window.fixture.returnedWiped()));
  report.returnedBuffersWiped = true;
  phase = 'os-copy';
  await page.locator('[data-html-clipboard=copy]').click();
  await page.waitForFunction(
    () =>
      document.querySelector('#clipboard-html [role=status]').textContent ===
      'HTML скопирован',
  );
  phase = 'os-readback';
  observer = await chromium.launch({ channel: 'msedge', headless: false });
  const observerContext = await observer.newContext();
  await observerContext.grantPermissions(
    ['clipboard-read', 'clipboard-write'],
    { origin },
  );
  const observerPage = await observerContext.newPage();
  observerPage.setDefaultTimeout(10000);
  await observerPage.goto(fixtureUrl);
  await observerPage.bringToFront();
  await observerPage.waitForFunction(() => Boolean(window.fixture));
  await observerPage.locator('#inspect').click();
  await observerPage.waitForFunction(
    () => window.fixture.inspection !== undefined,
  );
  const actual = await observerPage.evaluate(() => window.fixture.inspection);
  requireResult(
    !actual.failed &&
      actual.hasRemote &&
      !actual.hasLocal &&
      !actual.privateText &&
      actual.table === 1 &&
      actual.bold >= 1,
  );
  report.osHtmlReadback = true;
  requireResult(actual.plainRemote);
  report.osPlainReadback = true;
  report.independentBrowserProcessReadback = true;
  requireResult(errors.length === 0);
  report.passed = true;
} catch {
  report.failure = 'HTML_OS_CHECK_FAILED';
  report.failedPhase = phase;
  process.exitCode = 1;
} finally {
  await observer?.close();
  if (page) {
    try {
      await page.bringToFront();
      if (await page.evaluate(() => window.fixture?.seeded)) {
        await page.locator('#clear-os').click();
        await page.waitForFunction(() => window.fixture.cleared);
        report.ownedClipboardCleared = true;
      }
      await page.evaluate(() => window.fixture?.dispose());
      report.uiDisposed = true;
    } catch {
      report.passed = false;
      report.cleanupFailed = true;
      process.exitCode = 1;
    }
  }
  await browser?.close();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  const directory = resolve('build/current-validation');
  await mkdir(directory, { recursive: true });
  const path = resolve(
    directory,
    'html-os-clipboard-' +
      Date.now() +
      '-' +
      randomBytes(3).toString('hex') +
      '.json',
  );
  await writeFile(path, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(
    JSON.stringify({ passed: report.passed, actualRdp: false, report: path }),
  );
}
