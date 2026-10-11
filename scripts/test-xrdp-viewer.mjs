import { readFile, readdir, writeFile } from 'node:fs/promises';
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
const audioManual = ['--audio-manual', '--audio-opus-manual'].includes(
  process.argv[4],
);
const audioTest = ['--audio-test', '--audio-opus-test'].includes(
  process.argv[4],
);
const audioOutput = process.argv[4]?.startsWith('--audio-opus-')
  ? 'opus'
  : audioManual || audioTest
    ? 'pcm'
    : 'off';
const manual = process.argv[4] === '--manual' || audioManual;
const qualityTest = process.argv[4] === '--quality-test';
const resizeTest = process.argv[4] === '--resize-test';
const touchInventory = process.argv[4] === '--touch-inventory';
const quality = qualityTest
  ? {
      profile: 'low-bandwidth',
      maxFps: 5,
      targetBitrateKbps: 750,
      maxBitrateKbps: 1000,
    }
  : undefined;
const codecs = [mode === 'jpeg' ? 'jpeg' : 'h264'];
if (
  ![3, 4, 5].includes(process.argv.length) ||
  (process.argv.length === 5 &&
    !manual &&
    !qualityTest &&
    !resizeTest &&
    !touchInventory &&
    !audioTest) ||
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
let cursorUpdates = 0,
  nativeCursorShapes = 0,
  lastCursorId = 0n;
nativeWorker.onCursor((cursor) => {
  cursorUpdates++;
  if (!cursor.default && cursor.shapeId !== lastCursorId) nativeCursorShapes++;
  lastCursorId = cursor.shapeId;
});
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
  ['/harness/modifiers.js', 'modifiers.js', 'text/javascript'],
  ['/harness/wheel.js', 'wheel.js', 'text/javascript'],
  ['/harness/text.js', 'text.js', 'text/javascript'],
  ['/harness/cursor.js', 'cursor.js', 'text/javascript'],
  ['/harness/display.js', 'display.js', 'text/javascript'],
  ['/harness/touch.js', 'touch.js', 'text/javascript'],
  ['/harness/pcm-playback.js', 'pcm-playback.js', 'text/javascript'],
  ['/harness/opus-playback.js', 'opus-playback.js', 'text/javascript'],
  ['/harness/opus-wire.js', 'opus-wire.js', 'text/javascript'],
  ['/harness/pcm-worklet.js', 'pcm-worklet.js', 'text/javascript'],
  ['/harness/pcm-queue.js', 'pcm-queue.js', 'text/javascript'],
  ...[
    'wire',
    'sender',
    'capture',
    'worklet',
    'permission',
    'graph',
    'media',
    'owner',
  ].map((name) => [
    `/harness/microphone-${name}.js`,
    `microphone-${name}.js`,
    'text/javascript',
  ]),
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
const resizeEvidence = [];
let restoreNeeded = false;
try {
  await server.listen({ host: '127.0.0.1', port: 47999 });
  const created = await server.inject({
    method: 'POST',
    url: '/v1/sessions',
    headers: { authorization: 'Bearer ' + bearer },
    payload: {
      target: { host: lab.host, port: lab.port },
      auth: { username: credentials.username, password: credentials.password },
      display: {
        width: 1920,
        height: 1080,
        dynamicResolution: resizeTest || manual,
      },
      input: { touch: manual || touchInventory },
      media: { audioOutput },
      security: { certificatePolicy: 'prompt' },
      timeouts: { connectMs: audioManual ? 120000 : 20000, tcpAckMs: 10000 },
      ...(quality ? { quality } : {}),
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
    ({ created, codecs, audioOutput }) =>
      window.bridgeViewer.attach(created, { codecs, audioOutput }),
    { created: attachment, codecs, audioOutput },
  );
  if (audioTest) await page.click('#audio-start');
  if (audioManual)
    console.log('Нажмите «Включить звук и подключиться» в окне Edge.');
  phase = 'certificate';
  await page.waitForFunction(
    () => !document.querySelector('#certificate').hidden,
    undefined,
    { timeout: audioManual ? 120000 : 20000 },
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
  if (audioTest) {
    await page.waitForFunction(
      () =>
        Boolean(window.bridgeViewer.stats.audio?.source) &&
        !window.bridgeViewer.stats.audio.recordInFlight,
    );
    await page.evaluate(() => window.bridgeViewer.requestAudioStats());
    await page.waitForFunction(
      () =>
        Boolean(window.bridgeViewer.stats.audio.remote) &&
        !window.bridgeViewer.stats.audio.inFlight,
    );
  }
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
      (qualityTest && stats.maxFps !== 5) ||
      (mode !== 'jpeg' && stats.keyframes < 1) ||
      (mode === 'h264-reset' && stats.resets !== 1)
    )
      throw new Error('LAB_CODEC_OR_RECOVERY_FAILED');
    if (resizeTest) {
      for (const [width, height] of [
        [1280, 720],
        [1920, 1080],
      ]) {
        phase = 'resize-' + width;
        const before = await page.evaluate(() => window.bridgeViewer.stats);
        restoreNeeded = true;
        const result = await page.evaluate(
          ({ width, height }) => window.bridgeViewer.resize(width, height),
          { width, height },
        );
        if (result !== 'applied') throw new Error('LAB_RESIZE_NOT_APPLIED');
        await page.waitForFunction(
          ({ width, height, previous }) => {
            const value = window.bridgeViewer.stats;
            const matches =
              value.width === width &&
              value.height === height &&
              value.frames > previous.frames &&
              value.renderedGeneration === value.displayGeneration &&
              value.displayGeneration !== previous.displayGeneration;
            if (!matches) return false;
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
            return max - min > 20;
          },
          { width, height, previous: before },
          { timeout: 10000 },
        );
        const after = await page.evaluate(() => window.bridgeViewer.stats);
        if (
          after.closed ||
          after.error ||
          after.configurations <= before.configurations ||
          (mode !== 'jpeg' && after.keyframes <= before.keyframes)
        )
          throw new Error('LAB_RESIZE_DISCONTINUITY_FAILED');
        resizeEvidence.push({
          width,
          height,
          generation: after.displayGeneration,
          configurations: after.configurations,
          keyframes: after.keyframes,
          hasImage: true,
        });
        if (width === 1920) restoreNeeded = false;
      }
      const unchanged = await page.evaluate(() =>
        window.bridgeViewer.resize(1920, 1080),
      );
      const invalid = await page.evaluate(() =>
        window.bridgeViewer.resize(1281, 720),
      );
      if (unchanged !== 'unchanged' || invalid !== 'invalid')
        throw new Error('LAB_RESIZE_RESULT_FAILED');
    }
    let touchEvidence;
    if (touchInventory) {
      phase = 'touch-inventory';
      await page.waitForFunction(
        () => window.bridgeViewer.touch?.inputReady,
        undefined,
        { timeout: 10000 },
      );
      touchEvidence = await page.evaluate(() => window.bridgeViewer.touch);
      if (
        touchEvidence.width !== 1920 ||
        touchEvidence.height !== 1080 ||
        touchEvidence.maxContacts !== 10
      )
        throw new Error('LAB_TOUCH_READY_FAILED');
    }
    const pipeline = await nativeWorker.pipelineStats();
    const telemetry = await server.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: 'Bearer ' + bearer },
    });
    if (telemetry.statusCode !== 200)
      throw new Error('LAB_MEDIA_METRICS_FAILED');
    const mediaMetricsArtifact = '.local-tests/media-metrics-' + mode + '.prom';
    // Only fixed media metric names/codec/stage labels; no session or lab identity.
    await writeFile(
      resolve(mediaMetricsArtifact),
      telemetry.body
        .split('\n')
        .filter((line) => line.startsWith('bridge_media_'))
        .join('\n') + '\n',
    );
    phase = 'pointer';
    const desktop = await page.locator('#desktop').boundingBox();
    if (!desktop) throw new Error('LAB_INPUT_VIEW_UNAVAILABLE');
    // Motion only: never click or type into the lab's operational desktop.
    await page.mouse.move(desktop.x + 10, desktop.y + 10);
    const inputDeadline = Date.now() + 3000;
    while (inputMoves === 0 && Date.now() < inputDeadline) await delay(10);
    if (inputMoves === 0) throw new Error('LAB_INPUT_MOVE_FAILED');
    await page.waitForFunction(
      () => window.bridgeViewer.stats.cursorShapes > 0,
      undefined,
      { timeout: 3000 },
    ); // This XRDP lab supplies a custom shape after motion.
    const cursorShapesAfterMotion = await page.evaluate(
      () => window.bridgeViewer.stats.cursorShapes,
    );
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
    let nativeCaptureMinIntervalUs;
    if (qualityTest) {
      // Let the media lease's final pending pull settle, then bypass Node pacing.
      await delay(350);
      const timestamps = [];
      for (let i = 0; i < 3; i++) {
        const frame = await nativeWorker.captureFrame(0n, {
          codec: codecs[0],
          forceKeyframe: true,
        });
        if (!frame || !(frame.avc || frame.jpeg))
          throw new Error('LAB_QUALITY_CAPTURE_FAILED');
        timestamps.push(frame.timestampUs);
      }
      nativeCaptureMinIntervalUs = Number(
        timestamps.slice(1).reduce((minimum, value, index) => {
          const interval = value - timestamps[index];
          return interval < minimum ? interval : minimum;
        }, 1000000000n),
      );
      if (nativeCaptureMinIntervalUs < 200000)
        throw new Error('LAB_NATIVE_FPS_CAP_FAILED');
    }
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
      ({ created, codecs, audioOutput }) =>
        window.bridgeViewer.attach(created, { codecs, audioOutput }),
      { created: { sessionId, attach: nextAttach }, codecs, audioOutput },
    );
    if (audioTest) await page.click('#audio-start');
    await page.waitForFunction(
      () =>
        window.bridgeViewer.stats.frames > 0 &&
        window.bridgeViewer.stats.cursorShapes > 0,
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
    if (touchInventory) {
      phase = 'touch-replay';
      await page.waitForFunction(
        () => window.bridgeViewer.touch?.inputReady,
        undefined,
        { timeout: 5000 },
      );
      const replay = await page.evaluate(() => window.bridgeViewer.touch);
      if (
        replay.generation !== touchEvidence.generation ||
        replay.width !== touchEvidence.width ||
        replay.height !== touchEvidence.height ||
        replay.maxContacts !== touchEvidence.maxContacts ||
        BigInt(replay.revision) < BigInt(touchEvidence.revision)
      )
        throw new Error('LAB_TOUCH_REPLAY_FAILED');
    }
    if (
      resizeTest &&
      !(await page.evaluate(() => {
        const value = window.bridgeViewer.stats;
        return (
          value.displayGeneration === value.renderedGeneration &&
          value.width === 1920 &&
          value.height === 1080
        );
      }))
    )
      throw new Error('LAB_DISPLAY_REPLAY_FAILED');
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
        cursorShapesAfterMotion,
        nativeCursorUpdates: cursorUpdates,
        nativeCursorShapes,
        cursorReplayed: true,
        reattach: true,
        ...(audioTest
          ? {
              browserAudioActivated: true,
              audibleAcceptance: false,
              remoteAudioGenerated: false,
            }
          : {}),
        ...(touchInventory
          ? { touchEvidence, touchReplayed: true, remoteTouchSent: false }
          : {}),
        ...(resizeTest ? { resizeEvidence, displayReplayed: true } : {}),
        pipeline,
        ...(qualityTest
          ? { qualityProfile: quality.profile, nativeCaptureMinIntervalUs }
          : {}),
        mediaMetricsArtifact,
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
  if (restoreNeeded) {
    let result;
    const restoreDeadline = Date.now() + 7000;
    do {
      result = await nativeWorker
        .resizeDisplay(1920, 1080)
        .catch(() => 'send-failed');
      if (result !== 'busy') break;
      await delay(100);
    } while (Date.now() < restoreDeadline);
    if (!['applied', 'unchanged'].includes(result)) {
      console.error('LAB_DISPLAY_RESTORE_FAILED');
      process.exitCode = 1;
    }
  }
  await browser?.close();
  await server.close();
  const leftovers = await readdir(options.runtimeRoot);
  if (leftovers.length) {
    console.error('LAB_RUNTIME_NOT_EMPTY');
    process.exitCode = 1;
  }
}
