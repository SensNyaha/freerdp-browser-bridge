import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { dirname, basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';

const [directory, labName, codec, ...extra] = process.argv.slice(2);
const linux = directory === '--installed-linux';
const options = new Map();
if (linux) {
  if (extra.length !== 6) throw new Error('STANDALONE_RDP_LAB_USAGE');
  for (let index = 0; index < extra.length; index += 2) {
    if (
      !['--package', '--sha256', '--version'].includes(extra[index]) ||
      options.has(extra[index])
    )
      throw new Error('STANDALONE_RDP_LAB_USAGE');
    options.set(extra[index], extra[index + 1]);
  }
  if (
    !/^[a-f0-9]{64}$/.test(options.get('--sha256') ?? '') ||
    !/^0\.2\.[0-9]+$/.test(options.get('--version') ?? '') ||
    !/^\/home\/[A-Za-z0-9_.-]+\/freerdp-bridge-tests\/[A-Za-z0-9_.-]+\//.test(
      options.get('--package') ?? '',
    )
  )
    throw new Error('STANDALONE_RDP_LAB_USAGE');
}
if (
  process.platform !== 'win32' ||
  (!linux && extra.length) ||
  !directory ||
  !['astra', 'redos'].includes(labName) ||
  !['h264', 'jpeg'].includes(codec)
)
  throw new Error('STANDALONE_RDP_LAB_USAGE');
const root = linux ? undefined : resolve(directory);
const manifest = linux
  ? {
      name: '@freerdp-bridge/standalone',
      private: true,
      version: options.get('--version'),
    }
  : JSON.parse(await readFile(join(root, 'service/package.json'), 'utf8'));
assert.equal(manifest.name, '@freerdp-bridge/standalone');
assert.equal(manifest.private, true);
assert.match(manifest.version, /^0\.2\.[0-9]+$/);
const lab = JSON.parse(
  await readFile(
    '.local-tests/' +
      (labName === 'astra' ? 'astra-xrdp-lab.json' : 'linux-host.json'),
    'utf8',
  ),
);
assert.ok(/^192\.168\.|^10\./.test(lab.host));
const fingerprint =
  labName === 'astra'
    ? lab.testCertificateFingerprint
    : 'sha256:e626601a3e6c274909f586cf97a29e7ae3300e7fcf848deef28c15998f49b559';
if (labName === 'astra') assert.equal(lab.testCertificateConfirmedByUser, true);
else assert.equal(lab.ssh.confirmedByUser, true);
assert.match(fingerprint, /^sha256:[a-f0-9]{64}$/);
const scratch = await mkdtemp(join(tmpdir(), 'bridge-standalone-rdp-'));
const runtime = join(scratch, 'runtime');
const configuration = join(scratch, 'public-config.json');
const report = {
  version: manifest.version,
  serverPlatform: linux ? 'linux-x64-gnu' : 'win32-x64',
  lab: labName,
  codec,
  realRdpDesktop: false,
  resized: [],
  cleanup: false,
};
let child,
  closed,
  browser,
  page,
  sessionId,
  token = '',
  phase = 'prepare',
  timer,
  output = '',
  bytes = 0;
