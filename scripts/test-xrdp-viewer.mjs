import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
import { createSessionServer } from '../apps/bridge-api/dist/session-server.js';
import {
  NativeSessionWorker,
  WorkerProcess,
} from '../packages/node-bridge/dist/index.js';
import { LabRdpDiagnostics } from './lab-rdp-diagnostics.mjs';
import {
  AudioNegotiationDiagnostics,
  AudioSummaryDiagnostics,
  AudioCauseDiagnostics,
} from './audio-negotiation-diagnostics.mjs';
import { createLabRdpProxy } from './lab-rdp-proxy.mjs';
import { waitForViewerClose } from './viewer-window.mjs';
import { viewerMediaOptions } from './viewer-media-options.mjs';
import { readViewerAudioObservation } from './viewer-audio-observation.mjs';
import { readViewerPipelineObservation } from './viewer-pipeline-observation.mjs';
import {
  dispatchWindowsLabTone,
  windowsLabToneCommand,
} from './windows-lab-tone.mjs';
import { AudioResetDiagnostics } from './audio-reset-diagnostics.mjs';
import { viewerWorkerOptions } from './viewer-worker-options.mjs';
import { viewerLabFiles, requireOwnedLabTarget } from './viewer-lab-files.mjs';
import {
  ownedPointerReader,
  ownedInputStateReader,
} from './owned-xrdp-pointer.mjs';
import { runWindowsPointerSmoke } from './windows-lab-pointer.mjs';
import {
  ViewerSoak,
  soakDurationMs,
  soakIntervalMs,
  windowsWorkerResidentBytes,
  mediaCredit,
} from './viewer-soak.mjs';

// User-authorized local XRDP check: browser and API bind only to this machine.
const fingerprint = process.argv[2];
const labFiles = viewerLabFiles(process.env.BRIDGE_LAB_PROFILE);
const mode = process.argv[3] ?? 'jpeg';
const {
  microphoneManual,
  microphoneTest,
  microphone,
  audioManual,
  audioTest,
  audioOutput,
  audioOutputBufferMs,
  listenPreview,
  tonePreview,
  toneDurationSeconds = 45,
  previewDurationMs = 60000,
  manualSource = false,
  audioRecoveryTest,
  manual,
} = viewerMediaOptions(process.argv[4]);
const qualityTest = process.argv[4] === '--quality-test';
const resizeTest = process.argv[4] === '--resize-test';
const soakTest = process.argv[4] === '--soak-test';
const ownedHeldLossTest = process.argv[4] === '--owned-held-loss-test';
const transportLossTest =
  process.argv[4] === '--transport-loss-test' || ownedHeldLossTest;
const touchInventory = process.argv[4] === '--touch-inventory';
const ownedPointerTest = process.argv[4] === '--owned-pointer-test';
const ownedRecoveryTest = process.argv[4] === '--owned-recovery-test';
if (
  (ownedPointerTest || ownedHeldLossTest || ownedRecoveryTest) &&
  process.env.BRIDGE_LAB_PROFILE !== 'owned-container'
)
  throw new Error('LAB_OWNED_TARGET_REFUSED');
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
  ![3, 4, 5, 6].includes(process.argv.length) ||
  (process.argv.length >= 5 &&
    !manual &&
    !qualityTest &&
    !resizeTest &&
    !soakTest &&
    !transportLossTest &&
    !touchInventory &&
    !ownedPointerTest &&
    !ownedRecoveryTest &&
    !audioTest &&
    !microphoneTest) ||
  (manual && mode === 'h264-reset') ||
  !['jpeg', 'h264', 'h264-reset'].includes(mode) ||
  !/^sha256:[0-9a-f]{64}$/.test(fingerprint ?? '')
)
  throw new Error('Pass the previously verified certificate fingerprint');
const { options, profile: nativeProfile } = await viewerWorkerOptions(
  process.argv[5],
  resolve('.'),
);
if (labFiles.ownedContainer)
  options.runtimeRoot = resolve('.runtime/owned-viewer-lab');
