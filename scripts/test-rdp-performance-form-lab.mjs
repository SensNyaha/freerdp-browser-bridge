import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import { chromium } from 'playwright-core';
import { createSessionServer } from '../apps/bridge-api/dist/session-server.js';
import {
  NativeSessionWorker,
  WorkerProcess,
} from '../packages/node-bridge/dist/index.js';
import { loadResourceLabProfile } from './resource-lab-profile.mjs';

const project = fileURLToPath(new URL('..', import.meta.url));
if (resolve('.') !== resolve(project)) throw new Error('Use the project root');
const nativeArgs = process.argv.slice(2);
const ipTest = nativeArgs[0] === '--ip-test';
const profile = await loadResourceLabProfile(
  ipTest ? nativeArgs.slice(1) : nativeArgs,
  project,
);
const ipSelection = ipTest
  ? { preferIPv6: true, forceIpVersion: 4 }
  : undefined;
const root = resolve(project, '.runtime/lab-performance-form');
const origin = 'http://127.0.0.1:47996';
const bearer = randomBytes(32).toString('base64url');
const quality = {
  profile: 'balanced',
  maxFps: 5,
  wallpaper: true,
  fontSmoothing: false,
  desktopComposition: true,
  fullWindowDrag: false,
  menuAnimations: true,
  themes: false,
};
const workerOptions = {
  workerPath: profile.workerPath,
  runtimeRoot: root,
  ipcTransport: 'framed-pipes',
};
let server, browser, page, native, credentials, targetPid, image;
let phase = 'capability',
  accepted = false,
  factories = 0,
  joined = false;
