import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
import { createSessionServer } from '../apps/bridge-api/dist/session-server.js';
import { NativeSessionWorker } from '../packages/node-bridge/dist/index.js';
import { waitForViewerClose } from './viewer-window.mjs';

// User-authorized local XRDP check: browser and API bind only to this machine.
const fingerprint = process.argv[2];
const mode = process.argv[3] ?? 'jpeg';
const manual = process.argv[4] === '--manual';
const codecs = [mode === 'jpeg' ? 'jpeg' : 'h264'];
if (
  ![3, 4, 5].includes(process.argv.length) ||
  (process.argv.length === 5 && !manual) ||
  (manual && mode === 'h264-reset') ||
  !['jpeg', 'h264', 'h264-reset'].includes(mode) ||
  !/^sha256:[0-9a-f]{64}$/.test(fingerprint ?? '')
)
  throw new Error('Pass the previously verified certificate fingerprint');
const readJson = async (path) =>
  JSON.parse((await readFile(resolve(path), 'utf8')).replace(/^\uFEFF/, ''));
const lab = await readJson('.local-tests/xrdp-lab.json');
const credentials = await readJson('.local-tests/xrdp-lab.secrets.json');
const origin = 'http://127.0.0.1:47999';
const bearer = randomBytes(32).toString('base64url');
const options = {
  workerPath: resolve(
    'build/bundled/rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
  ),
  runtimeRoot: resolve('.runtime/viewer-lab'),
};
const nativeWorker = new NativeSessionWorker(options);
const deliverInput = nativeWorker.sendInput.bind(nativeWorker);
let inputMoves = 0;
let inputResets = 0;
nativeWorker.sendInput = async (event) => {
  if (!manual && !['move', 'reset'].includes(event.type))
    throw new Error('LAB_READ_ONLY_INPUT');
  await deliverInput(event);
  if (event.type === 'move') inputMoves++;
  else inputResets++;
};
const server = await createSessionServer({
  worker: options,
  allowedOrigins: [origin],
  authenticate: (request) =>
    request.headers.authorization === 'Bearer ' + bearer
      ? { id: 'local-lab' }
      : undefined,
  sessions: { workerFactory: () => nativeWorker },
  logDestination: new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  }),
});
for (const [url, name, type] of [
  ['/harness/', 'index.html', 'text/html'],
  ['/harness/viewer.js', 'viewer.js', 'text/javascript'],
  ['/harness/input.js', 'input.js', 'text/javascript'],
]) {
  const bytes = await readFile(resolve('apps/reference-harness', name));
  server.get(url, (_request, reply) =>
    reply
      .header('Cache-Control', 'no-store')
      .header(
        'Content-Security-Policy',
        "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src blob:",
      )
      .type(type)
      .send(bytes),
  );
}
let browser;
let sessionId;
let page;
let phase = 'create';
try {
  await server.listen({ host: '127.0.0.1', port: 47999 });
  const created = await server.inject({
    method: 'POST',
    url: '/v1/sessions',
    headers: { authorization: 'Bearer ' + bearer },
    payload: {
      target: { host: lab.host, port: lab.port },
      auth: { username: credentials.username, password: credentials.password },
      display: { width: 1920, height: 1080 },
      security: { certificatePolicy: 'prompt' },
      timeouts: { connectMs: 20000, tcpAckMs: 10000 },
    },
  });
  delete credentials.password;
  if (created.statusCode !== 202) throw new Error('LAB_CREATE_FAILED');
  const attachment = created.json();
  sessionId = attachment.sessionId;
  phase = 'browser';
  browser = await chromium.launch({
    channel: process.platform === 'win32' ? 'msedge' : 'chromium',
    headless: !manual,
  });
  page = await browser.newPage({
    viewport: manual ? null : { width: 1980, height: 1240 },
  });
  if (mode === 'h264-reset')
    await page.addInitScript(() => {
      const Original = globalThis.EncodedVideoChunk;
      let injected = false;
      globalThis.EncodedVideoChunk = class extends Original {
        constructor(init) {
          if (!injected) {
            injected = true;
            super({ ...init, data: new Uint8Array([0, 0, 0, 2, 0x65, 0]) });
          } else super(init);
        }
      };
    });
  await page.goto(origin + '/harness/');
  phase = 'attach';
  await page.waitForFunction(() => Boolean(window.bridgeViewer));
  await page.evaluate(
    ({ created, codecs }) => window.bridgeViewer.attach(created, { codecs }),
    { created: attachment, codecs },
  );
  phase = 'certificate';
  await page.waitForFunction(
    () => !document.querySelector('#certificate').hidden,
    undefined,
    { timeout: 20000 },
  );
  const accepted = await page.evaluate(
    (verified) => window.bridgeViewer.acceptCertificate(verified),
    fingerprint,
  );
  if (!accepted) throw new Error('LAB_CERTIFICATE_CHANGED');
  phase = 'render';
  await page.waitForFunction(
    () => window.bridgeViewer.stats.frames > 0,
    undefined,
    { timeout: 20000 },
  );
  if (manual) {
    phase = 'manual';
    console.log(
      'Ручной просмотр открыт в Edge. Щёлкните по рабочему столу для ввода.',
    );
    console.log(
      'Для завершения закройте окно Edge или нажмите Ctrl+C в этом терминале.',
    );
    await waitForViewerClose(browser, page);
  } else {
    phase = 'pixels';
    await delay(15000); // Let the remote login/desktop finish painting before visual verification.
    const stats = await page.evaluate(() => {
      const canvas = document.querySelector('#desktop');
      const pixels = canvas
        .getContext('2d')
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let min = 255,
        max = 0;
      for (let i = 0; i < pixels.length; i += 64) {
        min = Math.min(min, pixels[i]);
        max = Math.max(max, pixels[i]);
      }
      return { ...window.bridgeViewer.stats, hasImage: max - min > 20 };
    });
    if (
      stats.error ||
      stats.closed ||
      !stats.hasImage ||
      stats.width !== 1920 ||
      stats.height !== 1080
    )
      throw new Error('LAB_RENDER_FAILED');
    if (
      stats.codec !== codecs[0] ||
      (mode !== 'jpeg' && stats.keyframes < 1) ||
      (mode === 'h264-reset' && stats.resets !== 1)
    )
      throw new Error('LAB_CODEC_OR_RECOVERY_FAILED');
    const pipeline = await nativeWorker.pipelineStats();
    phase = 'pointer';
    const desktop = await page.locator('#desktop').boundingBox();
    if (!desktop) throw new Error('LAB_INPUT_VIEW_UNAVAILABLE');
    // Motion only: never click or type into the lab's operational desktop.
    await page.mouse.move(desktop.x + 10, desktop.y + 10);
    const inputDeadline = Date.now() + 3000;
    while (inputMoves === 0 && Date.now() < inputDeadline) await delay(10);
    if (inputMoves === 0) throw new Error('LAB_INPUT_MOVE_FAILED');
    await page.locator('#desktop').screenshot({
      path: resolve(
        '.local-tests/' +
          (mode === 'jpeg'
            ? 'xrdp-browser.png'
            : 'xrdp-browser-' + mode + '.png'),
      ),
    });
    phase = 'reattach';
    await page.evaluate(() => window.bridgeViewer.detach());
    await delay(100); // Let the old socket releases reach the registry.
    const resetDeadline = Date.now() + 3000;
    while (inputResets === 0 && Date.now() < resetDeadline) await delay(10);
    if (inputResets === 0) throw new Error('LAB_INPUT_RELEASE_FAILED');
    const nextAttach = {};
    for (const channel of ['control', 'media']) {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/sessions/' + sessionId + '/attach-token',
        headers: { authorization: 'Bearer ' + bearer },
        payload: { channel },
      });
      if (response.statusCode !== 200)
        throw new Error('LAB_REATTACH_TOKEN_FAILED');
      nextAttach[channel] = response.json();
    }
    await page.evaluate(
      ({ created, codecs }) => window.bridgeViewer.attach(created, { codecs }),
      { created: { sessionId, attach: nextAttach }, codecs },
    );
    await page.waitForFunction(
      () => window.bridgeViewer.stats.frames > 0,
      undefined,
      { timeout: 5000 },
    );
    if (
      await page.evaluate(() =>
        Boolean(
          window.bridgeViewer.stats.error || window.bridgeViewer.stats.closed,
        ),
      )
    )
      throw new Error('LAB_REATTACH_FAILED');
    await page.evaluate(() => window.bridgeViewer.detach());
    const closed = await server.inject({
      method: 'DELETE',
      url: '/v1/sessions/' + sessionId,
      headers: { authorization: 'Bearer ' + bearer },
    });
    if (closed.statusCode !== 200) throw new Error('LAB_CLOSE_FAILED');
    console.log(
      JSON.stringify({
        type: 'lab.browser',
        browser: 'chromium',
        ...stats,
        reattach: true,
        pipeline,
        inputMoves,
        inputResets,
      }),
    );
  }
} catch {
  const stats = await page
    ?.evaluate(() => window.bridgeViewer?.stats)
    .catch(() => undefined);
  console.error(JSON.stringify({ type: 'lab.browser.failure', phase, stats }));
  console.error(
    'Local XRDP browser check failed; credentials and raw diagnostics omitted',
  );
  process.exitCode = 1;
} finally {
  delete credentials.password;
  await browser?.close();
  await server.close();
  const leftovers = await readdir(options.runtimeRoot);
  if (leftovers.length) {
    console.error('LAB_RUNTIME_NOT_EMPTY');
    process.exitCode = 1;
  }
}
