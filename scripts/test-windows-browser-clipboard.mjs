import { open, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
import { createSessionServer } from '../apps/bridge-api/dist/session-server.js';
import { NativeSessionWorker } from '../packages/node-bridge/dist/index.js';
import { viewerWorkerOptions } from './viewer-worker-options.mjs';

// Explicitly authorized one-session scenario: fresh focused unsaved Notepad,
// replace both clipboards with fixed synthetic text. Never log their contents.
const [fingerprint, receipt, ...extra] = process.argv.slice(2);
const focusEditor = extra.includes('--focus-editor');
const keyboardSmoke = extra.includes('--keyboard-smoke');
if (
  process.platform !== 'win32' ||
  new Set(extra).size !== extra.length ||
  extra.some(
    (flag) => !['--focus-editor', '--keyboard-smoke'].includes(flag),
  ) ||
  (keyboardSmoke && !focusEditor) ||
  !/^sha256:[0-9a-f]{64}$/.test(fingerprint ?? '') ||
  !receipt
)
  throw new Error('Use the approved fingerprint and linked native receipt');
const { options, profile } = await viewerWorkerOptions(receipt, resolve('.'));
options.runtimeRoot = resolve('.runtime/windows-browser-clipboard');
const origin = 'http://127.0.0.1:47995';
const bearer = randomBytes(32).toString('base64url');
const sent = 'Bridge browser → Notepad\nПривет 日本語 😀\nLine 3';
const returned = 'Bridge Notepad → browser\nОбратно 日本語 😀\nLine 3';
const report = {
  actualRdp: true,
  browserClipboardMocked: false,
  headedEdge: true,
  browserToNotepad: false,
  notepadToBrowser: false,
  permissionDenied: false,
  noSendDuringLocalPaste: false,
  revokeAccepted: false,
  detachedFieldsCleared: false,
  runtimeEmpty: false,
  writes: 0,
  reads: 0,
  keyEvents: 0,
};
let browser, context, page, server, backend, source, sessionId, config;
let captureFailureFrame;
let state = 'created',
  phase = 'prepare',
  expired = false,
  writes = 0;
let ownDocument = false;
const requireResult = (ok) => {
  if (!ok) throw new Error('LAB_CHECK_FAILED');
};
const wait = async (predicate, ms = 12000) => {
  const end = performance.now() + ms;
  while (!predicate()) {
    if (
      expired ||
      ['failed', 'closed'].includes(state) ||
      performance.now() >= end
    )
      throw new Error('LAB_WAIT_FAILED');
    await delay(20);
  }
};
const privateJson = async (name) => {
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
    throw new Error('LAB_CONFIGURATION_UNAVAILABLE');
  } finally {
    bytes.fill(0);
    await file?.close();
  }
};
const chord = async (keys) => {
  await page.locator('#desktop').focus();
  await page.keyboard.press(keys);
  await delay(200);
};
const receivedEquals = async (expected) =>
  page.evaluate(
    (text) =>
      document
        .querySelector('[data-clipboard-received]')
        .value.replace(/\r\n/g, '\n') === text,
    expected,
  );