if (nativeProfile)
  console.log(
    JSON.stringify({
      type: 'lab.browser.native-profile',
      v: 1,
      receipt: nativeProfile.receipt,
      buildType: nativeProfile.buildType,
      sourceHash: nativeProfile.sourceHash,
      workerHash: nativeProfile.workerHash,
      helperHash: nativeProfile.helperHash,
    }),
  );
const readJson = async (path) =>
  JSON.parse((await readFile(resolve(path), 'utf8')).replace(/^\uFEFF/, ''));
const lab = await readJson(labFiles.config);
if (labFiles.ownedContainer)
  requireOwnedLabTarget(lab, process.env.BRIDGE_LAB_PROFILE);
if (
  tonePreview &&
  (lab.host !== '192.168.21.149' || (lab.port ?? 3389) !== 3389)
)
  throw new Error('LAB_TONE_TARGET_REFUSED');
const credentials = await readJson(labFiles.credentials);
const origin = 'http://127.0.0.1:47999';
const bearer = randomBytes(32).toString('base64url');
const rdpDiagnostics = new LabRdpDiagnostics();
const audioNegotiation = new AudioNegotiationDiagnostics();
const audioSummary = new AudioSummaryDiagnostics();
const audioCauses = new AudioCauseDiagnostics();
class DiagnosticProcess extends WorkerProcess {
  spawnWorker(directory, env) {
    const child = super.spawnWorker(directory, env);
    child.stderr.on('data', (bytes) => {
      rdpDiagnostics.push(bytes);
      audioNegotiation.push(bytes);
      audioSummary.push(bytes);
      audioCauses.push(bytes);
    });
    return child;
  }
}
class DiagnosticSession extends NativeSessionWorker {
  createWorkerProcess(options) {
    return new DiagnosticProcess(options);
  }
}
const nativeWorker = new DiagnosticSession(
  options,
  manualSource ? { clipboardItemBytes: 2048 } : {},
);
const audioResets = new AudioResetDiagnostics();
nativeWorker.resetAudio = audioResets.wrap(
  nativeWorker.resetAudio.bind(nativeWorker),
);
let nativeState = 'created';
let nativeFailure;
let clipboardSourceEvents = 0;
const releaseClipboardSource = nativeWorker.onClipboard(() => {
  ++clipboardSourceEvents;
});
const releaseNativeState = nativeWorker.onState((state) => {
  nativeState = state;
});
const releaseNativeFailure = nativeWorker.onFailure((code) => {
  nativeFailure = /^[A-Z_]{1,64}$/.test(code ?? '') ? code : 'UNCLASSIFIED';
});
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
  if (
    !manual &&
    !ownedPointerTest &&
    !ownedHeldLossTest &&
    !['move', 'reset'].includes(event.type)
  )
    throw new Error('LAB_READ_ONLY_INPUT');
  await deliverInput(event);
  if (event.type === 'move') inputMoves++;
  else if (event.type === 'reset') inputResets++;
};
let audioResetRequests = 0;
let audioResetScheduled = 0;
if (audioRecoveryTest) {
  const resetAudio = nativeWorker.resetAudio.bind(nativeWorker);
  nativeWorker.resetAudio = async (epoch) => {
    audioResetRequests++;
    const result = await resetAudio(epoch);
    if (result === 'scheduled') audioResetScheduled++;
    return result;
  };
}
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
  ...['wire', 'text', 'client', 'view'].map((name) => [
    `/harness/clipboard-${name}.js`,
    `clipboard-${name}.js`,
    'text/javascript',
  ]),
  ['/harness/session-form.js', 'session-form.js', 'text/javascript'],
  ['/harness/connection-config.js', 'connection-config.js', 'text/javascript'],
  ['/harness/connection-owner.js', 'connection-owner.js', 'text/javascript'],
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
    'opus-wire',
    'opus-sender',
    'opus-encoder',
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
let soakEvidence;
let failureEvidence;
let transportEvidence;
let transportProxy;
let restoreNeeded = false;
const clipboardOffInventory = async () => {
  if (manualSource)
    return { clipboardSelected: true, clipboardApiMocked: false };
  const browser = await page.evaluate(() => ({
    clipboardRequests: window.labClipboardRequests,
    clipboardControlsDisabled:
      [...document.querySelectorAll('#clipboard-text button')].length === 5 &&
      [...document.querySelectorAll('#clipboard-text button')].every(
        (button) => button.disabled,
      ),
    clipboardFieldsEmpty:
      [...document.querySelectorAll('#clipboard-text textarea')].length === 2 &&
      [...document.querySelectorAll('#clipboard-text textarea')].every(
        (field) => field.value === '',
      ),
  }));
  if (
    clipboardSourceEvents ||
    browser.clipboardRequests !== 0 ||
    !browser.clipboardControlsDisabled ||
    !browser.clipboardFieldsEmpty
  )
    throw new Error('LAB_UNEXPECTED_CLIPBOARD_ACTIVATION');
  return {
    clipboardSelected: false,
    clipboardApiMocked: true,
    clipboardSourceEvents,
    ...browser,
  };
};
try {
  let recoveryBefore;
  if (ownedRecoveryTest) {
    recoveryBefore = await (await ownedInputStateReader())();
    if (recoveryBefore.buttons !== 1)
      throw new Error('LAB_OWNED_RECOVERY_PRECONDITION');
  }
  if (transportLossTest)
    transportProxy = await createLabRdpProxy(lab.host, lab.port ?? 3389);
  await server.listen({ host: '127.0.0.1', port: 47999 });
  const created = await server.inject({
    method: 'POST',
    url: '/v1/sessions',
    headers: { authorization: 'Bearer ' + bearer },
    payload: {
      target: {
        host: transportProxy?.host ?? lab.host,
        port: transportProxy?.port ?? lab.port,
      },
      auth: { username: credentials.username, password: credentials.password },
      display: {
        width: 1920,
        height: 1080,
        dynamicResolution: resizeTest || soakTest || manual,
      },
      input: { touch: manual || touchInventory },
      ...(manualSource
        ? {
            clipboard: {
              mode: 'browser-to-server',
              text: true,
              maxItemBytes: 2048,
            },
          }
        : {}),
      media: {
        audioOutput,
        microphone,
        ...(audioOutputBufferMs ? { audioOutputBufferMs } : {}),
      },
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
  if (!manualSource)
    await page.addInitScript(() => {
      window.labClipboardRequests = 0;
      const refused = () => {
        ++window.labClipboardRequests;
        return Promise.reject(new Error('LAB_CLIPBOARD_DISABLED'));
      };
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { readText: refused, writeText: refused },
      });
    });
  if (microphoneTest)
    await page.addInitScript(() => {
      window.labMicrophoneRequests = 0;
      navigator.mediaDevices.getUserMedia = async () => {
        ++window.labMicrophoneRequests;
        throw new Error('LAB_MICROPHONE_CAPTURE_DISABLED');
      };
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
    ({ created, codecs, audioOutput, microphone }) =>
      window.bridgeViewer.attach(created, { codecs, audioOutput, microphone }),
    { created: attachment, codecs, audioOutput, microphone },
  );
  // This dedicated authorized output-only lab mode performs the activation click.
  // Waiting for a manual click here can expire the already-created certificate prompt.
  if (audioTest || audioManual) await page.click('#audio-start');
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
  await clipboardOffInventory();
  if (manualSource) {
    await page
      .locator('[data-clipboard-draft]')
      .fill(windowsLabToneCommand(180));
    await page.locator('[data-clipboard=send]').scrollIntoViewIfNeeded();
    console.log(
      JSON.stringify({
        type: 'lab.browser.manual-source-ready',
        v: 1,
        commandSent: false,
        clipboardDirection: 'browser-to-server',
        maximum: 2048,
      }),
    );
  }
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
  let microphoneEvidence;
  if (microphoneTest) {
    await page.waitForFunction(() =>
      Boolean(window.bridgeViewer.stats.microphone?.source),
    );
    microphoneEvidence = await page.evaluate(
      () => window.bridgeViewer.stats.microphone,
    );
    if (
      microphoneEvidence.owner.requests !== 0 ||
      microphoneEvidence.sent !== 0 ||
      microphoneEvidence.owner.preparing ||
      microphoneEvidence.owner.active ||
      (await page.evaluate(() => window.labMicrophoneRequests !== 0))
    )
      throw new Error('LAB_UNEXPECTED_MICROPHONE_CAPTURE');
  }
  if (transportLossTest) {
    phase = 'transport-loss';
    await delay(ownedHeldLossTest ? 15000 : 2000);
    const before = await page.evaluate(() => {
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
      nativeState !== 'connected' ||
      nativeFailure ||
      before.error ||
      before.closed ||
      !before.hasImage ||
      before.frames < 1 ||
      before.width !== 1920 ||
      before.height !== 1080
    )
      throw new Error('LAB_PROXY_DESKTOP_NOT_ACTIVE');
    let readInputState, heldBefore;
    if (ownedHeldLossTest) {
      phase = 'owned-input-baseline';
      readInputState = await ownedInputStateReader();
      const initial = await readInputState();
      if (initial.controlLeft || initial.buttons !== 0)
        throw new Error('LAB_OWNED_INPUT_NOT_CLEAR');
      await page.locator('#desktop').scrollIntoViewIfNeeded();
      const box = await page.locator('#desktop').boundingBox();
      if (!box) throw new Error('LAB_INPUT_VIEW_UNAVAILABLE');
      await page.locator('#desktop').focus();
      await page.mouse.move(box.x + 20, box.y + 20);
      await page.mouse.down();
      await page.keyboard.down('ControlLeft');
      await delay(300);
      phase = 'owned-input-held';
      heldBefore = await readInputState();
      console.log(
        JSON.stringify({
          type: 'lab.owned-input-precondition',
          before: heldBefore,
          inputMoves,
          inputResets,
          viewerClosed: await page.evaluate(
            () => window.bridgeViewer.stats.closed,
          ),
        }),
      );
      if (!heldBefore.controlLeft || heldBefore.buttons !== 1)
        throw new Error('LAB_OWNED_HELD_INPUT_NOT_OBSERVED');
    }
    phase = 'transport-loss';
    transportProxy.interrupt();
    const deadline = performance.now() + 7000;
    let retired = false;
    do {
      const state = await server.inject({
        method: 'GET',
        url: '/v1/sessions/' + sessionId,
        headers: { authorization: 'Bearer ' + bearer },
      });
      const view = await page.evaluate(() => window.bridgeViewer.stats);
      if (
        ['RDP_PROTOCOL_ERROR', 'RDP_DISCONNECTED'].includes(nativeFailure) &&
        state.statusCode === 200 &&
        state.json().state === 'failed' &&
        view.closed
      ) {
        retired = true;
        break;
      }
      await delay(50);
    } while (performance.now() < deadline);
    if (!retired) throw new Error('LAB_TRANSPORT_LOSS_NOT_RETIRED');
    if (ownedHeldLossTest) {
      // The RDP relay is already interrupted and the old viewer retired:
      // these local ups cannot conceal missing remote terminal release.
      await page.keyboard.up('ControlLeft');
      await page.mouse.up();
      await delay(300);
      const after = await readInputState();
      console.log(
        JSON.stringify({
          type: 'lab.owned-transport-held-input',
          readback: 'owned-X11-state',
          before: heldBefore,
          after,
          // Agreed production boundary: a broken TCP cannot deliver UP.
          // A separate fresh-connection check must prove startup clearing.
          requiresFreshConnectionReset:
            after.controlLeft || after.buttons !== 0,
        }),
      );
    }
    transportEvidence = {
      type: 'lab.transport-loss',
      actualRdp: true,
      browserFramesBeforeLoss: before.frames,
      width: before.width,
      height: before.height,
      nativeFailure,
      proxy: transportProxy.snapshot(),
      microphoneCaptured: false,
      remoteInputSent: ownedHeldLossTest,
    };
  } else if (manual) {
    phase = 'manual';
    console.log(
      'Ручной просмотр открыт в Edge. Щёлкните по рабочему столу для ввода.',
    );
    console.log(
      'Для завершения закройте окно Edge или нажмите Ctrl+C в этом терминале.',
    );
    if (microphoneManual)
      console.log(
        'Микрофон включается только отдельной кнопкой после готовности удалённого канала.',
      );
    if (listenPreview) {
      if (manualSource) {
        phase = 'manual-source-wait';
        await page.waitForFunction(
          () => window.bridgeViewer.stats.audio?.decoded > 0,
          undefined,
          { timeout: 300000 },
        );
        console.log(
          JSON.stringify({
            type: 'lab.browser.audio-source-observed',
            v: 1,
            firstPacketDecoded: true,
            observationDurationMs: previewDurationMs,
          }),
        );
      }
      if (tonePreview) {
        phase = 'tone-source-input';
        await dispatchWindowsLabTone(
          deliverInput,
          lab,
          undefined,
          toneDurationSeconds,
        );
        console.log(
          JSON.stringify({
            type: 'lab.browser.tone-input',
            v: 1,
            sourceCommandDispatched: true,
            sourceDurationSeconds: toneDurationSeconds,
            sourceReadbackVerified: false,
            microphoneCaptured: false,
          }),
        );
      }
      phase = 'audio-preview';
      const timer = new AbortController();
      try {
        await Promise.race([
          waitForViewerClose(browser, page),
          delay(previewDurationMs, undefined, { signal: timer.signal }),
        ]);
      } finally {
        timer.abort();
      }
      const observation = page.isClosed()
        ? null
        : await readViewerAudioObservation(page).catch(() => null);
      const pipeline = await readViewerPipelineObservation(nativeWorker);
      console.log(
        JSON.stringify({
          type: 'lab.browser.native-pipeline',
          v: 1,
          stats: pipeline,
        }),
      );
      console.log(
        JSON.stringify({
          type: 'lab.browser.audio-preview',
          v: 1,
          observation,
          audibleAcceptance: false,
          remoteAudioGenerated: tonePreview || manualSource ? null : false,
          ...(tonePreview
            ? { sourceCommandDispatched: true, sourceReadbackVerified: false }
            : {}),
        }),
      );
    } else await waitForViewerClose(browser, page);
  } else {
    phase = 'pixels';
    await delay(15000); // Let the remote login/desktop finish painting before visual verification.
    if (audioTest) {
      const previous = await page.evaluate(
        () => window.bridgeViewer.stats.audio.remote,
      );
      if (!(await page.evaluate(() => window.bridgeViewer.requestAudioStats())))
        throw new Error('LAB_AUDIO_STATS_UNAVAILABLE');
      await page.waitForFunction(
        (previous) => {
          const audio = window.bridgeViewer.stats.audio;
          const remote = audio?.remote;
          return (
            remote &&
            !audio.inFlight &&
            [
              'configurations',
              'packets',
              'playedFrames',
              'bufferingSilenceFrames',
            ].some((field) => remote[field] > (previous?.[field] ?? 0))
          );
        },
        previous,
        { timeout: 5000 },
      );
    }
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
    if (ownedRecoveryTest) {
      phase = 'owned-fresh-control-recovery';
      const after = await (await ownedInputStateReader())();
      console.log(
        JSON.stringify({
          type: 'lab.owned-public-input-recovery',
          before: recoveryBefore,
          after,
          inputResets,
          observerInjectedInput: false,
        }),
      );
      if (after.buttons !== 0 || after.controlLeft || inputResets !== 1)
        throw new Error('LAB_OWNED_RECOVERY_FAILED');
    }
    if (ownedPointerTest) {
      phase = 'owned-application-pointer';
      const readReceipt = await ownedPointerReader();
      await page.locator('#desktop').click({ position: { x: 400, y: 300 } });
      const pointer = await runWindowsPointerSmoke({
        page,
        snapshot: async () => {
          await page.locator('#desktop').focus();
          await page.keyboard.press('F2');
          await delay(300);
          return readReceipt();
        },
        reattach: async (releaseLocal) => {
          await page.evaluate(() => window.bridgeViewer.detach());
          await releaseLocal();
          await delay(100);
          const attach = {};
          for (const channel of ['control', 'media']) {
            const response = await server.inject({
              method: 'POST',
              url: '/v1/sessions/' + sessionId + '/attach-token',
              headers: { authorization: 'Bearer ' + bearer },
              payload: { channel },
            });
            if (response.statusCode !== 200)
              throw new Error('LAB_REATTACH_TOKEN_FAILED');
            attach[channel] = response.json();
          }
          await page.evaluate(
            ({ sessionId, attach, codecs }) =>
              window.bridgeViewer.attach({ sessionId, attach }, { codecs }),
            { sessionId, attach, codecs },
          );
          await page.waitForFunction(
            () => window.bridgeViewer.stats.frames > 0,
          );
        },
      });
      console.log(
        JSON.stringify({
          type: 'lab.owned-application-pointer',
          readback: 'owned-X11-primary',
          clipboardSelected: false,
          ...pointer,
        }),
      );
    }
    if (soakTest) {
      phase = 'soak';
      const collector = new ViewerSoak();
      const started = performance.now();
      for (;;) {
        const elapsedMs = Math.floor(performance.now() - started);
        const view = await page.evaluate(() => window.bridgeViewer.stats);
        const telemetry = await server.inject({
          method: 'GET',
          url: '/metrics',
          headers: { authorization: 'Bearer ' + bearer },
        });
        if (
          nativeState !== 'connected' ||
          nativeFailure ||
          telemetry.statusCode !== 200
        )
          throw new Error('LAB_SOAK_LIFECYCLE_FAILED');
        collector.observe(
          elapsedMs,
          view,
          await windowsWorkerResidentBytes(
            nativeWorker.pid,
            options.workerPath,
          ),
          process.memoryUsage().rss,
          mediaCredit(telemetry.body, codecs[0]),
        );
        soakEvidence = collector.snapshot();
        console.log(
          JSON.stringify({ type: 'lab.soak.progress', ...soakEvidence }),
        );
        if (elapsedMs >= soakDurationMs) break;
        await delay(Math.min(soakIntervalMs, soakDurationMs - elapsedMs));
      }
      if (!soakEvidence.workerMemoryBudgetPassed)
        throw new Error('LAB_SOAK_MEMORY_BUDGET_FAILED');
    }
    if (resizeTest || soakTest) {
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
    if (audioRecoveryTest) phase = 'audio-source-ready';
    const audioBeforeReattach = audioRecoveryTest
      ? await page.evaluate(() => window.bridgeViewer.stats.audio)
      : undefined;
    const resetsBeforeReattach = audioResetScheduled;
    if (
      audioRecoveryTest &&
      (audioBeforeReattach?.source?.availability !== 'ready' ||
        !audioBeforeReattach.source.enabled ||
        !(audioBeforeReattach.remote?.packets > 0) ||
        !(audioBeforeReattach.remote?.playedFrames > 0))
    )
      throw new Error('LAB_AUDIO_SOURCE_NOT_READY');
    phase = 'snapshot';
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
      ({ created, codecs, audioOutput, microphone }) =>
        window.bridgeViewer.attach(created, {
          codecs,
          audioOutput,
          microphone,
        }),
      {
        created: { sessionId, attach: nextAttach },
        codecs,
        audioOutput,
        microphone,
      },
    );
    if (audioTest) await page.click('#audio-start');
    let audioReplayEvidence;
    if (audioRecoveryTest) {
      phase = 'audio-replay';
      const deadline = performance.now() + 15000;
      do {
        await page.evaluate(() => window.bridgeViewer.requestAudioStats());
        await delay(200);
        const audio = await page.evaluate(
          () => window.bridgeViewer.stats.audio,
        );
        if (
          audio?.source?.enabled &&
          audio.source.availability === 'ready' &&
          !audio.source.awaitingConfig &&
          !audio.closed &&
          audio.remote?.configurations > 0 &&
          audio.remote.packets > 0 &&
          audio.remote.playedFrames > 0 &&
          audio.remote.invalidCalls === 0 &&
          (audioOutput !== 'opus' ||
            (audio.decoded > 0 &&
              BigInt(audio.source.epoch) >
                BigInt(audioBeforeReattach.source.epoch) &&
              audioResetScheduled > resetsBeforeReattach))
        ) {
          audioReplayEvidence = {
            codec: audioOutput,
            previousEpoch: audioBeforeReattach.source.epoch,
            currentEpoch: audio.source.epoch,
            resetRequests: audioResetRequests,
            scheduledSinceDetach: audioResetScheduled - resetsBeforeReattach,
            configurations: audio.remote.configurations,
            packets: audio.remote.packets,
            playedFrames: audio.remote.playedFrames,
            ...(audioOutput === 'opus' ? { decoded: audio.decoded } : {}),
          };
          break;
        }
      } while (performance.now() < deadline);
      if (!audioReplayEvidence) throw new Error('LAB_AUDIO_REPLAY_FAILED');
    }
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
    if (microphoneTest) {
      await page.waitForFunction(() =>
        Boolean(window.bridgeViewer.stats.microphone?.source),
      );
      const replay = await page.evaluate(
        () => window.bridgeViewer.stats.microphone,
      );
      if (
        replay.owner.requests !== 0 ||
        replay.sent !== 0 ||
        replay.owner.preparing ||
        replay.owner.active ||
        replay.cleanupFailed ||
        replay.source.epoch !== microphoneEvidence.source.epoch ||
        BigInt(replay.source.revision) <
          BigInt(microphoneEvidence.source.revision) ||
        (await page.evaluate(() => window.labMicrophoneRequests !== 0))
      )
        throw new Error('LAB_MICROPHONE_REPLAY_FAILED');
    }
    if (
      (resizeTest || soakTest) &&
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
        ...(await clipboardOffInventory()),
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
              ...(audioRecoveryTest ? { audioReplayEvidence } : {}),
            }
          : {}),
        ...(microphoneTest
          ? {
              microphoneEvidence,
              microphoneCodec: microphone,
              microphoneReplayed: true,
              capturePermissionRequested: false,
              physicalCapture: false,
              microphoneSamplesSent: 0,
              remoteMicrophoneAcceptance: false,
            }
          : {}),
        ...(touchInventory
          ? { touchEvidence, touchReplayed: true, remoteTouchSent: false }
          : {}),
        ...(resizeTest || soakTest
          ? { resizeEvidence, displayReplayed: true }
          : {}),
        ...(soakTest ? { soakEvidence } : {}),
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
  failureEvidence = {
    type: 'lab.browser.failure',
    phase,
    stats,
    nativeState,
    nativeFailure,
  };
  console.error(
    'Local XRDP browser check failed; credentials and raw diagnostics omitted',
  );
  process.exitCode = 1;
} finally {
  releaseNativeState();
  releaseNativeFailure();
  releaseClipboardSource();
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
  try {
    await browser?.close();
  } finally {
    try {
      await server.close();
    } finally {
      await transportProxy?.close();
    }
  }
  if (failureEvidence)
    console.log(
      JSON.stringify({
        ...failureEvidence,
        rdpDiagnostics: rdpDiagnostics.snapshot(),
        ...(soakTest ? { soakEvidence } : {}),
      }),
    );
  const leftovers = await readdir(options.runtimeRoot);
  if (leftovers.length) {
    console.error('LAB_RUNTIME_NOT_EMPTY');
    process.exitCode = 1;
  }
  if (audioTest || audioManual)
    console.log(
      JSON.stringify({
        type: 'lab.browser.audio-negotiation',
        v: 1,
        negotiation: audioNegotiation.snapshot() ?? null,
        nativeCounters: audioSummary.snapshot() ?? null,
        nativeCauses: audioCauses.snapshot() ?? null,
        consumerRecovery: audioResets.snapshot(),
        runtimeEmpty: leftovers.length === 0,
      }),
    );
  if (transportEvidence)
    console.log(
      JSON.stringify({
        ...transportEvidence,
        runtimeEmpty: leftovers.length === 0,
        rdpDiagnostics: rdpDiagnostics.snapshot(),
      }),
    );
}
