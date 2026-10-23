import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
import { assertLoopbackViewerPorts } from './linux-viewer-container.mjs';
import {
  ViewerSoak,
  mediaCredit,
  soakDurationMs,
  soakIntervalMs,
} from './viewer-soak.mjs';

const [container, fingerprint, codec = 'h264', formMode, ...extra] =
  process.argv.slice(2);
if (
  process.platform !== 'win32' ||
  extra.length ||
  !/^freerdp-bridge-linux-viewer-[0-9]+$/.test(container ?? '') ||
  !/^sha256:[a-f0-9]{64}$/.test(fingerprint ?? '') ||
  !['h264', 'jpeg'].includes(codec) ||
  (formMode !== undefined &&
    !['--form', '--audio-pcm', '--audio-opus', '--soak-test'].includes(
      formMode,
    ))
)
  throw new Error(
    'Use owned Linux viewer container, approved fingerprint and codec',
  );
const origin = 'http://127.0.0.1:47998';
const soakTest = formMode === '--soak-test';
const audioOutput =
  formMode === '--audio-pcm'
    ? 'pcm'
    : formMode === '--audio-opus'
      ? 'opus'
      : 'off';
// Check the actual owned container before creating/sending any authentication material.
try {
  const { stdout } = await promisify(execFile)(
    'docker',
    ['inspect', '--format', '{{json .HostConfig.PortBindings}}', container],
    { timeout: 3000, maxBuffer: 8192, windowsHide: true },
  );
  assertLoopbackViewerPorts(JSON.parse(stdout));
} catch {
  throw new Error('Owned Linux viewer loopback publication unavailable');
}
const bearer = randomBytes(32).toString('base64url');
let ready, failed;
const readiness = new Promise((done, reject) => {
  ready = done;
  failed = reject;
});
void readiness.catch(() => {});
const child = spawn(
  'docker',
  [
    'exec',
    '-i',
    '-e',
    'LD_LIBRARY_PATH=/work/.deps/freerdp-install/lib:/work/.deps/installed/x64-linux-bundled/lib',
    container,
    'node',
    'scripts/linux-xrdp-viewer-server.mjs',
  ],
  { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
);
const bootstrap = Buffer.from(
  JSON.stringify({ bearer, ...(soakTest ? { soak: true } : {}) }),
);
child.stdin.on('error', () => {});
child.stdin.end(bootstrap, () => bootstrap.fill(0));
child.stderr.resume();
let stdout = '',
  received = 0,
  serverCleanup = false;
child.stdout.on('data', (chunk) => {
  received += chunk.length;
  if (received > 8192) {
    child.kill();
    failed(new Error('Server output limit'));
    return;
  }
  stdout += chunk.toString('utf8');
  for (let newline; (newline = stdout.indexOf('\n')) >= 0; ) {
    const line = stdout.slice(0, newline);
    stdout = stdout.slice(newline + 1);
    try {
      const event = JSON.parse(line);
      if (event.type === 'lab.server.ready') ready();
      if (event.type === 'lab.server.closed')
        serverCleanup = event.cleanup === true;
    } catch {
      failed(new Error('Invalid server receipt'));
    }
  }
});
const exited = new Promise((done) => {
  child.once('error', () => {
    failed(new Error('Server start failed'));
    done(1);
  });
  child.once('close', (code) => {
    failed(new Error('Server closed'));
    done(code ?? 1);
  });
});
const timer = setTimeout(
  () => {
    child.kill();
    failed(new Error('Lab deadline'));
  },
  (soakTest ? soakDurationMs : 0) + 100000,
);
const startupTimer = setTimeout(
  () => failed(new Error('Startup deadline')),
  15000,
);
let browser,
  page,
  sessionId,
  restorationNeeded = false,
  phase = 'startup';
const report = {
  type: 'lab.linux.viewer',
  actualRdp: true,
  codec,
  resized: [],
  reattached: false,
  cleanup: false,
};
async function request(path, method = 'GET', body, format = 'json') {
  const response = await fetch(origin + path, {
    method,
    headers: {
      authorization: 'Bearer ' + bearer,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Lab HTTP failed');
  if (response.status === 204) return undefined;
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    if ((length += chunk.length) > 131072)
      throw new Error('Lab HTTP size limit');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return format === 'text' ? text : JSON.parse(text);
}
async function image(width, height, previous = 0) {
  await page.waitForFunction(
    ({ width, height, previous }) => {
      const s = window.bridgeViewer.stats;
      if (
        s.width !== width ||
        s.height !== height ||
        s.frames <= previous ||
        s.error ||
        s.closed ||
        s.renderedGeneration !== s.displayGeneration
      )
        return false;
      const canvas = document.querySelector('#desktop');
      const bytes = canvas
        .getContext('2d')
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let min = 255,
        max = 0;
      for (let i = 0; i < bytes.length; i += 64) {
        min = Math.min(min, bytes[i]);
        max = Math.max(max, bytes[i]);
      }
      return max - min > 20;
    },
    { width, height, previous },
    { timeout: 15000 },
  );
}
async function audioReady(previousEpoch) {
  const due = performance.now() + 15000;
  do {
    await page.evaluate(() => window.bridgeViewer.requestAudioStats());
    await delay(200);
    const value = await page.evaluate(() => window.bridgeViewer.stats.audio);
    if (
      value?.source?.availability === 'ready' &&
      !value.closed &&
      value.remote?.packets > 0 &&
      value.remote?.playedFrames > 0 &&
      value.remote?.invalidCalls === 0 &&
      (audioOutput !== 'opus' || value.decoded > 0) &&
      (previousEpoch === undefined ||
        BigInt(value.source.epoch) > BigInt(previousEpoch))
    )
      return {
        codec: audioOutput,
        epoch: value.source.epoch,
        records: value.records,
        packets: value.remote.packets,
        playedFrames: value.remote.playedFrames,
        decoded: value.decoded,
      };
  } while (performance.now() < due);
  throw new Error('Actual active audio admission missing');
}
try {
  await readiness;
  clearTimeout(startupTimer);
  const build = await request('/v1/build');
  if (
    build.os !== 'linux' ||
    build.transport !== 'unix-seqpacket-rws1' ||
    build.freeRdpVersion !== '3.32.1'
  )
    throw new Error('Linux primary profile missing');
  report.transport = build.transport;
  phase = 'create';
  const local = async (name) =>
    JSON.parse(
      (await readFile(resolve('.local-tests', name), 'utf8')).replace(
        /^\uFEFF/,
        '',
      ),
    );
  const lab = await local('xrdp-lab.json');
  const credentials = await local('xrdp-lab.secrets.json');
  let attachment;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  page = await browser.newPage({ viewport: { width: 1980, height: 1240 } });
  await page.goto(origin + '/harness/');
  await page.waitForFunction(() => Boolean(window.bridgeViewer));
  try {
    if (formMode) {
      phase = 'manual-form';
      await page.waitForFunction(
        () =>
          window.bridgeConnection &&
          !document.querySelector('#connect-session').disabled,
      );
      await page.evaluate((bearer) => {
        window.bridgeConnection.configure({
          authorize: () => ({ authorization: 'Bearer ' + bearer }),
        });
        for (const details of document.querySelectorAll(
          '#connection-form details',
        ))
          details.open = true;
      }, bearer);
      await page.locator('[name=host]').fill(lab.host);
      await page.locator('[name=port]').fill(String(lab.port ?? 3389));
      await page.locator('[name=username]').fill(credentials.username);
      await page.locator('[name=password]').fill(credentials.password);
      await page.locator('[name=certificatePolicy]').selectOption('prompt');
      await page.locator('[name=video]').selectOption(codec);
      if (audioOutput !== 'off') {
        await page.locator('[name=audio]').selectOption(audioOutput);
        await page.locator('[name=audioBuffer]').selectOption('200');
      }
      const response = page.waitForResponse(
        (response) =>
          response.url() === origin + '/v1/sessions' &&
          response.request().method() === 'POST',
      );
      await page.click('#connect-session');
      const created = await response;
      if (created.status() !== 202)
        throw new Error('Manual form creation refused');
      attachment = await created.json();
      if ((await page.locator('[name=password]').inputValue()) !== '')
        throw new Error('Password field not cleared');
      report.manualForm = true;
    } else
      attachment = await request('/v1/sessions', 'POST', {
        target: { host: lab.host, port: lab.port ?? 3389 },
        auth: {
          username: credentials.username,
          password: credentials.password,
        },
        display: { width: 1920, height: 1080, dynamicResolution: true },
        security: { certificatePolicy: 'prompt' },
        timeouts: { connectMs: 20000, tcpAckMs: 10000 },
      });
  } finally {
    delete credentials.password;
  }
  sessionId = attachment.sessionId;
  if (!formMode)
    await page.evaluate(
      ({ attachment, codec }) =>
        window.bridgeViewer.attach(attachment, { codecs: [codec] }),
      { attachment, codec },
    );
  phase = 'certificate';
  if (audioOutput !== 'off') await page.click('#audio-start');
  await page.waitForFunction(
    () => !document.querySelector('#certificate').hidden,
    undefined,
    { timeout: 20000 },
  );
  if (formMode) {
    if ((await page.locator('#fingerprint').textContent()) !== fingerprint)
      throw new Error('Approved certificate mismatch');
    await page.click('#accept');
  } else if (
    !(await page.evaluate(
      (fp) => window.bridgeViewer.acceptCertificate(fp),
      fingerprint,
    ))
  )
    throw new Error('Approved certificate mismatch');
  phase = 'render';
  await image(1920, 1080);
  if (soakTest) {
    phase = 'soak';
    const collector = new ViewerSoak();
    const started = performance.now();
    for (;;) {
      const elapsedMs = Math.floor(performance.now() - started);
      const view = await page.evaluate(() => window.bridgeViewer.stats);
      const resources = await request('/lab/resources');
      const metrics = await request('/metrics', 'GET', undefined, 'text');
      collector.observe(
        elapsedMs,
        view,
        resources.workerResidentBytes,
        resources.nodeResidentBytes,
        mediaCredit(metrics, codec),
      );
      report.soakEvidence = collector.snapshot();
      console.log(
        JSON.stringify({ type: 'lab.soak.progress', ...report.soakEvidence }),
      );
      if (elapsedMs >= soakDurationMs) break;
      await delay(Math.min(soakIntervalMs, soakDurationMs - elapsedMs));
    }
    if (!report.soakEvidence.workerMemoryBudgetPassed)
      throw new Error('Lab soak memory budget');
  }
  if (audioOutput !== 'off') {
    phase = 'audio-play';
    report.audio = await audioReady();
    report.audibleAcceptance = false;
  }
  for (const [width, height] of [
    [1280, 720],
    [1920, 1080],
  ]) {
    phase = 'resize-' + width;
    const before = await page.evaluate(() => window.bridgeViewer.stats);
    restorationNeeded = true;
    const result = await page.evaluate(
      ({ width, height }) => window.bridgeViewer.resize(width, height),
      { width, height },
    );
    if (result !== 'applied') throw new Error('Observed resize missing');
    await image(width, height, before.frames);
    const after = await page.evaluate(() => window.bridgeViewer.stats);
    if (
      after.configurations <= before.configurations ||
      (codec === 'h264' && after.keyframes <= before.keyframes)
    )
      throw new Error('Fresh media config missing');
    report.resized.push({
      width,
      height,
      configurations: after.configurations,
      keyframes: after.keyframes,
    });
    if (width === 1920) restorationNeeded = false;
  }
  phase = 'reattach';
  const audioEpoch =
    audioOutput === 'opus'
      ? (await page.evaluate(() => window.bridgeViewer.stats.audio))?.source
          ?.epoch
      : undefined;
  const resetBefore =
    audioOutput === 'opus' ? await request('/lab/stats') : undefined;
  await page.evaluate(() => window.bridgeViewer.detach());
  await delay(200);
  const attach = {};
  for (const channel of ['control', 'media'])
    attach[channel] = await request(
      '/v1/sessions/' + sessionId + '/attach-token',
      'POST',
      { channel },
    );
  await page.evaluate(
    ({ created, codec, audioOutput }) =>
      window.bridgeViewer.attach(created, { codecs: [codec], audioOutput }),
    { created: { sessionId, attach }, codec, audioOutput },
  );
  if (audioOutput !== 'off') await page.click('#audio-start');
  await image(1920, 1080);
  if (audioOutput !== 'off') {
    phase = 'audio-replay';
    report.audioReplay = await audioReady(audioEpoch);
    if (audioOutput === 'opus') {
      const resetAfter = await request('/lab/stats');
      if (resetAfter.scheduled <= resetBefore.scheduled)
        throw new Error('Observed native attachment reset missing');
      report.audioBeforeReattachEpoch = audioEpoch;
      report.scheduledAttachmentResets =
        resetAfter.scheduled - resetBefore.scheduled;
    }
  }
  const stats = await page.evaluate(() => window.bridgeViewer.stats);
  report.frames = stats.frames;
  report.configurations = stats.configurations;
  report.keyframes = stats.keyframes;
  report.reattached = true;
} catch {
  report.failedPhase = phase;
  if (audioOutput !== 'off' && page) {
    report.audioFailure = await page
      .evaluate(() => {
        const a = window.bridgeViewer.stats.audio;
        return {
          closed: a?.closed,
          records: a?.records,
          decoded: a?.decoded,
          source: a?.source,
          packets: a?.remote?.packets,
          playedFrames: a?.remote?.playedFrames,
          invalidCalls: a?.remote?.invalidCalls,
        };
      })
      .catch(() => undefined);
  }
  process.exitCode = 1;
} finally {
  clearTimeout(startupTimer);
  if (page && restorationNeeded)
    await page
      .evaluate(() => window.bridgeViewer.resize(1920, 1080))
      .catch(() => {});
  if (formMode)
    await page?.evaluate(() => window.bridgeConnection.stop()).catch(() => {});
  await page?.evaluate(() => window.bridgeViewer.detach()).catch(() => {});
  await browser?.close();
  if (sessionId)
    await request('/v1/sessions/' + sessionId, 'DELETE').catch(() => {});
  await request('/lab/stop', 'POST').catch(() => {});
  const code = await exited;
  clearTimeout(timer);
  bootstrap.fill(0);
  report.cleanup = code === 0 && serverCleanup;
  if (!report.cleanup) process.exitCode = 1;
  console.log(JSON.stringify(report));
}
