import { randomBytes } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Writable } from 'node:stream';
import { chromium } from 'playwright-core';
import { createSessionServer } from '../apps/bridge-api/dist/session-server.js';
import { NativeSessionWorker } from '../packages/node-bridge/dist/index.js';
import { waitForViewerClose } from './viewer-window.mjs';

// Local Windows example: RDP credentials are entered only in the visible form.
// Hosting authentication reaches this one browser page through its private driver.
const smoke = process.argv[2] === '--smoke';
if (
  process.platform !== 'win32' ||
  (smoke ? process.argv.length !== 3 : process.argv.length !== 2)
)
  throw new Error('Run the local Windows reference harness without arguments');
const origin = 'http://127.0.0.1:47997';
const bearer = randomBytes(32).toString('base64url');
const runtimeRoot = await mkdtemp(join(tmpdir(), 'rdp-manual-reference-'));
const worker = {
  workerPath: resolve('build/bundled/rdp-worker.exe'),
  runtimeRoot,
};
let server, browser, page;
try {
  server = await createSessionServer({
    worker,
    allowedOrigins: [origin],
    authenticate: (request) =>
      request.headers.authorization === 'Bearer ' + bearer
        ? { id: 'local-reference-owner' }
        : undefined,
    sessions: {
      maxSessions: 1,
      workerFactory: () => new NativeSessionWorker(worker),
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
          .header(
            'Content-Security-Policy',
            "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src blob:",
          )
          .type(name.endsWith('.js') ? 'text/javascript' : 'text/html')
          .send(bytes),
    );
  }
  await server.listen({ host: '127.0.0.1', port: 47997 });
  browser = await chromium.launch({ channel: 'msedge', headless: smoke });
  page = await browser.newPage({ viewport: null });
  await page.goto(origin + '/harness/');
  await page.waitForFunction(() => Boolean(window.bridgeConnection));
  await page.evaluate(
    (bearer) =>
      window.bridgeConnection.configure({
        authorize: () => ({ authorization: 'Bearer ' + bearer }),
      }),
    bearer,
  );
  if (smoke) {
    if (
      (await page.locator('[name=password]').inputValue()) !== '' ||
      (await page.locator('[name=host]').inputValue()) !== ''
    )
      throw new Error('Reference form must open without stored credentials');
  } else {
    console.log(
      'Форма подключения открыта в Edge. Закройте окно для завершения сервера и всех сессий.',
    );
    await waitForViewerClose(browser, page);
  }
} finally {
  try {
    await browser?.close();
  } finally {
    await server?.close();
    if ((await readdir(runtimeRoot)).length !== 0)
      throw new Error('Manual runtime cleanup incomplete');
    await rm(runtimeRoot, { recursive: true, force: true });
    if (smoke)
      console.log(
        JSON.stringify({
          referenceForm: true,
          rdpSessionCreated: false,
          cleanup: true,
        }),
      );
  }
}
