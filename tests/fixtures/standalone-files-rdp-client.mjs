// Explicit owned-lab runner. Credentials arrive only through bounded private stdin.
// Runs the real relocated launcher/private Node; never substitutes a backend.
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import {
  mkdtemp,
  writeFile,
  readdir,
  realpath,
  rm,
  rmdir,
  statfs,
} from 'node:fs/promises';
import { resolve, join, dirname, basename, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

assert.equal(process.argv.length, 3);
const installedFull =
  process.argv[2] === '--owned-managed-files-full-installed-rdp';
const installed =
  installedFull || process.argv[2] === '--owned-managed-files-installed-rdp';
const diskFull = process.argv[2] === '--owned-managed-files-full-portable-rdp';
assert.ok(
  installed ||
    diskFull ||
    process.argv[2] === '--owned-managed-files-portable-rdp',
);
const { standalonePayloadInventory, readStandalonePayloadFile } = await import(
  pathToFileURL(resolve('scripts/standalone/payload.mjs')).href
);
const lines = [];
let buffered = Buffer.alloc(0),
  ended = false,
  wake;
process.stdin.on('data', (bytes) => {
  if (buffered.length + bytes.length > 32768) {
    ended = true;
    process.stdin.destroy();
    wake?.();
    return;
  }
  buffered = Buffer.concat([buffered, bytes]);
  for (let at; (at = buffered.indexOf(10)) >= 0; ) {
    const line = buffered.subarray(0, at);
    buffered = buffered.subarray(at + 1);
    if (lines.length >= 8) {
      ended = true;
      break;
    }
    try {
      lines.push(JSON.parse(line.toString('utf8')));
    } catch {
      ended = true;
    }
  }
  wake?.();
});
process.stdin.on('end', () => {
  ended = true;
  wake?.();
});
async function next() {
  const due = performance.now() + 90000;
  while (!lines.length) {
    assert.ok(!ended && performance.now() < due, 'LAB_INPUT_CLOSED');
    await Promise.race([
      new Promise((done) => {
        wake = done;
      }),
      delay(100),
    ]);
  }
  return lines.shift();
}
const send = (value) => process.stdout.write(JSON.stringify(value) + '\n');
const windows = process.platform === 'win32';
const run = promisify(execFile);
const pattern = () =>
  Buffer.from(Array.from({ length: 131111 }, (_, i) => (i * 31 + 17) & 255));
let scratch,
  runtime,
  fullRoot,
  fullMount,
  child,
  terminal,
  ws,
  timer,
  phase = 'input',
  failed = false;
let output = '',
  outputBytes = 0;
const sensitive = [];
let serviceActive = false,
  serviceStopped = false;
async function stop() {
  ws?.terminate();
  if (installed) {
    if (!serviceActive || serviceStopped) return;
    send({ event: 'service-stop-requested' });
    const stopped = await next();
    assert.equal(stopped.command, 'service-stopped');
    assert.equal(stopped.runtimeEmpty, true);
    assert.equal(stopped.uninstalled, true);
    serviceStopped = true;
    serviceActive = false;
    return;
  }
  if (!child) return;
  if (child.exitCode === null) {
    if (windows) child.stdin.end(Buffer.from([1]));
    else child.kill('SIGTERM');
  }
  const due = performance.now() + 15000;
  while (child.exitCode === null) {
    assert.ok(performance.now() < due, 'PORTABLE_STOP_DEADLINE');
    await delay(25);
  }
  assert.equal(await terminal, 0);
  assert.deepEqual(await readdir(runtime), []);
  for (const value of sensitive) if (value) assert.ok(!output.includes(value));
}
try {
  const input = await next();
  assert.match(input.id, /^[0-9a-f]{32}$/);
  assert.match(input.fingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.equal(typeof input.host, 'string');
  assert.ok(
    input.host.length <= 253 &&
      Number.isInteger(input.port) &&
      input.port > 0 &&
      input.port <= 65535,
  );
  sensitive.push(input.credentials.password);
  if (diskFull) {
    assert.equal(windows, false);
    fullRoot = input.fullRoot;
    const { disposableLinuxFullRoot } = await import(
      './disposable-full-root.mjs'
    );
    fullMount = await disposableLinuxFullRoot(fullRoot);
    // Twelve partial writes must exceed the configured 4 MiB quota. This named
    // profile therefore requires exactly 1 MiB, not an arbitrary small mount.
    assert.equal(fullMount.mountedBytes, 1048576);
  } else assert.equal(input.fullRoot, undefined);
  let root, receipt, workerSha256;
  if (!installed) {
    const build = await realpath(resolve('build'));
    const directory = await realpath(input.portableRoot);
    assert.ok(directory.startsWith(build + sep));
    receipt = JSON.parse(
      (
        await readStandalonePayloadFile(join(directory, 'build.json'), 65536)
      ).toString('utf8'),
    );
    assert.equal(receipt.sha256, input.portableSha256);
    assert.equal(dirname(receipt.output), directory);
    assert.equal(
      createHash('sha256')
        .update(await readStandalonePayloadFile(receipt.output, 536870912))
        .digest('hex'),
      receipt.sha256,
    );
    assert.match(
      receipt.rootName,
      /^freerdp-bridge-0\.[0-9]+\.[0-9]+-(win32-x64|linux-x64-gnu)$/,
    );
    const inventory = JSON.parse(
      (
        await readStandalonePayloadFile(
          join(directory, 'payload.json'),
          4194304,
        )
      ).toString('utf8'),
    );
    scratch = await mkdtemp(
      join(await realpath(tmpdir()), 'bridge-portable-files-'),
    );
    runtime = diskFull
      ? await mkdtemp(join(fullRoot, 'bridge-portable-full-'))
      : join(scratch, 'runtime');
    phase = 'extract';
    await run(
      windows ? join(process.env.SystemRoot, 'System32/tar.exe') : 'tar',
      ['-xf', receipt.output, '-C', scratch],
      { timeout: 120000, maxBuffer: 65536, windowsHide: true },
    );
    root = join(scratch, receipt.rootName);
    assert.deepEqual(await standalonePayloadInventory(root), inventory.files);
    workerSha256 = createHash('sha256')
      .update(
        await readStandalonePayloadFile(
          join(
            root,
            'service/node_modules/@freerdp-bridge/runtime-' +
              (windows ? 'win32-x64' : 'linux-x64-gnu'),
            'runtime/bin/rdp-worker' + (windows ? '.exe' : ''),
          ),
          67108864,
        ),
      )
      .digest('hex');
  } else {
    assert.match(input.packageSha256, /^[0-9a-f]{64}$/);
  }
  const require = createRequire(
    installed
      ? resolve('apps/standalone/package.json')
      : join(root, 'service/package.json'),
  );
  const { SignJWT } = await import(pathToFileURL(require.resolve('jose')).href);
  const { WebSocket } = createRequire(
    installed
      ? resolve('apps/bridge-api/package.json')
      : join(root, 'service/node_modules/@freerdp-bridge/api/package.json'),
  )('ws');
  const reservation = createServer();
  await new Promise((done, reject) => {
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', done);
  });
  const port = reservation.address().port;
  await new Promise((done) => reservation.close(done));
  const origin = 'http://127.0.0.1:' + port;
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const config = {
    schemaVersion: 1,
    listen: { host: '127.0.0.1', port: installed ? 8080 : port },
    allowedOrigins: [origin],
    targets: [{ host: input.host, port: input.port }],
    limits: { maxSessions: 1, maxPerPrincipal: 1 },
    files: {
      maxTotalBytes: 4194304,
      maxFileBytes: 2097152,
      maxEntries: 64,
      xrdpLegacyDelete: true,
    },
    auth: {
      issuer: installed
        ? 'https://standalone-lab.example.test'
        : 'https://owned-files.example.test',
      audience: 'bridge',
      jwks: {
        keys: [
          {
            ...publicKey.export({ format: 'jwk' }),
            kid: 'owned',
            alg: 'RS256',
            use: 'sig',
          },
        ],
      },
    },
  };
  if (installed) {
    phase = 'service-install';
    send({
      event: 'service-configuration',
      configuration: config,
      proxyPort: port,
    });
    const ready = await next();
    assert.equal(ready.command, 'service-ready');
    assert.match(ready.workerSha256, /^[0-9a-f]{64}$/);
    workerSha256 = ready.workerSha256;
    serviceActive = true;
  } else {
    const configuration = join(scratch, 'public-config.json');
    await writeFile(configuration, JSON.stringify(config));
    const executable = windows
      ? join(
          process.env.SystemRoot,
          'System32/WindowsPowerShell/v1.0/powershell.exe',
        )
      : join(root, 'start.sh');
    const args = windows
      ? [
          '-NoProfile',
          '-NonInteractive',
          '-File',
          join(root, 'start.ps1'),
          '-Configuration',
          configuration,
          '-RuntimeRoot',
          runtime,
        ]
      : ['--config', configuration, '--runtime-root', runtime];
    const env = windows
      ? {
          SystemRoot: process.env.SystemRoot,
          WINDIR: process.env.WINDIR,
          PATH: join(process.env.SystemRoot, 'System32'),
        }
      : { PATH: '/usr/bin:/bin' };
    phase = 'launcher';
    child = spawn(executable, args, {
      cwd: scratch,
      env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    terminal = new Promise((done, reject) => {
      child.once('error', reject);
      child.once('close', done);
    });
    terminal.catch(() => {});
    for (const stream of [child.stdout, child.stderr])
      stream.on('data', (bytes) => {
        if ((outputBytes += bytes.length) > 65536) child.kill();
        else output += bytes.toString('utf8');
      });
    timer = setTimeout(() => child.kill(), 90000);
    const ready = performance.now() + 15000;
    while (!output.includes('STANDALONE_READY')) {
      assert.ok(
        child.exitCode === null && performance.now() < ready,
        'PORTABLE_START_DEADLINE',
      );
      await delay(25);
    }
  }
  async function token(subject) {
    const now = Math.floor(Date.now() / 1000);
    const value = await new SignJWT({
      sub: subject,
      scope: 'rdp:connect',
      iss: config.auth.issuer,
      aud: config.auth.audience,
      iat: now,
      exp: now + 120,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'owned', typ: 'at+jwt' })
      .sign(privateKey);
    sensitive.push(value);
    return value;
  }
  const owner = await token('owned-portable-owner'),
    other = await token('owned-portable-other');
  const req = (method, path, body, headers = {}, actor = owner) =>
    fetch(origin + path, {
      method,
      headers: { authorization: 'Bearer ' + actor, ...headers },
      ...(body === undefined ? {} : { body }),
      ...(body?.[Symbol.asyncIterator] ? { duplex: 'half' } : {}),
      signal: AbortSignal.timeout(15000),
    });
  const json = async (method, path) => {
    const response = await req(method, path);
    assert.ok(response.ok);
    return response.json();
  };
  const rw = 'RW' + input.id.slice(0, 5),
    ro = 'RO' + input.id.slice(0, 5);
  phase = 'create';
  const response = await req(
    'POST',
    '/rdp/v1/sessions',
    JSON.stringify({
      target: config.targets[0],
      auth: input.credentials,
      security: { protocol: 'tls', certificatePolicy: 'prompt' },
      timeouts: { connectMs: 20000 },
      media: { audioOutput: 'off' },
      redirection: {
        drives: [
          { name: rw, source: { kind: 'session-sandbox', subdir: 'rw' } },
        ],
        thinclientDrives: [{ name: ro, subdir: 'ro', readOnly: true }],
      },
    }),
    { 'content-type': 'application/json' },
  );
  delete input.credentials.password;
  assert.equal(response.status, 202);
  const session = await response.json(),
    path = '/rdp/v1/sessions/' + session.sessionId,
    files = path + '/files';
  let sequence = 0,
    certificateFailed = false,
    prompts = 0;
  ws = new WebSocket(
    origin.replace('http:', 'ws:') +
      path +
      '/control?token=' +
      session.attach.control.token,
    ['freerdp-bridge-v1'],
    { origin },
  );
  ws.on('error', () => {
    certificateFailed = true;
  });
  ws.on('message', (bytes) => {
    if (bytes.length > 65536) {
      certificateFailed = true;
      return;
    }
    try {
      const event = JSON.parse(bytes.toString());
      if (event.type === 'certificate.prompt') {
        prompts++;
        const prompt = event.data,
          accept = prompt.fingerprint === input.fingerprint;
        if (!accept) certificateFailed = true;
        ws.send(
          JSON.stringify({
            v: 1,
            type: 'certificate.response',
            seq: ++sequence,
            ts: Date.now(),
            data: {
              challenge: prompt.challenge,
              fingerprint: prompt.fingerprint,
              accept,
            },
          }),
        );
      }
    } catch {
      certificateFailed = true;
    }
  });
  await once(ws, 'open');
  phase = 'connect';
  const connectDue = performance.now() + 30000;
  for (;;) {
    const state = await json('GET', path);
    if (state.state === 'connected') break;
    assert.ok(
      !certificateFailed &&
        state.state !== 'failed' &&
        performance.now() < connectDue,
      'RDP_CONNECT_FAILED',
    );
    await delay(25);
  }
  assert.equal(certificateFailed, false);
  assert.equal(prompts, 1);
  const page = (id) => json('GET', files + (id ? '?parentId=' + id : ''));
  const entries = await page();
  const a = entries.entries.find(
    (entry) => entry.name === 'rw' && entry.kind === 'directory',
  );
  const b = entries.entries.find(
    (entry) => entry.name === 'ro' && entry.kind === 'directory',
  );
  assert.ok(a && b);
  const upload = async (parent, name, data) => {
    const result = await req(
      'POST',
      files + '?' + new URLSearchParams({ parentId: parent, name }),
      data,
      { 'content-type': 'application/octet-stream' },
    );
    assert.equal(result.status, 201);
    const entry = await result.json();
    assert.match(entry.fileId, /^[0-9a-f]{32}$/);
    assert.deepEqual(Object.keys(entry).sort(), [
      'fileId',
      'kind',
      'name',
      'size',
    ]);
    return entry;
  };
  const seed = Buffer.from(
    'Bridge owned seed ' + input.id + ' \u0416\u65e5\u672c\u8a9e\ud83d\ude00',
  );
  await upload(a.fileId, 'seed.bin', seed);
  await upload(b.fileId, 'seed.bin', seed);
  const foreign = await req('GET', files, undefined, {}, other);
  assert.equal(foreign.status, 404);
  assert.equal((await foreign.json()).code, 'SESSION_NOT_FOUND');
  const unauth = await fetch(origin + files);
  assert.equal(unauth.status, 401);
  await unauth.arrayBuffer();
  if (diskFull) {
    phase = 'connected-http-disk-full';
    const before = (await page(a.fileId)).entries;
    const names = await readdir(runtime);
    assert.equal(names.length, 1);
    assert.match(names[0], /^worker-[0-9a-f]{32}-1-[0-9a-f]{32}$/);
    const staging = join(runtime, names[0], 'managed-files', '.uploads');
    const initial = await statfs(runtime);
    const initialFree = initial.bavail * initial.bsize;
    assert.ok(initialFree >= fullMount.mountedBytes - 131072);
    for (let attempt = 0; attempt < 12; ++attempt) {
      const full = await req(
        'POST',
        files +
          '?' +
          new URLSearchParams({ parentId: a.fileId, name: 'owned-full.bin' }),
        Buffer.alloc(2097152, 0x5a),
        { 'content-type': 'application/octet-stream' },
      );
      assert.equal(full.status, 507);
      assert.equal((await full.json()).code, 'FILE_DISK_FULL');
      assert.deepEqual((await page(a.fileId)).entries, before);
      assert.deepEqual(await readdir(staging), []);
      const after = await statfs(runtime);
      assert.ok(
        after.bavail * after.bsize >= initialFree - 2 * fullMount.blockBytes,
      );
      assert.equal((await json('GET', path)).state, 'connected');
    }
    send({
      event: 'connected-http-disk-full-verified',
      attempts: 12,
      mountedBytes: fullMount.mountedBytes,
      maxTotalBytes: config.files.maxTotalBytes,
      maxFileBytes: config.files.maxFileBytes,
      httpStatus: 507,
      actualRdp: true,
      actualPortable: true,
      syntheticRdp: false,
      workerSha256,
      portableSha256: receipt.sha256,
    });
  }
  send({
    event: 'connected',
    rw,
    ro,
    seedSha: createHash('sha256').update(seed).digest('hex'),
    actualPortable: !installed,
    actualInstalledService: installed,
    jwt: true,
    workerSha256,
    portableSha256: receipt?.sha256,
    packageSha256: installed ? input.packageSha256 : undefined,
  });
  if (installedFull) {
    assert.equal((await next()).command, 'verify-installed-http-full');
    phase = 'installed-connected-http-disk-full';
    const before = (await page(a.fileId)).entries;
    const body = Buffer.alloc(1048576, 0x5a);
    for (let attempt = 0; attempt < 12; ++attempt) {
      const full = await req(
        'POST',
        files +
          '?' +
          new URLSearchParams({
            parentId: a.fileId,
            name: 'owned-full.bin',
          }),
        body,
        { 'content-type': 'application/octet-stream' },
      );
      assert.equal(full.status, 507);
      assert.equal((await full.json()).code, 'FILE_DISK_FULL');
      assert.deepEqual((await page(a.fileId)).entries, before);
      assert.equal((await json('GET', path)).state, 'connected');
    }
    body.fill(0);
    send({
      event: 'installed-connected-http-disk-full-verified',
      attempts: 12,
      maxTotalBytes: config.files.maxTotalBytes,
      maxFileBytes: config.files.maxFileBytes,
      httpStatus: 507,
      actualRdp: true,
      syntheticRdp: false,
      actualInstalledService: true,
      workerSha256,
      packageSha256: input.packageSha256,
    });
  }
  if (diskFull) {
    assert.equal((await next()).command, 'verify-drive-full');
    phase = 'drive-physical-disk-full';
    const full = await statfs(runtime);
    const freeBytes = full.bavail * full.bsize;
    assert.ok(freeBytes <= fullMount.blockBytes);
    const partial = (await page(a.fileId)).entries.find(
      (entry) => entry.name === 'owned-resource-full.bin',
    );
    assert.ok(
      partial && partial.size > 0 && partial.size <= fullMount.mountedBytes,
    );
    const data = await req('GET', files + '/' + partial.fileId);
    assert.equal(data.status, 200);
    const bytes = Buffer.from(await data.arrayBuffer());
    assert.equal(bytes.length, partial.size);
    assert.ok(
      bytes.every((value, index) => value === ((index * 17 + 83) & 255)),
    );
    bytes.fill(0);
    const blocked = await req(
      'POST',
      files +
        '?' +
        new URLSearchParams({
          parentId: a.fileId,
          name: 'while-drive-full.bin',
        }),
      Buffer.alloc(65536, 17),
      { 'content-type': 'application/octet-stream' },
    );
    assert.equal(blocked.status, 507);
    assert.equal((await blocked.json()).code, 'FILE_DISK_FULL');
    assert.equal((await json('GET', path)).state, 'connected');
    send({
      event: 'drive-disk-full-verified',
      freeBytes,
      partialBytes: partial.size,
      httpStatus: 507,
      actualRdp: true,
      syntheticRdp: false,
    });
    assert.equal((await next()).command, 'verify-drive-clean');
    phase = 'drive-full-refund';
    assert.equal((await page(a.fileId)).entries.length, 1);
    const stale = await req('GET', files + '/' + partial.fileId);
    assert.equal(stale.status, 404);
    assert.equal((await stale.json()).code, 'FILE_NOT_FOUND');
    const recovered = await statfs(runtime);
    assert.ok(
      recovered.bavail * recovered.bsize >= fullMount.mountedBytes - 131072,
    );
    send({ event: 'drive-disk-full-cleaned', staleLocatorRefused: true });
  }
  assert.equal((await next()).command, 'verify-remote');
  phase = 'http-readback';
  const folder = (await page(a.fileId)).entries.find(
    (entry) => entry.name === 'nested' && entry.kind === 'directory',
  );
  assert.ok(folder);
  const entry = (await page(folder.fileId)).entries.find(
    (entry) =>
      entry.name === 'renamed-\u0416\u65e5\u672c\u8a9e\ud83d\ude00.bin',
  );
  assert.ok(entry);
  assert.equal(entry.size, 65599);
  const download = await req('GET', files + '/' + entry.fileId);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('content-length'), '65599');
  assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
  assert.match(
    download.headers.get('content-disposition'),
    /filename\*=UTF-8''/,
  );
  assert.deepEqual(
    Buffer.from(await download.arrayBuffer()),
    pattern().subarray(0, 65599),
  );
  const payload = pattern();
  async function* chunks() {
    for (let offset = 0; offset < payload.length; offset += 12347)
      yield payload.subarray(offset, offset + 12347);
  }
  const hostFile = await upload(a.fileId, 'node-new.bin', chunks());
  payload.fill(0);
  assert.equal(hostFile.size, 131111);
  send({
    event: 'host-verified',
    bytes: 65599,
    chunkedUploadBytes: 131111,
    actualPortable: !installed,
    actualInstalledService: installed,
    jwtOwnerIsolation: true,
  });
  assert.equal((await next()).command, 'verify-clean');
  phase = 'post-delete-rw-list';
  assert.deepEqual((await page(a.fileId)).entries, []);
  phase = 'post-delete-ro-list';
  const readonly = await page(b.fileId);
  assert.equal(readonly.entries.length, 1);
  assert.equal(readonly.entries[0].name, 'seed.bin');
  phase = 'max-file-quota';
  const quota = await req(
    'POST',
    files +
      '?' +
      new URLSearchParams({ parentId: a.fileId, name: 'over-limit.bin' }),
    Buffer.alloc(2097153, 17),
    { 'content-type': 'application/octet-stream' },
  );
  assert.equal(quota.status, 413);
  assert.equal((await quota.json()).code, 'FILE_QUOTA_EXCEEDED');
  assert.deepEqual((await page(a.fileId)).entries, []);
  phase = 'stale-locator';
  const stale = await req('GET', files + '/' + hostFile.fileId);
  assert.equal(stale.status, 404);
  assert.equal((await stale.json()).code, 'FILE_NOT_FOUND');
  phase = 'session-close';
  const close = await req('DELETE', path);
  assert.equal(close.status, 200);
  await close.arrayBuffer();
  phase = 'runtime-after-session-close';
  if (!installed) {
    assert.deepEqual(
      await readdir(runtime),
      windows ? ['.bridge-service.lock'] : [],
    );
  }
  phase = 'launcher-stop';
  await stop();
  send({
    event: 'http-roundtrip-verified',
    actualRdp: true,
    actualPortable: !installed,
    actualInstalledService: installed,
    privateNode: true,
    jwt: true,
    staleLocatorRefused: true,
    launcherJoined: !installed,
    installedServiceRetired: installed,
    runtimeEmpty: true,
    maxFileQuotaRefused: true,
    connectedHttpDiskFull: diskFull,
    portableSha256: receipt?.sha256,
    packageSha256: installed ? input.packageSha256 : undefined,
    workerSha256,
  });
} catch (error) {
  failed = true;
  send({
    event: 'failed',
    phase,
    code: /^[A-Z_]+$/.test(error?.code ?? '') ? error.code : 'LAB_CHECK_FAILED',
    sourceLine: Number(
      /standalone-files-rdp-client\.mjs:(\d+):/.exec(error?.stack ?? '')?.[1] ??
        0,
    ),
    errorKind: [
      'TypeError',
      'TimeoutError',
      'AbortError',
      'AssertionError',
      'Error',
    ].includes(error?.name)
      ? error.name
      : 'Other',
    ...(/^[A-Z_]{1,64}$/.test(error?.cause?.code ?? '')
      ? { causeCode: error.cause.code }
      : {}),
    ...(typeof error?.cause?.socket?.bytesWritten === 'number'
      ? { socketBytesWritten: error.cause.socket.bytesWritten }
      : {}),
    ...(typeof error?.cause?.socket?.bytesRead === 'number'
      ? { socketBytesRead: error.cause.socket.bytesRead }
      : {}),
    ...(typeof error?.actual === 'number' || typeof error?.actual === 'boolean'
      ? { actual: error.actual }
      : {}),
    ...(typeof error?.expected === 'number' ||
    typeof error?.expected === 'boolean'
      ? { expected: error.expected }
      : {}),
  });
} finally {
  clearTimeout(timer);
  try {
    await stop();
  } catch {
    failed = true;
  }
  if (child && child.exitCode === null) {
    if (windows)
      await run('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        timeout: 10000,
        windowsHide: true,
      }).catch(() => {});
    else child.kill('SIGKILL');
    await terminal.catch(() => {});
  }
  if (diskFull && runtime) {
    assert.equal(dirname(runtime), fullRoot);
    assert.match(basename(runtime), /^bridge-portable-full-[A-Za-z0-9]+$/);
    try {
      // Never recursively delete an unjoined session tree after a failure.
      await rmdir(runtime);
    } catch {
      failed = true;
    }
  }
  if (scratch) {
    assert.equal(dirname(scratch), await realpath(tmpdir()));
    assert.match(basename(scratch), /^bridge-portable-files-[A-Za-z0-9]+$/);
    try {
      await rm(scratch, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      failed = true;
    }
  }
  send({ event: 'closed', clean: !failed });
  process.stdin.destroy();
  if (failed) process.exitCode = 1;
}
