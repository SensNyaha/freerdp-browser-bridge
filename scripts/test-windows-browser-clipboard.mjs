import {
  access,
  open,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
import { createSessionServer } from '../apps/bridge-api/dist/session-server.js';
import { NativeSessionWorker } from '../packages/node-bridge/dist/index.js';
import { viewerWorkerOptions } from './viewer-worker-options.mjs';
import { viewerLabFiles, requireOwnedLabTarget } from './viewer-lab-files.mjs';
import { windowsLabToneCommand } from './windows-lab-tone.mjs';
import { runMvpBrowserSoak } from './mvp-browser-soak.mjs';
import { readViewerAudioObservation } from './viewer-audio-observation.mjs';
import {
  parsePointerReceipt,
  runWindowsPointerSmoke,
} from './windows-lab-pointer.mjs';

// Explicitly authorized one-session scenario: fresh focused unsaved Notepad,
// replace both clipboards with fixed synthetic text. Never log their contents.
const [fingerprint, receipt, ...extra] = process.argv.slice(2);
const labFiles = viewerLabFiles(process.env.BRIDGE_LAB_PROFILE);
const focusEditor = extra.includes('--focus-editor');
const keyboardSmoke = extra.includes('--keyboard-smoke');
const ownedReceiptRead = extra.includes('--owned-clipboard-read');
const mvpSoak = extra.includes('--mvp-soak');
let sourceWrites = 0;
const notepadReadyPath = resolve('build/mvp-notepad-ready-' + process.pid);
const tone = mvpSoak ? windowsLabToneCommand(1980) : undefined;
const pointerSmoke = extra.includes('--pointer-smoke') || ownedReceiptRead;
if (
  process.platform !== 'win32' ||
  new Set(extra).size !== extra.length ||
  extra.some(
    (flag) =>
      ![
        '--focus-editor',
        '--keyboard-smoke',
        '--pointer-smoke',
        '--owned-clipboard-read',
        '--mvp-soak',
      ].includes(flag),
  ) ||
  ((keyboardSmoke || pointerSmoke) && !focusEditor) ||
  (keyboardSmoke && pointerSmoke) ||
  (ownedReceiptRead &&
    (!labFiles.ownedContainer || extra.includes('--pointer-smoke'))) ||
  (mvpSoak &&
    (labFiles.ownedContainer ||
      !focusEditor ||
      pointerSmoke ||
      keyboardSmoke)) ||
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
    file = await open(resolve(name), 'r');
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
const watchdog = setTimeout(
  () => {
    expired = true;
    void backend?.terminate().catch(() => {});
    void browser?.close().catch(() => {});
  },
  mvpSoak ? 40 * 60 * 1000 : 120000,
);
watchdog.unref();
try {
  const lab = await privateJson(labFiles.config);
  if (labFiles.ownedContainer) {
    requireOwnedLabTarget(lab);
    requireResult(pointerSmoke);
  } else
    requireResult(lab.host === '192.168.21.149' && (lab.port ?? 3389) === 3389);
  const credentials = await privateJson(labFiles.credentials);
  config = {
    target: { host: lab.host, port: lab.port ?? 3389 },
    auth: { username: credentials.username, password: credentials.password },
    display: {
      width: 1920,
      height: 1080,
      ...(mvpSoak ? { dynamicResolution: true } : {}),
    },
    clipboard: {
      mode: pointerSmoke ? 'server-to-browser' : 'bidirectional',
      text: true,
      maxItemBytes: mvpSoak ? 2048 : 1024,
    },
    ...(mvpSoak
      ? { media: { audioOutput: 'opus', audioOutputBufferMs: 200 } }
      : {}),
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
          const sourceCommand = mvpSoak && phase.startsWith('manual-source');
          const expected = Buffer.from(sourceCommand ? tone : sent);
          try {
            requireResult(
              writes === (sourceCommand ? 1 : 1 + sourceWrites) &&
                bytes.equals(expected),
            );
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
  if (!pointerSmoke)
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin,
    });
  page = await context.newPage();
  page.setDefaultTimeout(12000);
  await page.goto(origin + '/harness/');
  await page.waitForFunction(() => Boolean(window.bridgeViewer));
  // Seed before any read: never inspect unrelated pre-existing local clipboard data.
  if (!pointerSmoke)
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
    ({ value, soak }) =>
      window.bridgeViewer.attach(value, {
        codecs: [soak ? 'h264' : 'jpeg'],
        ...(soak ? { audioOutput: 'opus' } : {}),
      }),
    { value: created, soak: mvpSoak },
  );
  if (mvpSoak) await page.locator('#audio-start').click();
  phase = 'certificate';
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
    (pointerOnly) =>
      window.bridgeViewer.stats.frames > 0 &&
      (pointerOnly ||
        !document.querySelector('[data-clipboard=send]').disabled),
    pointerSmoke,
  );
  if (mvpSoak) {
    phase = 'manual-source-audio';
    await page.locator('[data-clipboard-draft]').fill(tone);
    await page.evaluate(() => {
      const button = document.createElement('button');
      button.id = 'lab-notepad-ready';
      button.textContent = 'Блокнот готов — начать совместный тест';
      button.addEventListener('click', () => {
        button.dataset.ready = 'yes';
      });
      document.querySelector('#clipboard-text').append(button);
    });
    await page.locator('[data-clipboard=send]').scrollIntoViewIfNeeded();
    console.log(
      JSON.stringify({
        type: 'lab.mvp-source-ready',
        sourceCommandSent: false,
        durationSeconds: 1980,
        readinessFile: 'build/mvp-notepad-ready-' + process.pid,
      }),
    );
    await page.waitForFunction(
      () => window.bridgeViewer.stats.audio?.decoded > 0,
      undefined,
      { timeout: 300000 },
    );
    phase = 'manual-source-notepad';
    console.log(
      JSON.stringify({
        type: 'lab.mvp-audio-observed',
        firstPacketDecoded: true,
      }),
    );
    const preparedUntil = performance.now() + 120000;
    for (;;) {
      const clicked = await page.evaluate(
        () =>
          document.querySelector('#lab-notepad-ready').dataset.ready === 'yes',
      );
      const relayed = await access(notepadReadyPath).then(
        () => true,
        (error) => {
          if (error.code === 'ENOENT') return false;
          throw error;
        },
      );
      if (clicked || relayed) break;
      if (performance.now() >= preparedUntil)
        throw new Error('LAB_WAIT_FAILED');
      await delay(200);
    }
    sourceWrites = writes;
    requireResult(
      sourceWrites <= 1 &&
        !source.localPending &&
        (sourceWrites === 0 || source.localAccepted),
    );
    // Only now replace the local OS clipboard, after the user started the source.
    await page.evaluate((text) => navigator.clipboard.writeText(text), sent);
  }
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
  if (pointerSmoke) {
    phase = 'pointer-smoke';
    const snapshot = async () => {
      await chord('F2');
      const revision = source.revision;
      await chord('ControlLeft+KeyC');
      await wait(() => source.remoteText && source.revision > revision);
      await page.locator('[data-clipboard=read]').click();
      await page.waitForFunction(() =>
        document
          .querySelector('#clipboard-text [role=status]')
          .textContent.startsWith('Текст получен.'),
      );
      return parsePointerReceipt(
        await page.locator('[data-clipboard-received]').inputValue(),
      );
    };
    report.pointer = ownedReceiptRead
      ? { fixedReceipt: await snapshot() }
      : await runWindowsPointerSmoke({
          page,
          snapshot,
          reattach: async (releaseLocal) => {
            await page.evaluate(() => window.bridgeViewer.detach());
            // Release only after old input listeners are disposed and before a new
            // viewer can forward the up event and mask missing terminal release.
            await releaseLocal();
            await wait(() => !source.localPending && !source.localAccepted);
            const attach = {};
            for (const channel of ['control', 'media'])
              attach[channel] = await request(
                '/v1/sessions/' + sessionId + '/attach-token',
                'POST',
                { channel },
              );
            await page.evaluate(
              (created) =>
                window.bridgeViewer.attach(created, { codecs: ['jpeg'] }),
              { sessionId, attach },
            );
            await page.waitForFunction(
              () =>
                window.bridgeViewer.stats.frames > 0 &&
                !document.querySelector('[data-clipboard=read]').disabled,
            );
          },
        });
    // The prepared read-only page replaces Notepad in this explicit mode.
    // Do not edit a document or run the OS Clipboard API permission steps.
    await page.evaluate(() => window.bridgeViewer.detach());
    await wait(() => !source.localPending && !source.localAccepted);
    requireResult(writes === 0);
    report.detachedFieldsCleared = await page.evaluate(() =>
      [...document.querySelectorAll('#clipboard-text textarea')].every(
        (field) => field.value === '',
      ),
    );
    requireResult(report.detachedFieldsCleared);
    await request('/v1/sessions/' + sessionId, 'DELETE');
    phase = 'done';
  } else {
    phase = 'local-paste';
    const beforeLocalPasteWrites = writes;
    if (mvpSoak)
      await page.evaluate((text) => navigator.clipboard.writeText(text), sent);
    await page.locator('[data-clipboard=paste]').click();
    await page.waitForFunction(() =>
      document
        .querySelector('#clipboard-text [role=status]')
        .textContent.startsWith('Текст вставлен локально.'),
    );
    requireResult(
      await page.evaluate(
        (text) =>
          document.querySelector('[data-clipboard-draft]').value === text,
        sent,
      ),
    );
    requireResult(writes === beforeLocalPasteWrites);
    report.noSendDuringLocalPaste = true;
    phase = 'browser-to-notepad';
    await page.locator('[data-clipboard=send]').click();
    phase = 'browser-offer-ack';
    await wait(
      () =>
        writes === 1 + sourceWrites &&
        source.localAccepted &&
        !source.localPending,
    );
    phase = 'browser-to-notepad-paste';
    if (mvpSoak) await chord('ControlLeft+KeyA');
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
          (await navigator.clipboard.readText()).replace(/\r\n/g, '\n') ===
          text,
        returned,
      ),
    );
    report.notepadToBrowser = true;
    if (mvpSoak) {
      phase = 'mvp-soak';
      report.soak = await runMvpBrowserSoak({
        page,
        backend,
        workerPath: options.workerPath,
        metrics: async () => {
          const response = await server.inject({
            method: 'GET',
            url: '/metrics',
            headers: { authorization: 'Bearer ' + bearer },
          });
          requireResult(response.statusCode === 200);
          return response.body;
        },
        exerciseDocument: async () => {
          requireResult(state === 'connected');
          await chord('ArrowRight');
          await chord('KeyX');
          await chord('Backspace');
          await copyRemoteAndRead(returned);
        },
      });
      report.resize = [];
      for (const [width, height] of [
        [1280, 720],
        [1920, 1080],
      ]) {
        requireResult(
          (await page.evaluate(
            ({ width, height }) => window.bridgeViewer.resize(width, height),
            { width, height },
          )) === 'applied',
        );
        await page.waitForFunction(
          ({ width, height }) =>
            window.bridgeViewer.stats.width === width &&
            window.bridgeViewer.stats.height === height &&
            window.bridgeViewer.stats.displayGeneration ===
              window.bridgeViewer.stats.renderedGeneration,
          { width, height },
        );
        report.resize.push({ width, height });
      }
    }
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
    requireResult(writes === 1 + sourceWrites);
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
    if (mvpSoak) {
      phase = 'mvp-reattach';
      const attach = {};
      for (const channel of ['control', 'media'])
        attach[channel] = await request(
          '/v1/sessions/' + sessionId + '/attach-token',
          'POST',
          { channel },
        );
      await page.evaluate(
        (value) =>
          window.bridgeViewer.attach(value, {
            codecs: ['h264'],
            audioOutput: 'opus',
          }),
        { sessionId, attach },
      );
      await page.locator('#audio-start').click();
      await page.waitForFunction(
        () =>
          window.bridgeViewer.stats.frames > 0 &&
          window.bridgeViewer.stats.cursorShapes > 0 &&
          window.bridgeViewer.stats.audio?.decoded > 0,
        undefined,
        { timeout: 15000 },
      );
      await delay(500);
      report.audioReplay = await readViewerAudioObservation(page);
      requireResult(
        report.audioReplay.worklet.playedFrames > 0 &&
          report.audioReplay.worklet.invalidCalls === 0,
      );
      report.reattach = true;
      await page.evaluate(() => window.bridgeViewer.detach());
      await wait(() => !source.localPending && !source.localAccepted);
      requireResult(
        await page.evaluate(() =>
          [...document.querySelectorAll('#clipboard-text textarea')].every(
            (field) => field.value === '',
          ),
        ),
      );
    }
    await request('/v1/sessions/' + sessionId, 'DELETE');
    phase = 'done';
  }
} catch (error) {
  process.exitCode = 1;
  report.failedPhase = phase;
  report.ownTestDocumentMayRemain = ownDocument;
  report.failureKind = [
    'LAB_CHECK_FAILED',
    'LAB_WAIT_FAILED',
    'LAB_MVP_AUDIO_RECOVERY_FAILED',
    'LAB_MVP_AUDIO_PROGRESS_FAILED',
    'LAB_MVP_SOAK_BUDGET_FAILED',
    'LAB_SOAK_INVARIANT_FAILED',
  ].includes(error?.message)
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
  if (mvpSoak && page && !page.isClosed())
    report.lastAudio = await readViewerAudioObservation(page).catch(() => null);
  if (!mvpSoak && !ownedReceiptRead && focusEditor && state === 'connected') {
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
  if (mvpSoak) await rm(notepadReadyPath, { force: true });
  report.runtimeEmpty = await readdir(options.runtimeRoot).then(
    (items) => items.length === 0,
    () => false,
  );
  if (!report.runtimeEmpty) process.exitCode = 1;
  report.nativeState = state;
  if (mvpSoak && backend?.pid) {
    report.pidRetired = false;
    try {
      process.kill(backend.pid, 0);
    } catch (error) {
      report.pidRetired = error.code === 'ESRCH';
    }
    if (!report.pidRetired) process.exitCode = 1;
  }
  report.workerHash = profile.workerHash;
  console.log(JSON.stringify(report));
}