class Adapter extends NativeSessionWorker {
  createWorkerProcess(options) {
    native = new WorkerProcess(options);
    return native;
  }
  start(config, signal) {
    assert.deepEqual(config.quality, quality);
    if (ipTest) {
      assert.equal(config.target.preferIPv6, true);
      assert.equal(config.target.forceIpVersion, 4);
    }
    return super.start(config, signal);
  }
}
async function localJson(name) {
  return JSON.parse(
    (await readFile(resolve(project, '.local-tests', name), 'utf8')).replace(
      /^\uFEFF/,
      '',
    ),
  );
}
const timer = setTimeout(() => {
  native?.terminate();
  void browser?.close().catch(() => {});
}, 45000);
try {
  const probe = new WorkerProcess(workerOptions);
  try {
    const build = await probe.start();
    if (
      build.freeRdpVersion !== '3.32.1' ||
      !build.capabilities.performanceSettings ||
      (ipTest && !build.capabilities.ipSettings)
    )
      throw new Error('LAB_PERFORMANCE_UNSUPPORTED');
  } finally {
    await probe.close();
  }
  server = await createSessionServer({
    worker: workerOptions,
    allowedOrigins: [origin],
    authenticate: (request) =>
      request.headers.authorization === 'Bearer ' + bearer
        ? { id: 'local-performance-form-lab' }
        : undefined,
    sessions: {
      maxSessions: 1,
      maxPerPrincipal: 1,
      workerFactory: (limits) => {
        ++factories;
        return new Adapter(workerOptions, limits);
      },
    },
    logDestination: new Writable({
      write(_bytes, _encoding, done) {
        done();
      },
    }),
  });
  const files = (
    await readdir(resolve(project, 'apps/reference-harness'))
  ).filter(
    (name) => name === 'index.html' || /^[a-z][a-z0-9-]*\.js$/.test(name),
  );
  if (files.length > 64) throw new Error('LAB_HARNESS_LIMIT');
  for (const name of files) {
    const bytes = await readFile(
      resolve(project, 'apps/reference-harness', name),
    );
    if (bytes.length > 131072) throw new Error('LAB_HARNESS_LIMIT');
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
  await server.listen({ host: '127.0.0.1', port: 47996 });
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
  page.setDefaultTimeout(5000);
  await page.goto(origin + '/harness/');
  await page.waitForFunction(
    () =>
      window.bridgeConnection &&
      !document.querySelector('#connect-session').disabled,
  );
  for (const name of Object.keys(quality).filter(
    (key) => !['profile', 'maxFps'].includes(key),
  ))
    assert.equal(await page.locator(`[name=${name}]`).isDisabled(), false);
  phase = 'form';
  const target = await localJson('xrdp-lab.json');
  if (target.host !== '192.168.21.149' || (target.port ?? 3389) !== 3389)
    throw new Error('LAB_TARGET_MISMATCH');
  credentials = await localJson('xrdp-lab.secrets.json');
  await page.evaluate((bearer) => {
    window.bridgeConnection.configure({
      authorize: () => ({ authorization: 'Bearer ' + bearer }),
    });
    for (const details of document.querySelectorAll('#connection-form details'))
      details.open = true;
  }, bearer);
  await page.locator('[name=host]').fill(target.host);
  await page.locator('[name=port]').fill('3389');
  await page.locator('[name=username]').fill(credentials.username);
  await page.locator('[name=password]').fill(credentials.password);
  await page.locator('[name=certificatePolicy]').selectOption('prompt');
  await page.locator('[name=video]').selectOption('jpeg');
  await page.locator('[name=quality]').selectOption('balanced');
  if (ipTest) {
    assert.equal(await page.locator('[name=preferIPv6]').isDisabled(), false);
    assert.equal(
      await page.locator('[name=forceIpVersion]').isDisabled(),
      false,
    );
    await page.locator('[name=preferIPv6]').selectOption('true');
    await page.locator('[name=forceIpVersion]').selectOption('4');
  }
  await page.locator('[name=fps]').fill('5');
  for (const [name, value] of Object.entries(quality))
    if (typeof value === 'boolean')
      await page.locator(`[name=${name}]`).selectOption(String(value));
  const creation = page.waitForResponse(
    (response) =>
      response.url() === origin + '/v1/sessions' &&
      response.request().method() === 'POST',
  );
  await page.click('#connect-session');
  assert.equal((await creation).status(), 202);
  delete credentials.password;
  assert.equal(await page.locator('[name=password]').inputValue(), '');
  phase = 'certificate';
  await page.waitForFunction(
    () => !document.querySelector('#certificate').hidden,
    undefined,
    { timeout: 20000 },
  );
  assert.equal(
    await page.locator('#fingerprint').textContent(),
    profile.fingerprint,
  );
  await page.click('#accept');
  phase = 'render';
  await page.waitForFunction(
    () => {
      const s = window.bridgeViewer.stats;
      if (
        s.frames < 1 ||
        s.width !== 1920 ||
        s.height !== 1080 ||
        s.error ||
        s.closed
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
      bytes.fill(0);
      return max - min > 20;
    },
    undefined,
    { timeout: 15000, polling: 200 },
  );
  image = await page.evaluate(() => {
    const s = window.bridgeViewer.stats;
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
    bytes.fill(0);
    return {
      frames: s.frames,
      width: s.width,
      height: s.height,
      maxFps: s.maxFps,
      range: max - min,
    };
  });
  assert.ok(image.range > 20);
  assert.equal(image.maxFps, 5);
  assert.equal(factories, 1);
  targetPid = native.pid;
  await native.ping();
  phase = 'disconnect';
  await page.click('#disconnect-session');
  await page.waitForFunction(
    () =>
      !window.bridgeConnection.state.pending &&
      !window.bridgeConnection.state.connected,
  );
  assert.equal(
    await page.evaluate(() => localStorage.length + sessionStorage.length),
    0,
  );
  accepted = true;
} catch {
  console.error(
    JSON.stringify({
      type: 'lab.performance-form-failure',
      code: 'LAB_PERFORMANCE_FORM_FAILED',
      phase,
    }),
  );
} finally {
  clearTimeout(timer);
  if (credentials) delete credentials.password;
  targetPid ??= native?.pid;
  joined = true;
  for (const close of [
    () => browser?.close(),
    () => server?.close(),
    () => native?.close(),
  ]) {
    try {
      await close();
    } catch {
      joined = false;
    }
  }
  let empty = false,
    retired = targetPid === undefined ? null : false;
  try {
    empty = (await readdir(root)).length === 0;
  } catch (error) {
    empty = error.code === 'ENOENT';
  }
  if (targetPid !== undefined) {
    try {
      process.kill(targetPid, 0);
    } catch (error) {
      retired = error.code === 'ESRCH';
    }
  }
  console.log(
    JSON.stringify({
      type: 'lab.performance-form',
      accepted,
      quality,
      ipSelection,
      image,
      workerHash: profile.workerHash,
      helperHash: profile.helperHash,
      cleanup: { joined, runtimeEmpty: empty, pidRetired: retired },
    }),
  );
  if (!accepted || !joined || !empty || retired !== true) process.exitCode = 1;
}
