// Real installed MSI/native/HTTP/RDPDR acceptance. Never starts a substitute server.
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import {
  open,
  readFile,
  realpath,
  readdir,
  rename,
  statfs,
  unlink,
} from 'node:fs/promises';
import { resolve, join, sep, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { windowsFullRoot } from './windows-full-root.mjs';
import {
  requireWindowsInstalledCi,
  windowsInstalledPrivateRecords,
  windowsInstalledBootstrap,
  windowsInstalledRuntimeComponent,
  windowsInstalledStagingRequest,
  windowsInstalledStagingResponse,
} from './windows-installed-full-inputs.mjs';
import {
  standalonePayloadInventory,
  readStandalonePayloadFile,
} from '../../scripts/standalone/payload.mjs';
import {
  windowsManagedFilesScript,
  parseWindowsFilesReceipt,
} from '../../scripts/windows-managed-files-lab.mjs';

const send = (value) => process.stdout.write(JSON.stringify(value) + '\n');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const pattern = () =>
  Buffer.from(Array.from({ length: 131111 }, (_, i) => (i * 31 + 17) & 255));
let ws, pressure, pressurePath, sessionPath, request, input, records;
let phase = 'admission',
  failed = false,
  serviceActive = false,
  nativePid;
async function next() {
  const controller = new AbortController();
  try {
    const result = await Promise.race([
      records.next(),
      delay(60000, undefined, { signal: controller.signal }).then(() => {
        throw new Error('OWNED_INSTALLED_CONTROL_DEADLINE');
      }),
    ]);
    assert.equal(result.done, false, 'OWNED_INSTALLED_CONTROL_CLOSED');
    return result.value;
  } finally {
    controller.abort();
  }
}
try {
  requireWindowsInstalledCi(
    process.platform,
    process.argv.slice(2),
    process.env,
  );
  records = windowsInstalledPrivateRecords(process.stdin);
  input = windowsInstalledBootstrap(await next(), process.env.COMPUTERNAME);
  const volume = await windowsFullRoot(input.root, input.proofPath);
  const runtime = join(input.root, 'runtime');
  const build = await realpath(resolve('build'));
  for (const name of ['runtimePackageRoot', 'runtimeArchivePath']) {
    assert.equal(input[name], await realpath(input[name]));
    assert.ok(input[name].startsWith(build + sep));
  }
  const lock = JSON.parse(
    await readFile('packaging/standalone/locks/win32-x64.json', 'utf8'),
  );
  const locked =
    lock.packages['node_modules/@freerdp-bridge/runtime-win32-x64'];
  assert.equal(locked.version, input.version);
  const archive = await readStandalonePayloadFile(
    input.runtimeArchivePath,
    67108864,
  );
  assert.equal(
    'sha512-' + createHash('sha512').update(archive).digest('base64'),
    locked.integrity,
  );
  const program = await realpath(
    join(process.env.ProgramFiles, 'FreeRDP Bridge'),
  );
  const installedRuntime = join(
    program,
    'service/node_modules/@freerdp-bridge/runtime-win32-x64',
  );
  const nativeInventory = await standalonePayloadInventory(
    input.runtimePackageRoot,
  );
  assert.deepEqual(
    await standalonePayloadInventory(installedRuntime),
    nativeInventory,
  );
  const worker = join(installedRuntime, 'runtime/bin/rdp-worker.exe');
  assert.equal(
    hash(await readStandalonePayloadFile(worker, 67108864)),
    input.workerSha256,
  );
  assert.equal(
    JSON.parse(await readFile(join(program, 'service/package.json'), 'utf8'))
      .version,
    input.version,
  );
  const require = createRequire(join(program, 'service/package.json'));
  const { SignJWT } = await import(pathToFileURL(require.resolve('jose')).href);
  const { WebSocket } = createRequire(
    join(program, 'service/node_modules/@freerdp-bridge/api/package.json'),
  )('ws');
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const origin = 'http://127.0.0.1:47997';
  const config = {
    schemaVersion: 1,
    listen: { host: '127.0.0.1', port: 8080 },
    allowedOrigins: [origin],
    targets: [{ host: '127.0.0.1', port: 3389 }],
    limits: { maxSessions: 1, maxPerPrincipal: 1 },
    files: {
      maxTotalBytes: 4194304,
      maxFileBytes: 2097152,
      maxEntries: 64,
      xrdpLegacyDelete: false,
    },
    auth: {
      issuer: 'https://owned-msi.example.test',
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
  phase = 'service-configure';
  send({ event: 'service-configuration', configuration: config });
  const ready = await next();
  assert.equal(ready.command, 'service-ready');
  assert.equal(ready.serviceSid, 'S-1-5-19');
  assert.ok(Number.isSafeInteger(ready.servicePid) && ready.servicePid > 1);
  serviceActive = true;
  async function token(subject) {
    return new SignJWT({ sub: subject, scope: 'rdp:connect' })
      .setIssuer(config.auth.issuer)
      .setAudience('bridge')
      .setIssuedAt()
      .setExpirationTime('5m')
      .setProtectedHeader({ alg: 'RS256', kid: 'owned', typ: 'at+jwt' })
      .sign(privateKey);
  }
  const owner = await token('owned-msi-owner'),
    other = await token('owned-msi-other');
  request = (method, path, body, headers = {}, actor = owner) =>
    fetch('http://127.0.0.1:8080' + path, {
      method,
      headers: { authorization: 'Bearer ' + actor, ...headers },
      ...(body === undefined ? {} : { body }),
      ...(body?.[Symbol.asyncIterator] ? { duplex: 'half' } : {}),
      signal: AbortSignal.timeout(15000),
    });
  const json = async (method, path) => {
    const response = await request(method, path);
    assert.ok(response.ok);
    return response.json();
  };
  phase = 'session-create';
  const response = await request(
    'POST',
    '/rdp/v1/sessions',
    JSON.stringify({
      target: config.targets[0],
      auth: input.credentials,
      security: { protocol: 'nla', certificatePolicy: 'prompt' },
      timeouts: { connectMs: 20000 },
      media: { audioOutput: 'off' },
      redirection: {
        drives: [
          {
            name: 'RW' + input.id.slice(0, 5),
            source: { kind: 'session-sandbox', subdir: 'rw' },
          },
        ],
        thinclientDrives: [
          { name: 'RO' + input.id.slice(0, 5), subdir: 'ro', readOnly: true },
        ],
      },
    }),
    { 'content-type': 'application/json' },
  );
  delete input.credentials.password;
  assert.equal(response.status, 202);
  const session = await response.json();
  assert.match(session.sessionId, /^[0-9a-f]{32}$/);
  sessionPath = '/rdp/v1/sessions/' + session.sessionId;
  const files = sessionPath + '/files';
  let sequence = 0,
    prompts = 0,
    certificateFailed = false;
  ws = new WebSocket(
    'ws://127.0.0.1:8080' +
      sessionPath +
      '/control?token=' +
      session.attach.control.token,
    ['freerdp-bridge-v1'],
    { origin, handshakeTimeout: 10000 },
  );
  ws.on('error', () => {
    certificateFailed = true;
  });
  ws.on('message', (bytes) => {
    try {
      assert.ok(bytes.length <= 65536);
      const event = JSON.parse(bytes.toString());
      if (event.type === 'certificate.prompt') {
        prompts++;
        const accept = event.data.fingerprint === input.fingerprint;
        if (!accept) certificateFailed = true;
        ws.send(
          JSON.stringify({
            v: 1,
            type: 'certificate.response',
            seq: ++sequence,
            ts: Date.now(),
            data: {
              challenge: event.data.challenge,
              fingerprint: event.data.fingerprint,
              accept,
            },
          }),
        );
      }
    } catch {
      certificateFailed = true;
    }
  });
  phase = 'rdp-connect';
  await once(ws, 'open');
  const connectDue = performance.now() + 45000;
  for (;;) {
    const state = await json('GET', sessionPath);
    if (state.state === 'connected') break;
    assert.ok(
      !certificateFailed &&
        state.state !== 'failed' &&
        performance.now() < connectDue,
      'OWNED_INSTALLED_CONNECT_FAILED',
    );
    await delay(100);
  }
  assert.equal(certificateFailed, false);
  assert.equal(prompts, 1);
  send({ event: 'native-identity-requested', sessionId: session.sessionId });
  const identity = await next();
  assert.equal(identity.command, 'native-identity');
  assert.equal(identity.workerSid, 'S-1-5-19');
  assert.equal(identity.workerSha256, input.workerSha256);
  assert.ok(Number.isSafeInteger(identity.nativePid) && identity.nativePid > 1);
  nativePid = identity.nativePid;
  const page = (id) => json('GET', files + (id ? '?parentId=' + id : ''));
  const roots = (await page()).entries;
  const rw = roots.find((e) => e.name === 'rw' && e.kind === 'directory'),
    ro = roots.find((e) => e.name === 'ro' && e.kind === 'directory');
  assert.ok(rw && ro);
  const upload = async (parentId, name, body) => {
    const result = await request(
      'POST',
      files + '?' + new URLSearchParams({ parentId, name }),
      body,
      { 'content-type': 'application/octet-stream' },
    );
    assert.equal(result.status, 201);
    return result.json();
  };
  const download = async (entry, maximum = 131111) => {
    assert.ok(
      Number.isSafeInteger(entry.size) &&
        entry.size >= 0 &&
        entry.size <= maximum &&
        maximum <= 1048576,
    );
    const result = await request('GET', files + '/' + entry.fileId);
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('content-length'), String(entry.size));
    assert.equal(
      result.headers.get('content-type'),
      'application/octet-stream',
    );
    assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
    assert.match(
      result.headers.get('content-disposition'),
      /filename\*=UTF-8''/,
    );
    const bytes = Buffer.alloc(entry.size);
    let count = 0;
    for await (const chunk of result.body) {
      assert.ok(count + chunk.byteLength <= bytes.length);
      bytes.set(chunk, count);
      count += chunk.byteLength;
    }
    assert.equal(count, bytes.length);
    return bytes;
  };
  const seed = Buffer.from(
    'Bridge owned seed ' + input.id + ' \u0416\u65e5\u672c\u8a9e\ud83d\ude00',
  );
  await upload(rw.fileId, 'seed.bin', seed);
  await upload(ro.fileId, 'seed.bin', seed);
  const script = await windowsManagedFilesScript();
  await upload(rw.fileId, 'owned-check.ps1', script);
  const foreign = await request('GET', files, undefined, {}, other);
  assert.equal(foreign.status, 404);
  assert.equal((await foreign.json()).code, 'SESSION_NOT_FOUND');
  const unauth = await fetch('http://127.0.0.1:8080' + files);
  assert.equal(unauth.status, 401);
  await unauth.arrayBuffer();
  phase = 'runtime-observation';
  const component = windowsInstalledRuntimeComponent(await readdir(runtime));
  send({ event: 'staging-observer-requested', component });
  const observer = await next();
  assert.equal(observer.command, 'staging-observer-ready');
  assert.equal(observer.principalSid, 'S-1-5-18');
  assert.equal(
    observer.directory,
    join(dirname(input.proofPath), 'staging-observer'),
  );
  let observationSequence = 0;
  async function observeStaging(entries, minimum) {
    const query = windowsInstalledStagingRequest(
      { sequence: ++observationSequence, entries, minimum },
      observationSequence,
    );
    const requestPath = join(
      observer.directory,
      'request-' + observationSequence + '.json',
    );
    const responsePath = join(
      observer.directory,
      'response-' + observationSequence + '.json',
    );
    const file = await open(requestPath + '.new', 'wx');
    try {
      await file.writeFile(JSON.stringify(query));
    } finally {
      await file.close();
    }
    await rename(requestPath + '.new', requestPath);
    const due = performance.now() + 8000;
    for (;;) {
      try {
        const value = windowsInstalledStagingResponse(
          JSON.parse(
            (await readStandalonePayloadFile(responsePath, 1024)).toString(
              'utf8',
            ),
          ),
          query,
        );
        await unlink(requestPath);
        await unlink(responsePath);
        return value;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      assert.ok(performance.now() < due, 'OWNED_INSTALLED_STREAM_BARRIER');
      await delay(10);
    }
  }
  phase = 'bounded-pressure';
  const ownedPressurePath = join(input.root, 'owned-pressure.bin');
  pressure = await open(ownedPressurePath, 'wx', 0o600);
  pressurePath = ownedPressurePath;
  const zeros = Buffer.alloc(65536);
  let written = 0;
  for (;;) {
    const remaining = await statfs(runtime);
    assert.equal(remaining.bsize, 4096);
    if (remaining.bavail * remaining.bsize <= 786432) break;
    assert.ok(written + zeros.length <= volume.mountedBytes);
    await pressure.writeFile(zeros);
    written += zeros.length;
  }
  await pressure.sync();
  await pressure.close();
  pressure = undefined;
  zeros.fill(0);
  const baseline = await statfs(runtime),
    initialFree = baseline.bavail * baseline.bsize;
  assert.equal(baseline.bsize, 4096);
  assert.ok(initialFree >= 655360 && initialFree <= 786432);
  phase = 'connected-http-full';
  const before = (await page(rw.fileId)).entries,
    body = Buffer.alloc(1048576, 0x5a);
  let confirmedWritten = 0;
  for (let attempt = 0; attempt < 12; attempt++) {
    async function* chunks() {
      yield body.subarray(0, 393216);
      await observeStaging(1, 393216);
      confirmedWritten += 393216;
      yield body.subarray(393216);
    }
    const full = await request(
      'POST',
      files +
        '?' +
        new URLSearchParams({
          parentId: rw.fileId,
          name: 'owned-http-full.bin',
        }),
      chunks(),
      {
        'content-type': 'application/octet-stream',
        'content-length': String(body.length),
      },
    );
    assert.equal(full.status, 507);
    assert.equal((await full.json()).code, 'FILE_DISK_FULL');
    assert.deepEqual((await page(rw.fileId)).entries, before);
    await observeStaging(0, 0);
    const fs = await statfs(runtime);
    assert.ok(fs.bavail * fs.bsize >= initialFree - 8192);
    assert.equal((await json('GET', sessionPath)).state, 'connected');
  }
  body.fill(0);
  assert.ok(confirmedWritten > 4194304);
  send({
    event: 'installed-connected-http-full-verified',
    attempts: 12,
    httpStatus: 507,
    confirmedBeforeProducerEofBytes: confirmedWritten,
    actualRdp: true,
  });
  phase = 'owned-ci-task';
  send({
    event: 'owned-ci-task-requested',
    id: input.id,
    scriptSha256: hash(script),
  });
  assert.equal((await next()).command, 'owned-ci-task-started');
  async function receipt(name, expectedPhase) {
    const due = performance.now() + 80000;
    while (performance.now() < due) {
      const entries = (await page(rw.fileId)).entries;
      for (const entry of [
        entries.find((e) => e.name === 'receipt-failed.json'),
        entries.find((e) => e.name === name),
      ].filter(Boolean)) {
        if (!entry.size) continue;
        assert.ok(
          Number.isSafeInteger(entry.size) &&
            entry.size > 0 &&
            entry.size <= 2048,
        );
        const result = await request('GET', files + '/' + entry.fileId);
        if (result.status === 200) {
          assert.equal(
            result.headers.get('content-length'),
            String(entry.size),
          );
          const value = Buffer.alloc(entry.size);
          let count = 0;
          for await (const chunk of result.body) {
            assert.ok(count + chunk.byteLength <= value.length);
            value.set(chunk, count);
            count += chunk.byteLength;
          }
          assert.equal(count, value.length);
          const text = value.toString();
          value.fill(0);
          if (!text.trim()) continue;
          const isFailed = entry.name === 'receipt-failed.json';
          const parsed = parseWindowsFilesReceipt(
            text,
            input.id,
            isFailed ? 'failed' : expectedPhase,
            !isFailed && expectedPhase === 'full',
          );
          if (isFailed) throw new Error('OWNED_INSTALLED_REMOTE_FAILED');
          return { entry, value: parsed };
        }
        assert.ok([404, 409, 429].includes(result.status));
        await result.arrayBuffer();
      }
      await delay(200);
    }
    throw new Error('OWNED_INSTALLED_RECEIPT_DEADLINE');
  }
  phase = 'windows-drive-full';
  const fullReceipt = await receipt('receipt-full.json', 'full');
  const fullFs = await statfs(runtime);
  send({
    event: 'owned-full-space-sample',
    freeBytes: fullFs.bavail * fullFs.bsize,
  });
  assert.equal(fullFs.bavail * fullFs.bsize, 0);
  const partial = (await page(rw.fileId)).entries.find(
    (e) => e.name === 'owned-resource-full.bin',
  );
  assert.ok(partial && partial.size > 0 && partial.size <= 1048576);
  const partialBytes = await download(partial, 1048576);
  assert.ok(partialBytes.every((v, i) => v === ((i * 17 + 83) & 255)));
  partialBytes.fill(0);
  const cross = await request(
    'POST',
    files +
      '?' +
      new URLSearchParams({ parentId: rw.fileId, name: 'while-full.bin' }),
    Buffer.alloc(65536, 17),
    { 'content-type': 'application/octet-stream' },
  );
  assert.equal(cross.status, 507);
  assert.equal((await cross.json()).code, 'FILE_DISK_FULL');
  const removed = await request('DELETE', files + '/' + partial.fileId);
  assert.equal(removed.status, 204);
  await removed.arrayBuffer();
  const staleFull = await request('GET', files + '/' + partial.fileId);
  assert.equal(staleFull.status, 404);
  assert.equal((await staleFull.json()).code, 'FILE_NOT_FOUND');
  const recovered = await statfs(runtime);
  assert.ok(recovered.bavail * recovered.bsize >= initialFree - 16384);
  await upload(
    rw.fileId,
    'continue-full.json',
    Buffer.from(JSON.stringify({ id: input.id, command: 'resume-after-full' })),
  );
  send({
    event: 'installed-windows-drive-full-verified',
    actualRdp: true,
    physicalFreeBytes: 0,
    remoteErrno: fullReceipt.value.errno,
    acknowledgedBytes: fullReceipt.value.acknowledgedBytes,
    partialBytes: partial.size,
    crossHttpStatus: 507,
  });
  phase = 'remote-created';
  const created = await receipt('receipt-created.json', 'created');
  assert.equal(created.value.sha256, hash(pattern().subarray(0, 65599)));
  const folder = (await page(rw.fileId)).entries.find(
    (e) => e.name === 'nested' && e.kind === 'directory',
  );
  assert.ok(folder);
  const remote = (await page(folder.fileId)).entries.find(
    (e) => e.name === 'renamed-\u0416\u65e5\u672c\u8a9e\ud83d\ude00.bin',
  );
  assert.ok(remote);
  assert.equal(remote.size, 65599);
  assert.deepEqual(await download(remote), pattern().subarray(0, 65599));
  const payload = pattern();
  async function* hostChunks() {
    for (let i = 0; i < payload.length; i += 12347)
      yield payload.subarray(i, i + 12347);
  }
  const hostFile = await upload(rw.fileId, 'node-new.bin', hostChunks());
  payload.fill(0);
  assert.equal(hostFile.size, 131111);
  await upload(
    rw.fileId,
    'continue.json',
    Buffer.from(JSON.stringify({ id: input.id, command: 'cleanup' })),
  );
  phase = 'remote-clean';
  const clean = await receipt('receipt-clean.json', 'clean');
  assert.deepEqual(
    (await page(rw.fileId)).entries.map((e) => e.name),
    ['receipt-clean.json'],
  );
  const readonly = (await page(ro.fileId)).entries;
  assert.equal(readonly.length, 1);
  assert.equal(readonly[0].name, 'seed.bin');
  assert.deepEqual(await download(readonly[0]), seed);
  const stale = await request('GET', files + '/' + hostFile.fileId);
  assert.equal(stale.status, 404);
  assert.equal((await stale.json()).code, 'FILE_NOT_FOUND');
  const cleanDelete = await request('DELETE', files + '/' + clean.entry.fileId);
  assert.equal(cleanDelete.status, 204);
  await cleanDelete.arrayBuffer();
  assert.deepEqual((await page(rw.fileId)).entries, []);
  phase = 'max-file-quota';
  const quota = await request(
    'POST',
    files +
      '?' +
      new URLSearchParams({ parentId: rw.fileId, name: 'over-limit.bin' }),
    Buffer.alloc(2097153, 17),
    { 'content-type': 'application/octet-stream' },
  );
  assert.equal(quota.status, 413);
  assert.equal((await quota.json()).code, 'FILE_QUOTA_EXCEEDED');
  assert.deepEqual((await page(rw.fileId)).entries, []);
  phase = 'session-close';
  const closed = await request('DELETE', sessionPath);
  assert.equal(closed.status, 200);
  await closed.arrayBuffer();
  sessionPath = undefined;
  assert.throws(() => process.kill(nativePid, 0), { code: 'ESRCH' });
  assert.deepEqual(await readdir(runtime), ['.bridge-service.lock']);
  send({
    event: 'installed-msi-files-verified',
    actualInstalledService: true,
    actualRdp: true,
    syntheticRdp: false,
    http507s: 13,
    workerSha256: input.workerSha256,
    msiSha256: input.msiSha256,
    nativePackageFilesMatched: nativeInventory.length,
    unicodeRenameBytes: 65599,
    chunkedUploadBytes: 131111,
    readOnlyRefusals: 3,
    nativePidExited: true,
    staleLocatorRefused: true,
    maxFileQuotaRefused: true,
  });
} catch (error) {
  failed = true;
  send({
    event: 'failed',
    phase,
    code: /^OWNED_INSTALLED_[A-Z_]+$/.test(error?.message ?? '')
      ? error.message
      : 'OWNED_INSTALLED_CHECK_FAILED',
    sourceLine: Number(
      /windows-installed-files-client\.mjs:(\d+):/.exec(
        error?.stack ?? '',
      )?.[1] ?? 0,
    ),
  });
} finally {
  try {
    if (sessionPath && request) {
      const closed = await request('DELETE', sessionPath);
      await closed.arrayBuffer();
    }
    ws?.terminate();
    await pressure?.close();
    if (pressurePath) await unlink(pressurePath);
    if (serviceActive) {
      send({ event: 'service-stop-requested' });
      const retired = await next();
      assert.equal(retired.command, 'service-stopped');
      assert.equal(retired.nativeJoined, true);
      assert.equal(retired.runtimeEmpty, true);
      assert.equal(retired.uninstalled, true);
    }
    send({ event: 'closed', clean: true });
  } catch {
    failed = true;
    send({ event: 'closed', clean: false });
  }
  if (input?.credentials) delete input.credentials.password;
  process.stdin.destroy();
}
process.exitCode = failed ? 1 : 0;
