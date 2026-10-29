// Actual RDP/file application acceptance, explicitly owned prepared window only.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import {
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rmdir,
  writeFile,
} from 'node:fs/promises';
import { resolve, dirname, basename, sep } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { once } from 'node:events';
import { Writable } from 'node:stream';
import { createRequire } from 'node:module';
import { NativeSessionWorker } from '../packages/node-bridge/dist/index.js';
import { createSessionServer } from '../apps/bridge-api/dist/session-server.js';
import {
  readWindowsFilesLabInput,
  windowsManagedFilesScript,
  dispatchWindowsManagedFiles,
  parseWindowsFilesReceipt,
} from './windows-managed-files-lab.mjs';

const { WebSocket } = createRequire(
  new URL('../apps/bridge-api/package.json', import.meta.url),
)('ws');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const pattern = () =>
  Buffer.from(Array.from({ length: 131111 }, (_, i) => (i * 31 + 17) & 255));
const send = (value) => process.stdout.write(JSON.stringify(value) + '\n');
let runtimeRoot, server, ws, nativePid;
let phase = 'input',
  failed = false;
try {
  assert.deepEqual(process.argv.slice(2), [
    '--owned-windows-managed-files',
    '--prepared-powershell',
  ]);
  const input = await readWindowsFilesLabInput(process.stdin);
  phase = 'worker-binding';
  const build = await realpath(resolve('build'));
  const workerPath = await realpath(resolve(input.workerPath));
  assert.ok(workerPath.startsWith(build + sep));
  assert.ok(['rdp-worker', 'rdp-worker.exe'].includes(basename(workerPath)));
  const binary = await readFile(workerPath);
  assert.equal(hash(binary), input.workerSha256);
  binary.fill(0);
  runtimeRoot = await mkdtemp(
    resolve('build/current-validation/windows-files-owned-'),
  );
  if (process.platform === 'win32') {
    await rmdir(runtimeRoot);
    const result = await promisify(execFile)(
      resolve(dirname(workerPath), 'rdp-runtime-directory.exe'),
      ['--create-private-directory', runtimeRoot],
      { windowsHide: true, timeout: 5000, maxBuffer: 4096 },
    );
    assert.equal(result.stderr, '');
  }
  const bearer = randomBytes(32).toString('hex');
  const origin = 'http://127.0.0.1:47998';
  const options = {
    workerPath,
    runtimeRoot,
    maxWriteBytes: 131072,
    ipcTransport: input.ipcTransport,
  };
  const natives = [];
  let audioEvents = 0;
  server = await createSessionServer({
    worker: options,
    allowedOrigins: [origin],
    authenticate: (req) =>
      req.headers.authorization === 'Bearer ' + bearer
        ? { id: 'owned-windows-file-lab' }
        : req.headers.authorization === 'Bearer owned-other-principal'
          ? { id: 'other-lab' }
          : undefined,
    sessions: {
      maxSessions: 1,
      maxPerPrincipal: 1,
      files: {
        maxTotalBytes: 4194304,
        maxFileBytes: 2097152,
        maxEntries: 64,
        xrdpLegacyDelete: false,
      },
      workerFactory: (limits) => {
        const worker = new NativeSessionWorker(options, limits);
        worker.onAudio(() => {
          ++audioEvents;
        });
        natives.push(worker);
        return worker;
      },
    },
    logDestination: new Writable({
      write(bytes, _encoding, done) {
        assert.ok(bytes.length <= 65536);
        bytes.fill(0);
        done();
      },
    }),
  });
  await server.listen({ host: '127.0.0.1', port: 0 });
  const base = 'http://127.0.0.1:' + server.server.address().port;
  const request = (method, path, body, headers = {}, actor = bearer) =>
    fetch(base + path, {
      method,
      headers: { authorization: 'Bearer ' + actor, ...headers },
      ...(body === undefined ? {} : { body }),
      ...(body?.[Symbol.asyncIterator] ? { duplex: 'half' } : {}),
      signal: AbortSignal.timeout(10000),
    });
  const json = async (method, path, value) => {
    const response = await request(
      method,
      path,
      value === undefined ? undefined : JSON.stringify(value),
      value === undefined ? {} : { 'content-type': 'application/json' },
    );
    assert.ok(response.ok, 'LAB_HTTP_STATUS');
    return response.json();
  };
  const rw = 'RW' + input.id.slice(0, 5),
    ro = 'RO' + input.id.slice(0, 5);
  phase = 'create';
  const response = await request(
    'POST',
    '/v1/sessions',
    JSON.stringify({
      target: { host: input.host, port: input.port },
      auth: input.credentials,
      security: { certificatePolicy: 'prompt' },
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
  const session = await response.json();
  const path = '/v1/sessions/' + session.sessionId,
    files = path + '/files';
  let sequence = 0,
    certificateFailed = false,
    promptCount = 0;
  ws = new WebSocket(
    base.replace('http:', 'ws:') +
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
        ++promptCount;
        const prompt = event.data;
        const accept = prompt.fingerprint === input.fingerprint;
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
  await Promise.race([
    once(ws, 'open'),
    delay(10000).then(() => {
      throw new Error('LAB_WS_DEADLINE');
    }),
  ]);
  phase = 'connect';
  const due = performance.now() + 35000;
  for (;;) {
    const state = await json('GET', path);
    if (state.state === 'connected') break;
    assert.ok(
      !certificateFailed && state.state !== 'failed' && performance.now() < due,
      'LAB_CONNECT_FAILED',
    );
    await delay(100);
  }
  assert.equal(certificateFailed, false);
  assert.equal(promptCount, 1);
  nativePid = natives[0].pid;
  assert.ok(Number.isSafeInteger(nativePid) && nativePid > 1);
  const page = (parentId) =>
    json('GET', files + (parentId ? '?parentId=' + parentId : ''));
  const root = await page();
  const a = root.entries.find(
    (entry) => entry.name === 'rw' && entry.kind === 'directory',
  );
  const b = root.entries.find(
    (entry) => entry.name === 'ro' && entry.kind === 'directory',
  );
  assert.ok(a && b);
  const upload = async (parentId, name, data) => {
    const reply = await request(
      'POST',
      files + '?' + new URLSearchParams({ parentId, name }),
      data,
      { 'content-type': 'application/octet-stream' },
    );
    assert.equal(reply.status, 201);
    const entry = await reply.json();
    assert.match(entry.fileId, /^[0-9a-f]{32}$/);
    return entry;
  };
  const download = async (entry) => {
    const reply = await request('GET', files + '/' + entry.fileId);
    assert.equal(reply.status, 200);
    assert.equal(reply.headers.get('content-length'), String(entry.size));
    assert.equal(reply.headers.get('content-type'), 'application/octet-stream');
    assert.equal(reply.headers.get('x-content-type-options'), 'nosniff');
    assert.match(
      reply.headers.get('content-disposition'),
      /filename\*=UTF-8''/,
    );
    const parts = [];
    let size = 0;
    for await (const part of reply.body) {
      size += part.byteLength;
      assert.ok(size <= 131111);
      parts.push(Buffer.from(part));
    }
    assert.equal(size, entry.size);
    return Buffer.concat(parts, size);
  };
  const seed = Buffer.from(
    'Bridge owned seed ' + input.id + ' \u0416\u65e5\u672c\u8a9e\ud83d\ude00',
  );
  await upload(a.fileId, 'seed.bin', seed);
  await upload(b.fileId, 'seed.bin', seed);
  const script = await windowsManagedFilesScript();
  const scriptEntry = await upload(a.fileId, 'owned-check.ps1', script);
  assert.deepEqual(await download(scriptEntry), script);
  const foreign = await request(
    'GET',
    files,
    undefined,
    {},
    'owned-other-principal',
  );
  assert.equal(foreign.status, 404);
  assert.equal((await foreign.json()).code, 'SESSION_NOT_FOUND');
  const unauthenticated = await fetch(base + files, {
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(unauthenticated.status, 401);
  await unauthenticated.arrayBuffer();
  send({
    event: 'connected',
    actualRdp: true,
    endpoint: 'windows',
    scriptSha256: hash(script),
    xrdpLegacyDelete: false,
  });
  phase = 'remote-application';
  // PostConnect precedes Windows shell activation after an RDP reconnect.
  // The operator still supplies the active empty window; this is lab settling,
  // not a production readiness guarantee or a substitute for receipt readback.
  await delay(8000);
  await dispatchWindowsManagedFiles(
    (event) => natives[0].sendInput(event),
    input,
    input.id,
    true,
  );
  if (process.platform === 'win32') {
    const frame = await natives[0].captureFrame(0n);
    if (frame?.jpeg?.length > 0 && frame.jpeg.length <= 4194304)
      await writeFile(
        resolve(
          '.local-tests',
          'windows-files-' + input.id + '-after-input.jpg',
        ),
        frame.jpeg,
        { mode: 0o600 },
      );
  }
  const waitReceipt = async (name, expectedPhase) => {
    const deadline = performance.now() + 80000;
    while (performance.now() < deadline) {
      const entries = (await page(a.fileId)).entries;
      const failed = entries.find(
        (entry) => entry.name === 'receipt-failed.json',
      );
      const entry = failed ?? entries.find((entry) => entry.name === name);
      if (entry?.size > 0) {
        assert.ok(entry.size <= 2048);
        const reply = await request('GET', files + '/' + entry.fileId);
        if (reply.status === 200) {
          const parts = [];
          let length = 0;
          for await (const bytes of reply.body) {
            length += bytes.byteLength;
            assert.ok(length <= 2048);
            parts.push(Buffer.from(bytes));
          }
          const value = Buffer.concat(parts, length).toString('utf8');
          const receipt = parseWindowsFilesReceipt(
            value,
            input.id,
            failed ? 'failed' : expectedPhase,
          );
          if (failed) {
            console.log(
              JSON.stringify({
                event: 'owned-application-refused',
                phase: receipt.phase,
                errno: receipt.errno,
              }),
            );
            throw new Error('LAB_REMOTE_FAILED');
          }
          return { entry, value: receipt };
        }
        // A receipt created by a still-open RDP writer is not yet a result.
        assert.ok([404, 409, 429].includes(reply.status));
        await reply.arrayBuffer();
      }
      await delay(200);
    }
    throw new Error('LAB_REMOTE_DEADLINE');
  };
  const created = await waitReceipt('receipt-created.json', 'created');
  assert.equal(created.value.sha256, hash(pattern().subarray(0, 65599)));
  phase = 'http-readback';
  const folder = (await page(a.fileId)).entries.find(
    (entry) => entry.name === 'nested' && entry.kind === 'directory',
  );
  assert.ok(folder);
  const remote = (await page(folder.fileId)).entries.find(
    (entry) =>
      entry.name === 'renamed-\u0416\u65e5\u672c\u8a9e\ud83d\ude00.bin',
  );
  assert.ok(remote);
  assert.equal(remote.size, 65599);
  assert.deepEqual(await download(remote), pattern().subarray(0, 65599));
  const payload = pattern();
  async function* chunks() {
    for (let i = 0; i < payload.length; i += 12347)
      yield payload.subarray(i, i + 12347);
  }
  const hostFile = await upload(a.fileId, 'node-new.bin', chunks());
  payload.fill(0);
  assert.equal(hostFile.size, 131111);
  await upload(
    a.fileId,
    'continue.json',
    Buffer.from(JSON.stringify({ id: input.id, command: 'cleanup' })),
  );
  phase = 'remote-delete';
  const clean = await waitReceipt('receipt-clean.json', 'clean');
  assert.deepEqual(
    (await page(a.fileId)).entries.map((entry) => entry.name),
    ['receipt-clean.json'],
  );
  const readonly = (await page(b.fileId)).entries;
  assert.equal(readonly.length, 1);
  assert.equal(readonly[0].name, 'seed.bin');
  assert.deepEqual(await download(readonly[0]), seed);
  const stale = await request('GET', files + '/' + hostFile.fileId);
  assert.equal(stale.status, 404);
  assert.equal((await stale.json()).code, 'FILE_NOT_FOUND');
  const remove = await request('DELETE', files + '/' + clean.entry.fileId);
  assert.equal(remove.status, 204);
  assert.deepEqual((await page(a.fileId)).entries, []);
  phase = 'close';
  const close = await request('DELETE', path);
  assert.equal(close.status, 200);
  await close.arrayBuffer();
  assert.throws(() => process.kill(nativePid, 0), { code: 'ESRCH' });
  assert.deepEqual(await readdir(runtimeRoot), []);
  assert.equal(audioEvents, 0);
  send({
    event: 'windows-managed-files-verified',
    actualRdp: true,
    applicationReadback: true,
    workerSha256: input.workerSha256,
    ipcTransport: input.ipcTransport,
    unicodeRenameBytes: 65599,
    chunkedUploadBytes: 131111,
    readOnlyRefusals: 3,
    foreignPrincipalRefused: true,
    staleLocatorRefused: true,
    nativePidExited: true,
    xrdpLegacyDelete: false,
    hostClipboardAccess: false,
    audioEvents,
  });
} catch (error) {
  failed = true;
  send({
    event: 'failed',
    phase,
    code: /^[A-Z_]+$/.test(error?.message ?? '')
      ? error.message
      : 'LAB_CHECK_FAILED',
  });
} finally {
  try {
    ws?.terminate();
    await server?.close();
    if (nativePid)
      assert.throws(() => process.kill(nativePid, 0), { code: 'ESRCH' });
    if (runtimeRoot) {
      assert.deepEqual(await readdir(runtimeRoot), []);
      await rmdir(runtimeRoot);
    }
    send({ event: 'closed', clean: true });
  } catch {
    failed = true;
    send({ event: 'closed', clean: false });
  }
  process.stdin.destroy();
  if (failed) process.exitCode = 1;
}