const require = createRequire(resolve('apps/standalone/package.json'));
const { SignJWT } = await import(pathToFileURL(require.resolve('jose')).href);
let origin;
const request = async (path, method = 'GET', body) => {
  const response = await fetch(origin + '/rdp' + path, {
    method,
    headers: {
      authorization: 'Bearer ' + token,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('STANDALONE_RDP_REQUEST_REFUSED');
  return response.json();
};
const image = async (width, height, previous = 0) => {
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
      const pixels = canvas
        .getContext('2d')
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let minimum = 255,
        maximum = 0;
      for (let i = 0; i < pixels.length; i += 64) {
        minimum = Math.min(minimum, pixels[i]);
        maximum = Math.max(maximum, pixels[i]);
      }
      return maximum - minimum > 20;
    },
    { width, height, previous },
    { timeout: 20000 },
  );
};
try {
  const reservation = createServer();
  await new Promise((done) => reservation.listen(0, '127.0.0.1', done));
  const port = reservation.address().port;
  await new Promise((done) => reservation.close(done));
  origin = 'http://127.0.0.1:' + port;
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const settings = {
    schemaVersion: 1,
    listen: { host: '127.0.0.1', port: linux ? 8080 : port },
    allowedOrigins: [origin],
    targets: [{ host: lab.host, port: lab.port ?? 3389 }],
    limits: { maxSessions: 1, maxPerPrincipal: 1 },
    auth: {
      issuer: 'https://standalone-lab.example.test',
      audience: 'bridge',
      jwks: {
        keys: [
          {
            ...publicKey.export({ format: 'jwk' }),
            kid: 'synthetic-lab',
            alg: 'RS256',
            use: 'sig',
          },
        ],
      },
    },
  };
  await writeFile(configuration, JSON.stringify(settings));
  const now = Math.floor(Date.now() / 1000);
  token = await new SignJWT({
    sub: 'synthetic-lab-owner',
    scope: 'rdp:connect',
    iss: settings.auth.issuer,
    aud: 'bridge',
    iat: now,
    exp: now + 300,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'synthetic-lab', typ: 'at+jwt' })
    .sign(privateKey);
  phase = 'server-start';
  child = linux
    ? spawn(
        'python',
        [
          'scripts/standalone/rdp-lab-server.py',
          labName,
          options.get('--package'),
          options.get('--sha256'),
          manifest.version,
          String(port),
        ],
        {
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: Object.fromEntries(
            ['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP'].flatMap((key) =>
              process.env[key] === undefined ? [] : [[key, process.env[key]]],
            ),
          ),
        },
      )
    : spawn(
        join(
          process.env.SystemRoot,
          'System32/WindowsPowerShell/v1.0/powershell.exe',
        ),
        [
          '-NoProfile',
          '-NonInteractive',
          '-File',
          join(root, 'start.ps1'),
          '-Configuration',
          configuration,
          '-RuntimeRoot',
          runtime,
        ],
        {
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            SystemRoot: process.env.SystemRoot,
            WINDIR: process.env.WINDIR,
            PATH: join(process.env.SystemRoot, 'System32'),
          },
        },
      );
  closed = new Promise((done, reject) => {
    child.once('error', reject);
    child.once('close', done);
  });
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (chunk) => {
      if ((bytes += chunk.length) > 65536) child.kill();
      else output += chunk.toString('utf8');
    });
  if (linux) child.stdin.write(JSON.stringify(settings) + '\n');
  timer = setTimeout(() => child.kill(), 240000);
  const due = Date.now() + (linux ? 120000 : 15000);
  while (!output.includes('STANDALONE_READY')) {
    if (child.exitCode !== null || Date.now() > due)
      throw Error('STANDALONE_RDP_NOT_READY');
    await delay(25);
  }
  const build = await request('/v1/build');
  assert.equal(build.bridgeVersion, manifest.version);
  assert.equal(build.freeRdpVersion, '3.32.1');
  report.nativeTransport = build.transport;
  phase = 'viewer-start';
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  page = await browser.newPage({ viewport: { width: 1980, height: 1240 } });
  let browserErrors = 0;
  page.on('pageerror', () => {
    browserErrors++;
  });
  assert.equal((await page.goto(origin + '/viewer/')).status(), 200);
  await page.waitForFunction(() =>
    Boolean(window.bridgeConnection && window.bridgeViewer),
  );
  await page.locator('#application-auth [name=accessToken]').fill(token);
  await page.locator('#application-auth button').click();
  assert.equal(
    await page.locator('#application-auth [name=accessToken]').inputValue(),
    '',
  );
  await page.evaluate(() => {
    for (const details of document.querySelectorAll('#connection-form details'))
      details.open = true;
    return window.bridgeConnection.refresh();
  });
  await page.waitForFunction(
    () => !document.querySelector('#connect-session').disabled,
  );
  phase = 'form-create';
  const credentialName =
    lab.credentialFile ??
    (labName === 'astra'
      ? 'astra-xrdp-lab.secrets.json'
      : 'linux-host.secrets.json');
  assert.equal(
    dirname(resolve('.local-tests', credentialName)),
    resolve('.local-tests'),
  );
  const credentials = JSON.parse(
    await readFile(resolve('.local-tests', credentialName), 'utf8'),
  );
  try {
    await page.locator('[name=host]').fill(lab.host);
    await page.locator('[name=port]').fill(String(lab.port ?? 3389));
    await page.locator('[name=username]').fill(credentials.username);
    await page.locator('[name=password]').fill(credentials.password);
  } finally {
    delete credentials.password;
  }
  await page.locator('[name=certificatePolicy]').selectOption('prompt');
  await page.locator('[name=video]').selectOption(codec);
  await page.locator('[name=audio]').selectOption('off');
  await page.locator('[name=width]').fill('1920');
  await page.locator('[name=height]').fill('1080');
  const createdResponse = page.waitForResponse(
    (response) =>
      response.url() === origin + '/rdp/v1/sessions' &&
      response.request().method() === 'POST',
    { timeout: 20000 },
  );
  await page.click('#connect-session');
  const response = await createdResponse;
  assert.equal(response.status(), 202);
  sessionId = (await response.json()).sessionId;
  assert.match(sessionId, /^[a-f0-9]{32}$/);
  assert.equal(await page.locator('[name=password]').inputValue(), '');
  phase = 'certificate';
  await page.waitForFunction(
    () => !document.querySelector('#certificate').hidden,
    undefined,
    { timeout: 25000 },
  );
  assert.equal(await page.locator('#fingerprint').textContent(), fingerprint);
  await page.click('#accept');
  phase = 'render';
  await image(1920, 1080);
  report.realRdpDesktop = true;
  for (const [width, height] of [
    [1280, 720],
    [1920, 1080],
  ]) {
    phase = 'resize-' + width;
    const before = await page.evaluate(() => window.bridgeViewer.stats);
    assert.equal(
      await page.evaluate(
        ({ width, height }) => window.bridgeViewer.resize(width, height),
        { width, height },
      ),
      'applied',
    );
    await image(width, height, before.frames);
    const after = await page.evaluate(() => window.bridgeViewer.stats);
    assert.ok(after.configurations > before.configurations);
    if (codec === 'h264') assert.ok(after.keyframes > before.keyframes);
    report.resized.push({
      width,
      height,
      configurations: after.configurations,
      keyframes: after.keyframes,
    });
  }
  phase = 'reattach';
  await page.evaluate(() => window.bridgeViewer.detach());
  await delay(250);
  const attach = {};
  for (const channel of ['control', 'media'])
    attach[channel] = await request(
      '/v1/sessions/' + sessionId + '/attach-token',
      'POST',
      { channel },
    );
  await page.evaluate(
    ({ sessionId, attach, codec }) =>
      window.bridgeViewer.attach(
        { sessionId, attach },
        { basePath: '/rdp', codecs: [codec] },
      ),
    { sessionId, attach, codec },
  );
  await image(1920, 1080);
  report.reattached = true;
  const diagnostic = await request('/v1/diagnostics');
  assert.equal(diagnostic.activeSessions, 1);
  assert.equal(diagnostic.connections, 2);
  assert.equal(
    await page.evaluate(
      () =>
        Object.keys(localStorage).length + Object.keys(sessionStorage).length,
    ),
    0,
  );
  assert.equal(page.url(), origin + '/viewer/');
  assert.equal(browserErrors, 0);
  report.browserErrors = browserErrors;
  phase = 'owner-stop';
  await page.evaluate(() => window.bridgeConnection.stop());
  await page.evaluate(() => window.bridgeViewer.detach());
  assert.equal((await request('/v1/sessions/' + sessionId)).state, 'closed');
  const cleanDue = Date.now() + 5000;
  while ((await request('/v1/diagnostics')).connections !== 0) {
    if (Date.now() > cleanDue) throw Error('STANDALONE_SOCKET_NOT_RETIRED');
    await delay(25);
  }
  assert.equal((await request('/v1/diagnostics')).activeSessions, 0);
  if (!linux)
    assert.deepEqual(await readdir(runtime), ['.bridge-service.lock']);
} catch {
  report.failedPhase = phase;
  report.backendFailures = output.split('\n').flatMap((line) => {
    try {
      const value = JSON.parse(line);
      if (value.code !== 'STANDALONE_LAB_FAILED') return [];
      return [
        {
          ...(Number.isInteger(value.rootLine) &&
          value.rootLine > 0 &&
          value.rootLine < 1000
            ? { rootLine: value.rootLine }
            : {}),
          ...(typeof value.phase === 'string' &&
          /^[a-z-]{1,64}$/.test(value.phase)
            ? { phase: value.phase }
            : {}),
          ...(typeof value.errorType === 'string' &&
          /^[A-Za-z]{1,64}$/.test(value.errorType)
            ? { errorType: value.errorType }
            : {}),
        },
      ];
    } catch {
      return [];
    }
  });
  if (sessionId && origin) {
    const state = await request('/v1/sessions/' + sessionId).catch(
      () => undefined,
    );
    report.sessionState = state?.state;
    if (/^[A-Z0-9_]{1,64}$/.test(state?.error?.code ?? ''))
      report.sessionError = state.error.code;
  }
  process.exitCode = 1;
} finally {
  await page
    ?.evaluate(() => window.bridgeViewer.resize(1920, 1080))
    .catch(() => {});
  await page?.evaluate(() => window.bridgeConnection.stop()).catch(() => {});
  await browser?.close();
  if (sessionId)
    await request('/v1/sessions/' + sessionId, 'DELETE').catch(() => {});
  if (child && child.exitCode === null) child.stdin.end(Buffer.from([1]));
  if (closed) {
    const code = await closed;
    report.cleanup =
      code === 0 &&
      (linux
        ? output.includes('STANDALONE_LAB_CLEAN')
        : (await readdir(runtime)).length === 0);
  }
  clearTimeout(timer);
  if (token) assert.equal(output.includes(token), false);
  token = '';
  if (report.cleanup) {
    assert.equal(dirname(scratch), resolve(tmpdir()));
    assert.match(basename(scratch), /^bridge-standalone-rdp-[A-Za-z0-9]+$/);
    await rm(scratch, { recursive: true, force: true, maxRetries: 3 });
  } else process.exitCode = 1;
  await writeFile(
    'build/standalone-rdp-' +
      (linux ? 'linux' : 'win32') +
      '-' +
      labName +
      '-' +
      codec +
      '.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report));
}