async function copyRemoteAndRead(expected) {
  const revision = source.revision;
  const direction = phase;
  phase = direction + '-select';
  await chord('ControlLeft+KeyA');
  phase = direction + '-copy';
  await chord('ControlLeft+KeyC');
  phase = direction + '-offer';
  await wait(() => source.remoteText && source.revision > revision);
  phase = direction + '-read';
  await page.locator('[data-clipboard=read]').click();
  await page.waitForFunction(() =>
    document
      .querySelector('#clipboard-text [role=status]')
      .textContent.startsWith('Текст получен.'),
  );
  phase = direction + '-compare';
  requireResult(await receivedEquals(expected));
  phase = direction;
}
const watchdog = setTimeout(() => {
  expired = true;
  void backend?.terminate().catch(() => {});
  void browser?.close().catch(() => {});
}, 120000);
watchdog.unref();
try {
  const lab = await privateJson('xrdp-lab.json');
  requireResult(lab.host === '192.168.21.149' && (lab.port ?? 3389) === 3389);
  const credentials = await privateJson('xrdp-lab.secrets.json');
  config = {
    target: { host: lab.host, port: lab.port ?? 3389 },
    auth: { username: credentials.username, password: credentials.password },
    display: { width: 1920, height: 1080 },
    clipboard: { mode: 'bidirectional', text: true, maxItemBytes: 1024 },
    security: { certificatePolicy: 'prompt' },
    timeouts: { connectMs: 20000, tcpAckMs: 10000 },
  };
  delete credentials.password;
  server = await createSessionServer({
    worker: options,
    allowedOrigins: [origin],
    authenticate: (request) =>
      request.headers.authorization === 'Bearer ' + bearer
        ? { id: 'windows-browser-clipboard' }
        : undefined,
    sessions: {
      workerFactory: (limits) => {
        backend = new NativeSessionWorker(options, limits);
        if (focusEditor) {
          const capture = backend.captureFrame.bind(backend);
          let paused = false,
            active;
          backend.captureFrame = (...args) => {
            if (paused) return Promise.resolve(undefined);
            const pending = capture(...args);
            active = pending.then(
              () => {},
              () => {},
            );
            return pending;
          };
          captureFailureFrame = async () => {
            // Stop future viewer pulls and join its sole current native request.
            // Then request just the one separately authorized failure frame.
            paused = true;
            await active;
            return capture(0n, { codec: 'jpeg' });
          };
        }
        backend.onState((value) => {
          state = value;
        });
        backend.onClipboard((value) => {
          source = { ...value };
        });
        const input = backend.sendInput.bind(backend);
        backend.sendInput = (event) => {
          if (event.type === 'key') ++report.keyEvents;
          return input(event);
        };
        const read = backend.readClipboardText.bind(backend);
        backend.readClipboardText = (revision) => {
          ++report.reads;
          return read(revision);
        };
        const write = backend.writeClipboardText.bind(backend);
        backend.writeClipboardText = (bytes) => {
          ++writes;
          report.writes = writes;
          const expected = Buffer.from(sent);
          try {
            requireResult(writes === 1 && bytes.equals(expected));
          } finally {
            expected.fill(0);
          }
          return write(bytes).then((result) => {
            report.offerAccepted = result === 'accepted';
            return result;
          });
        };
        const revoke = backend.revokeClipboardText.bind(backend);
        backend.revokeClipboardText = async () => {
          const result = await revoke();
          if (result === 'accepted') report.revokeAccepted = true;
          return result;
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
  await server.listen({ host: '127.0.0.1', port: 47995 });
  browser = await chromium.launch({
    channel: 'msedge',
    headless: false,
    timeout: 10000,
  });
  context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin,
  });
  page = await context.newPage();
  page.setDefaultTimeout(12000);
  await page.goto(origin + '/harness/');
  await page.waitForFunction(() => Boolean(window.bridgeViewer));
  // Seed before any read: never inspect unrelated pre-existing local clipboard data.
  await page.evaluate((text) => navigator.clipboard.writeText(text), sent);
  const request = async (path, method = 'GET', payload) => {
    const response = await server.inject({
      method,
      url: path,
      headers: { authorization: 'Bearer ' + bearer },
      ...(payload ? { payload } : {}),
    });
    requireResult([200, 202].includes(response.statusCode));
    return response.json();
  };
  phase = 'connect';
  const created = await request('/v1/sessions', 'POST', config);
  delete config.auth.password;
  sessionId = created.sessionId;
  await page.evaluate(
    (value) => window.bridgeViewer.attach(value, { codecs: ['jpeg'] }),
    created,
  );
  await page.waitForFunction(
    () => !document.querySelector('#certificate').hidden,
  );
  requireResult(
    await page.evaluate(
      (fp) => window.bridgeViewer.acceptCertificate(fp),
      fingerprint,
    ),
  );
  await wait(
    () => source?.ready && !source.localPending && !source.localAccepted,
  );
  await page.waitForFunction(
    () =>
      window.bridgeViewer.stats.frames > 0 &&
      !document.querySelector('[data-clipboard=send]').disabled,
  );
  // As in the ordinary viewer smoke, the first RDP frame may still be the
  // Windows login/desktop transition. Do not spend the single authorized editor
  // click on that initial frame. This delay is not application-readiness proof.
  phase = 'desktop-settle';
  await delay(15000);
  if (focusEditor) {
    phase = 'focus-prepared-editor';
    const canvas = page.locator('#desktop');
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    requireResult(Boolean(box));
    // One fixed click only, under separate authorization for maximized Notepad.
    await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
    await delay(200);
  }
  phase = 'local-paste';
  await page.locator('[data-clipboard=paste]').click();
  await page.waitForFunction(() =>
    document
      .querySelector('#clipboard-text [role=status]')
      .textContent.startsWith('Текст вставлен локально.'),
  );
  requireResult(
    await page.evaluate(
      (text) => document.querySelector('[data-clipboard-draft]').value === text,
      sent,
    ),
  );
  requireResult(writes === 0);
  report.noSendDuringLocalPaste = true;
  phase = 'browser-to-notepad';
  await page.locator('[data-clipboard=send]').click();
  phase = 'browser-offer-ack';
  await wait(
    () => writes === 1 && source.localAccepted && !source.localPending,
  );
  phase = 'browser-to-notepad-paste';
  await chord('ControlLeft+KeyV');
  ownDocument = true;
  phase = 'browser-to-notepad';
  await copyRemoteAndRead(sent);
  report.browserToNotepad = true;
  phase = 'notepad-to-browser';
  // Select only our just-verified document, then use the public Unicode input UI.
  await chord('ControlLeft+KeyA');
  await page.locator('#unicode-text').fill(returned);
  await page.locator('#text-input button').click();
  await page.waitForFunction(
    () =>
      document.querySelector('#text-input [role=status]').textContent ===
      'Текст отправлен',
  );
  await copyRemoteAndRead(returned);
  await page.locator('[data-clipboard=copy]').click();
  await page.waitForFunction(
    () =>
      document.querySelector('#clipboard-text [role=status]').textContent ===
      'Текст скопирован',
  );
  requireResult(
    await page.evaluate(
      async (text) =>
        (await navigator.clipboard.readText()).replace(/\r\n/g, '\n') === text,
      returned,
    ),
  );
  report.notepadToBrowser = true;
  if (keyboardSmoke) {
    report.keyboard = { shift: false, blur: [], detachedRightControl: false };
    let expected = returned;
    phase = 'keyboard-shift';
    await chord('ArrowRight'); // Collapse the selection of our verified document.
    await chord('Shift+Digit1');
    await chord('Digit1');
    expected += '!1'; // Named current Windows layout only; do not change its layout.
    await copyRemoteAndRead(expected);
    report.keyboard.shift = true;
    for (const [modifier, digit] of [
      ['ControlLeft', 'Digit2'],
      ['ShiftRight', 'Digit3'],
      ['AltLeft', 'Digit4'],
    ]) {
      phase = 'keyboard-blur-' + modifier;
      await chord('ArrowRight');
      await page.keyboard.down(modifier);
      await page.locator('#unicode-text').focus();
      // Release outside the canvas: native release must come from blur/reset.
      await page.keyboard.up(modifier);
      // A normal standalone Alt release can enter the application's menu mode.
      // Cancel that mode before testing the next unmodified text key.
      if (modifier === 'AltLeft') await chord('Escape');
      await chord(digit);
      expected += digit.slice(-1);
      await copyRemoteAndRead(expected);
      report.keyboard.blur.push(modifier);
    }
    phase = 'keyboard-detach-held-right-control';
    await page.locator('#desktop').focus();
    await page.keyboard.down('ControlRight');
    await page.evaluate(() => window.bridgeViewer.detach());
    await page.keyboard.up('ControlRight');
    await wait(() => !source.localPending && !source.localAccepted);
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
    await chord('ArrowRight');
    await chord('Digit5');
    expected += '5';
    await copyRemoteAndRead(expected);
    report.keyboard.detachedRightControl = true;
  }
  phase = 'clear-own-document';
  await chord('ControlLeft+KeyA');
  await chord('Backspace');
  ownDocument = false;
  phase = 'permission-denial';
  const cdp = await browser.newBrowserCDPSession();
  const { browserContextIds } = await cdp.send('Target.getBrowserContexts');
  requireResult(browserContextIds.length === 1);
  await cdp.send('Browser.setPermission', {
    permission: { name: 'clipboard-read' },
    setting: 'denied',
    origin,
    browserContextId: browserContextIds[0],
  });
  await page.locator('[data-clipboard=paste]').click();
  await page.waitForFunction(
    () =>
      document.querySelector('#clipboard-text [role=status]').textContent ===
      'Браузер отказал в доступе к буферу обмена',
  );
  requireResult(writes === 1);
  report.permissionDenied = true;
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin,
  });
  await cdp.detach();
  phase = 'detach';
  await page.evaluate(() => window.bridgeViewer.detach());
  await wait(
    () =>
      report.revokeAccepted && !source.localPending && !source.localAccepted,
  );
  report.detachedFieldsCleared = await page.evaluate(() =>
    [...document.querySelectorAll('#clipboard-text textarea')].every(
      (field) => field.value === '',
    ),
  );
  requireResult(report.detachedFieldsCleared);
  await request('/v1/sessions/' + sessionId, 'DELETE');
  phase = 'done';
} catch (error) {
  process.exitCode = 1;
  report.failedPhase = phase;
  report.ownTestDocumentMayRemain = ownDocument;
  report.failureKind = ['LAB_CHECK_FAILED', 'LAB_WAIT_FAILED'].includes(
    error?.message,
  )
    ? error.message
    : 'LAB_OPERATION_FAILED';
  if (source)
    report.lastSource = {
      ready: source.ready,
      remoteText: source.remoteText,
      localAccepted: source.localAccepted,
      localPending: source.localPending,
      remotePending: source.remotePending,
    };
  if (focusEditor && state === 'connected') {
    // At most one actual RDP frame, only under the explicit diagnostic permission.
    const frame = await captureFailureFrame().catch(() => undefined);
    if (frame?.jpeg && frame.jpeg.length <= 16777216) {
      await writeFile(
        resolve('.local-tests/windows-browser-clipboard-failure.jpg'),
        frame.jpeg,
      ).then(
        () => {
          report.singleFailureFrame = true;
        },
        () => {},
      );
    }
  }
} finally {
  if (config?.auth) delete config.auth.password;
  await page?.evaluate(() => window.bridgeViewer?.detach()).catch(() => {});
  await server?.close().catch(() => {
    process.exitCode = 1;
  });
  await browser?.close().catch(() => {});
  clearTimeout(watchdog);
  report.runtimeEmpty = await readdir(options.runtimeRoot).then(
    (items) => items.length === 0,
    () => false,
  );
  if (!report.runtimeEmpty) process.exitCode = 1;
  report.nativeState = state;
  report.workerHash = profile.workerHash;
  console.log(JSON.stringify(report));
}
