import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createHash, randomBytes } from 'node:crypto';
import { listenBrowserHttp } from '../tests/fixtures/browser-port.mjs';
if (
  process.platform !== 'win32' ||
  process.versions.node.split('.')[0] !== '24' ||
  resolve('.') !== resolve(fileURLToPath(new URL('..', import.meta.url))) ||
  process.argv.length !== 3 ||
  process.argv[2] !== '--owned-os-clipboard'
)
  throw new Error('Use Node 24 with --owned-os-clipboard');
const assets = new Map(),
  hashes = {};
hashes['scripts/test-image-os-clipboard.mjs'] = createHash('sha256')
  .update(await readFile(new URL(import.meta.url)))
  .digest('hex');
for (const name of [
  'clipboard-image-view.js',
  'clipboard-image.js',
  'clipboard-image-conversion.js',
  'clipboard-image-worker.js',
]) {
  const path = 'apps/reference-harness/' + name,
    bytes = await readFile(path);
  assets.set('/' + name, bytes);
  hashes[path] = createHash('sha256').update(bytes).digest('hex');
}
const index = await readFile('apps/reference-harness/index.html', 'utf8'),
  start = index.indexOf('<section id="clipboard-image"'),
  end = index.indexOf('<section id="clipboard-html"');
if (start < 0 || end <= start) throw new Error('Owned image panel unavailable');
const fixturePath = 'tests/fixtures/image-os-clipboard.html',
  fixture = await readFile(fixturePath, 'utf8');
hashes[fixturePath] = createHash('sha256').update(fixture).digest('hex');
hashes['apps/reference-harness/index.html'] = createHash('sha256')
  .update(index)
  .digest('hex');
const html = fixture.replace('<!--REFERENCE_PANEL-->', index.slice(start, end));
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (url.pathname === '/') {
    response.setHeader('content-type', 'text/html');
    response.end(html);
    return;
  }
  const bytes = assets.get(url.pathname);
  response.statusCode = bytes ? 200 : 404;
  response.setHeader('content-type', 'text/javascript');
  response.end(bytes ?? '');
});
const report = {
  schema: 1,
  scope:
    'Owned headed Windows/Edge actual PNG OS clipboard with reference UI and synthetic session API',
  browserClipboardMocked: false,
  actualRdp: false,
  sessionApiMocked: true,
  opaque32x32: true,
  sourceCopy: false,
  localPasteDoesNotSend: false,
  sentExactAndBorrowWiped: false,
  independentBrowserProcessReadback: false,
  newRevisionReadback: false,
  receivedPixelsCleared: false,
  ownedClipboardCleared: false,
  uiDisposed: false,
  passed: false,
  sources: hashes,
};
const requireResult = (v) => {
  if (!v) throw new Error('IMAGE_OS_CHECK_FAILED');
};
let browser,
  observer,
  page,
  phase = 'prepare';
try {
  const port = await listenBrowserHttp(server),
    origin = 'http://127.0.0.1:' + port,
    fixtureUrl = origin + '/?id=' + randomBytes(16).toString('hex');
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
  await page.goto(fixtureUrl);
  await page.bringToFront();
  await page.waitForFunction(() => Boolean(window.fixture && window.view));
  phase = 'owned-source-copy';
  await page.locator('#seed').click();
  await page.waitForFunction(() => window.fixture.seeded);
  report.sourceCopy = true;
  phase = 'local-paste';
  await page.locator('[data-image-clipboard=paste]').click();
  await page.waitForFunction(
    () => document.querySelector('[data-image-clipboard-draft]').width === 32,
  );
  requireResult(await page.evaluate(() => window.fixture.writes === 0));
  report.localPasteDoesNotSend = true;
  phase = 'synthetic-send';
  await page.locator('[data-image-clipboard=send]').click();
  await page.waitForFunction(
    () =>
      window.fixture.writes === 1 &&
      document.querySelector('[data-image-clipboard-draft]').width === 0,
  );
  requireResult(await page.evaluate(() => window.fixture.sentMatches()));
  report.sentExactAndBorrowWiped = true;
  observer = await chromium.launch({ channel: 'msedge', headless: false });
  const observerContext = await observer.newContext();
  await observerContext.grantPermissions(
    ['clipboard-read', 'clipboard-write'],
    { origin },
  );
  const observerPage = await observerContext.newPage();
  observerPage.setDefaultTimeout(10000);
  observerPage.on('pageerror', () => errors.push('observer-pageerror'));
  await observerPage.goto(fixtureUrl);
  await observerPage.waitForFunction(() => Boolean(window.fixture));
  for (const revision of [0, 1]) {
    phase = 'copy-readback-revision-' + revision;
    await page.bringToFront();
    await page.evaluate((revision) => {
      window.fixture.revision = revision;
    }, revision);
    await page.locator('[data-image-clipboard=read]').click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-image-clipboard-received]').width ===
          32 && !document.querySelector('[data-image-clipboard=copy]').disabled,
    );
    await page.locator('[data-image-clipboard=copy]').click();
    await page.waitForFunction(
      () =>
        document.querySelector('#clipboard-image [role=status]').textContent ===
        'Изображение скопировано',
    );
    await observerPage.bringToFront();
    await observerPage.evaluate((revision) => {
      window.fixture.revision = revision;
      window.fixture.inspection = undefined;
    }, revision);
    await observerPage.locator('#inspect').click();
    await observerPage.waitForFunction(
      () => window.fixture.inspection !== undefined,
    );
    requireResult(
      await observerPage.evaluate(
        (revision) =>
          window.fixture.inspection.matched &&
          window.fixture.inspection.revision === revision,
        revision,
      ),
    );
    if (revision === 0) report.independentBrowserProcessReadback = true;
    else report.newRevisionReadback = true;
    await page.bringToFront();
    await page.locator('[data-image-clipboard=clear]').click();
    requireResult(await page.evaluate(() => window.fixture.receivedWiped()));
  }
  report.receivedPixelsCleared = true;
  requireResult(errors.length === 0);
  report.passed = true;
} catch {
  report.failure = 'IMAGE_OS_CHECK_FAILED';
  report.failedPhase = phase;
  process.exitCode = 1;
} finally {
  await observer?.close();
  if (page)
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
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  const path = resolve(
    'build/current-validation',
    'image-os-clipboard-' +
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
