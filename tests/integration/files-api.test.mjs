import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { request as httpRequest } from 'node:http';
import { mkdtemp, realpath, lstat, readdir, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createSessionServer } from '../../apps/bridge-api/dist/session-server.js';
import { rdpBridgePlugin } from '../../apps/bridge-api/dist/plugin.js';
import { eventually } from '../fixtures/session-worker.mjs';
import { NativeFileWorker as FileWorker } from '../fixtures/file-worker.mjs';

const binaryDir = process.env.BRIDGE_FILE_TEST_BINARY_DIR;
const exec = promisify(execFile);
const workerPath = join(
  resolve(binaryDir ?? 'build/foundation'),
  'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
);
const require = createRequire(
  new URL('../../apps/bridge-api/package.json', import.meta.url),
);
const Fastify = require('fastify');
async function untilResponse(run, status) {
  const deadline = performance.now() + 5000;
  for (;;) {
    const response = await run();
    await response.arrayBuffer();
    if (response.status === status) return;
    assert.ok(
      performance.now() < deadline,
      `Expected HTTP ${status}, got ${response.status}`,
    );
    assert.equal(response.status, 429);
    await delay(10);
  }
}
// Real process, filesystem and private file IPC; RDP state alone is synthetic.
async function fixture(run, extra = {}) {
  const parent = await realpath(tmpdir());
  const root = await mkdtemp(join(parent, 'bridge-file-api-'));
  assert.equal(dirname(root), parent);
  if (extra.privateRoot && process.platform === 'win32') {
    await rmdir(root);
    const result = await exec(
      resolve(binaryDir, 'rdp-runtime-directory.exe'),
      ['--create-private-directory', root],
      { windowsHide: true, timeout: 5000, maxBuffer: 4096 },
    );
    assert.equal(result.stderr, '');
  }
  const workers = [];
  const files = {
    maxTotalBytes: 262144,
    maxFileBytes: 196608,
    maxEntries: 8,
    transferTimeoutMs: 5000,
    progressTimeoutMs: 2000,
    nativeTimeoutMs: 1000,
    ...extra.files,
  };
  const options = {
    worker: { workerPath, runtimeRoot: root },
    authenticate: (req) =>
      ['Bearer a', 'Bearer b'].includes(req.headers.authorization)
        ? { id: req.headers.authorization.at(-1) }
        : undefined,
    sessions: {
      files,
      createBurst: 100,
      ...extra.sessions,
      workerFactory: (limits) => {
        const w = new FileWorker(root, limits, extra.transport);
        workers.push(w);
        return w;
      },
    },
  };
  const server = extra.plugin
    ? Fastify({ requestTimeout: 15000, connectionTimeout: 15000 })
    : await createSessionServer(options);
  if (extra.plugin) {
    server.addContentTypeParser(
      'application/octet-stream',
      { parseAs: 'buffer' },
      (_r, b, done) => done(null, b),
    );
    server.post('/host', async (req) => ({ size: req.body.length }));
    await server.register(rdpBridgePlugin, { ...options, prefix: '/rdp' });
  }
  try {
    await server.listen({ host: '127.0.0.1', port: 0 });
    const base = `http://127.0.0.1:${server.server.address().port}${extra.plugin ? '/rdp' : ''}`;
    const req = (method, path, body, headers = {}, actor = 'a') =>
      fetch(base + path, {
        method,
        headers: { authorization: 'Bearer ' + actor, ...headers },
        ...(body === undefined ? {} : { body }),
        ...(body?.[Symbol.asyncIterator] ? { duplex: 'half' } : {}),
      });
    const create = async () => {
      const response = await req(
        'POST',
        '/v1/sessions',
        JSON.stringify({
          target: { host: 'synthetic.invalid' },
          auth: { username: 'test', password: 'synthetic-only' },
        }),
        { 'content-type': 'application/json' },
      );
      assert.equal(response.status, 202);
      const { sessionId } = await response.json();
      await eventually(() => workers.at(-1)?.started === 1);
      // started increments before the fake's connected microtask.
      await delay(5);
      return `/v1/sessions/${sessionId}/files`;
    };
    await run({ server, base, req, create, workers, files, root });
  } finally {
    await server.close();
    assert.deepEqual(await readdir(root), []);
    assert.equal((await lstat(root)).isSymbolicLink(), false);
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
}
for (const transport of process.platform === 'linux'
  ? ['framed-pipes', 'unix-seqpacket-rws1']
  : ['framed-pipes']) {
  test(
    `HTTP / ${transport}: actual native binary CRUD, Unicode names, opaque IDs and session isolation; synthetic RDP`,
    { skip: !binaryDir, timeout: 30000 },
    async () =>
      fixture(
        async ({ req, create, workers }) => {
          const path = await create();
          const make = await req(
            'POST',
            path + '/directories',
            JSON.stringify({ name: 'Каталог 日本語' }),
            { 'content-type': 'application/json' },
          );
          assert.equal(make.status, 201);
          const dir = await make.json();
          const payload = Buffer.alloc(131079);
          for (let i = 0; i < payload.length; i++) payload[i] = (i * 31) & 255;
          const url =
            path +
            '?name=' +
            encodeURIComponent('Ж日本語😀.bin') +
            '&parentId=' +
            dir.fileId;
          const up = await req('POST', url, payload, {
            'content-type': 'application/octet-stream',
          });
          assert.equal(up.status, 201, await up.clone().text());
          const file = await up.json();
          assert.match(file.fileId, /^[0-9a-f]{32}$/);
          assert.deepEqual(Object.keys(file).sort(), [
            'fileId',
            'kind',
            'name',
            'size',
          ]);
          const down = await req('GET', path + '/' + file.fileId);
          assert.equal(down.status, 200);
          assert.equal(
            down.headers.get('content-length'),
            String(payload.length),
          );
          assert.equal(down.headers.get('x-content-type-options'), 'nosniff');
          assert.match(
            down.headers.get('content-disposition'),
            /filename\*=UTF-8''/,
          );
          assert.deepEqual(Buffer.from(await down.arrayBuffer()), payload);
          const listing = await (
            await req('GET', path + '?parentId=' + dir.fileId)
          ).json();
          assert.deepEqual(listing, { entries: [file] });
          assert.equal(
            (await req('GET', path + '/' + file.fileId, undefined, {}, 'b'))
              .status,
            404,
          );
          const other = await create();
          assert.equal(
            (await req('GET', other + '/' + file.fileId)).status,
            404,
          );
          const collision = await req('POST', url, Buffer.from([1]), {
            'content-type': 'application/octet-stream',
          });
          assert.equal(collision.status, 409);
          assert.equal((await collision.json()).code, 'FILE_EXISTS');
          assert.equal(
            (await req('DELETE', path + '/' + dir.fileId)).status,
            409,
          );
          assert.equal(
            (
              await req('GET', path + '/' + file.fileId, undefined, {
                range: 'bytes=0-1',
              })
            ).status,
            400,
          );
          assert.equal(
            (await req('HEAD', path + '/' + file.fileId)).status,
            404,
          );
          assert.equal(
            (await req('DELETE', path + '/' + file.fileId)).status,
            204,
          );
          assert.equal(
            (await req('DELETE', path + '/' + dir.fileId)).status,
            204,
          );
          assert.deepEqual(await (await req('GET', path)).json(), {
            entries: [],
          });
          assert.ok(
            workers[0].calls
              .filter((c) => c.operation === 'write')
              .every((c) => c.bytes <= 65536),
          );
        },
        { transport },
      ),
  );
}
test(
  'HTTP: large declared quota refusals preserve the complete 413 envelope without native mutation',
  { skip: !binaryDir, timeout: 30000 },
  async () =>
    fixture(
      async ({ req, create, workers }) => {
        const path = await create(),
          before = workers[0].calls.length;
        const bytes = Buffer.alloc(2097153, 17);
        for (let i = 0; i < 40; i++) {
          const response = await req(
            'POST',
            path + '?name=refused.bin',
            bytes,
            { 'content-type': 'application/octet-stream' },
          );
          assert.equal(response.status, 413);
          assert.equal(response.headers.get('connection'), 'close');
          assert.equal((await response.json()).code, 'FILE_QUOTA_EXCEEDED');
        }
        assert.equal(workers[0].calls.length, before);
        assert.deepEqual((await (await req('GET', path)).json()).entries, []);
      },
      { files: { maxTotalBytes: 4194304, maxFileBytes: 2097152 } },
    ),
);

test(
  'HTTP: reject unowned, encoded, oversized, malformed and traversal uploads before native mutation',
  { skip: !binaryDir, timeout: 20000 },
  async () =>
    fixture(async ({ req, create, workers, files }) => {
      const path = await create(),
        calls = () => workers[0].calls.length;
      for (const [headers, actor, status] of [
        [{ 'content-type': 'application/octet-stream' }, 'b', 404],
        [{ 'content-type': 'application/octet-stream' }, 'none', 401],
        [{ 'content-type': 'text/plain' }, 'a', 415],
        [
          {
            'content-type': 'application/octet-stream',
            'content-encoding': 'gzip',
          },
          'a',
          415,
        ],
      ])
        assert.equal(
          (
            await req(
              'POST',
              path + '?name=x',
              Buffer.from([1]),
              headers,
              actor,
            )
          ).status,
          status,
        );
      assert.equal(calls(), 0);
      assert.equal(
        (
          await req(
            'POST',
            path + '?name=x',
            Buffer.alloc(files.maxFileBytes + 1),
            { 'content-type': 'application/octet-stream' },
          )
        ).status,
        413,
      );
      for (const name of ['../x', 'C:x', 'NUL', 'a\\b'])
        assert.equal(
          (
            await req(
              'POST',
              path + '?name=' + encodeURIComponent(name),
              Buffer.from([1]),
              { 'content-type': 'application/octet-stream' },
            )
          ).status,
          400,
        );
      assert.equal(
        (
          await req(
            'POST',
            path + '?name=x&maxFileBytes=999999',
            Buffer.from([1]),
            { 'content-type': 'application/octet-stream' },
          )
        ).status,
        400,
      );
      assert.equal(calls(), 0);
      const empty = await req('POST', path + '?name=empty', Buffer.alloc(0), {
        'content-type': 'application/octet-stream',
      });
      assert.equal(empty.status, 201);
      const file = await empty.json();
      const down = await req('GET', path + '/' + file.fileId);
      assert.equal(down.status, 200);
      assert.equal((await down.arrayBuffer()).byteLength, 0);
    }),
);
test(
  'HTTP: chunked quota failure and peer disconnect remove staged upload; native quota is reusable',
  { skip: !binaryDir, timeout: 20000 },
  async () =>
    fixture(async ({ base, req, create, workers }) => {
      const path = await create();
      async function* large() {
        for (let i = 0; i < 4; i++) yield Buffer.alloc(65536, i);
      }
      const response = await req('POST', path + '?name=too-large', large(), {
        'content-type': 'application/octet-stream',
      });
      assert.equal(response.status, 413, await response.clone().text());
      assert.equal((await response.json()).code, 'FILE_QUOTA_EXCEEDED');
      assert.deepEqual(await (await req('GET', path)).json(), { entries: [] });
      const socket = httpRequest(base + path + '?name=aborted', {
        method: 'POST',
        headers: {
          authorization: 'Bearer a',
          'content-type': 'application/octet-stream',
        },
      });
      socket.on('error', () => {});
      socket.write(Buffer.alloc(1024));
      await eventually(
        () =>
          workers[0].calls.filter((c) => c.operation === 'begin-upload')
            .length === 2,
      );
      const busy = await req('GET', path);
      assert.equal(busy.status, 429);
      socket.destroy();
      await eventually(
        () =>
          workers[0].calls.filter((c) => c.operation === 'abort').length === 2,
      );
      // Recorded calls observe dispatch, before the native abort acknowledgement
      // releases the operation lease. Wait for the public completion boundary.
      await untilResponse(() => req('GET', path), 200);
      assert.deepEqual(await (await req('GET', path)).json(), { entries: [] });
      const again = await req(
        'POST',
        path + '?name=again',
        Buffer.alloc(196608),
        { 'content-type': 'application/octet-stream' },
      );
      assert.equal(again.status, 201, await again.clone().text());
    }),
);
test(
  'HTTP: stalled upload times out with fixed response and releases its temporary native entry',
  { skip: !binaryDir, timeout: 20000 },
  async () =>
    fixture(
      async ({ base, req, create, workers }) => {
        const path = await create();
        const result = new Promise((resolve, reject) => {
          const socket = httpRequest(
            base + path + '?name=stalled',
            {
              method: 'POST',
              headers: {
                authorization: 'Bearer a',
                'content-type': 'application/octet-stream',
              },
            },
            (response) => {
              const chunks = [];
              response.on('data', (b) => chunks.push(b));
              response.on('end', () =>
                resolve({
                  status: response.statusCode,
                  body: JSON.parse(Buffer.concat(chunks)),
                }),
              );
            },
          );
          socket.on('error', reject);
          socket.write(Buffer.from([1]));
        });
        const response = await result;
        assert.equal(response.status, 408);
        assert.equal(response.body.code, 'FILE_TIMEOUT');
        assert.equal(workers[0].calls.at(-1).operation, 'abort');
        assert.deepEqual(await (await req('GET', path)).json(), {
          entries: [],
        });
      },
      {
        files: {
          nativeTimeoutMs: 200,
          progressTimeoutMs: 600,
          transferTimeoutMs: 2000,
        },
      },
    ),
);
for (const transport of process.platform === 'linux'
  ? ['framed-pipes', 'unix-seqpacket-rws1']
  : ['framed-pipes']) {
  test(
    `HTTP / ${transport}: lost file completion retires authority, reclaims crashed native contents and permits a replacement; synthetic RDP`,
    { skip: !binaryDir, timeout: 20000 },
    async () =>
      fixture(
        async ({ req, create, workers, root }) => {
          const path = await create();
          const sessionPath = path.replace(/\/files$/, '');
          const seed = await req(
            'POST',
            path + '?name=committed.bin',
            Buffer.alloc(131111, 71),
            {
              'content-type': 'application/octet-stream',
            },
          );
          assert.equal(seed.status, 201);
          const file = await seed.json();
          const late = Promise.withResolvers();
          let held = false;
          const worker = workers[0];
          const original = worker.fileCommand.bind(worker);
          worker.fileCommand = async (command) => {
            const result = await original(command);
            if (command.operation === 'write' && !held) {
              held = true;
              // The actual native write completed. Model its unknown backend
              // completion while killing that owned process with staged data;
              // the real ManagedFiles deadline/fatal path retires the session.
              worker.native.terminate();
              await late.promise;
            }
            return result;
          };
          try {
            const response = await req(
              'POST',
              path + '?name=pending.bin',
              Buffer.alloc(65536, 29),
              {
                'content-type': 'application/octet-stream',
              },
            );
            assert.equal(held, true);
            assert.equal(response.status, 502);
            assert.equal((await response.json()).code, 'FILE_FAILED');
            const snapshot = await (await req('GET', sessionPath)).json();
            assert.equal(snapshot.state, 'failed');
            assert.equal(snapshot.error.code, 'FILE_FAILED');
            await worker.native.close();
            assert.deepEqual(await readdir(root), []);
            // Repeated authenticated file calls must not revive the old owner.
            const retired = await req('GET', path + '/' + file.fileId);
            assert.equal(retired.status, 409);
            assert.equal((await retired.json()).code, 'FILES_NOT_CONNECTED');
            late.resolve();
            await delay(10);
            assert.equal(
              (await (await req('GET', sessionPath)).json()).state,
              'failed',
            );
            // maxSessions=maxPerPrincipal=1: creation proves capacity returned.
            const replacement = await create();
            assert.notEqual(replacement, path);
            assert.deepEqual(await (await req('GET', replacement)).json(), {
              entries: [],
            });
          } finally {
            late.resolve();
          }
        },
        {
          transport,
          privateRoot: true,
          sessions: { maxSessions: 1, maxPerPrincipal: 1 },
          files: { nativeTimeoutMs: 200 },
        },
      ),
  );
}

test(
  'HTTP: interrupted download releases native pin before a later delete',
  { skip: !binaryDir, timeout: 30000 },
  async () =>
    fixture(
      async ({ base, req, create, workers }) => {
        const path = await create();
        const up = await req(
          'POST',
          path + '?name=large.bin',
          Buffer.alloc(4194304, 91),
          { 'content-type': 'application/octet-stream' },
        );
        assert.equal(up.status, 201);
        const file = await up.json();
        await new Promise((resolve, reject) => {
          const socket = httpRequest(
            base + path + '/' + file.fileId,
            { headers: { authorization: 'Bearer a' } },
            (response) => {
              response.once('data', () => {
                response.destroy();
                socket.destroy();
                resolve();
              });
              response.on('error', () => {});
            },
          );
          socket.on('error', reject);
          socket.end();
        });
        await eventually(() =>
          workers[0].calls.some((c) => c.operation === 'close-download'),
        );
        await untilResponse(() => req('DELETE', path + '/' + file.fileId), 204);
      },
      { files: { maxTotalBytes: 8388608, maxFileBytes: 4194304 } },
    ),
);
test(
  'HTTP: closing a session cancels a stalled upload and joins native cleanup',
  { skip: !binaryDir, timeout: 20000 },
  async () =>
    fixture(async ({ base, req, create, workers, root }) => {
      const path = await create();
      const upload = new Promise((resolve, reject) => {
        const socket = httpRequest(
          base + path + '?name=incomplete',
          {
            method: 'POST',
            headers: {
              authorization: 'Bearer a',
              'content-type': 'application/octet-stream',
            },
          },
          (response) => {
            response.resume();
            response.once('end', () => resolve(response.statusCode));
          },
        );
        socket.on('error', reject);
        socket.write(Buffer.from([1]));
      });
      await eventually(() =>
        workers[0].calls.some((c) => c.operation === 'write'),
      );
      const closed = await req('DELETE', path.replace(/\/files$/, ''));
      assert.equal(closed.status, 200);
      assert.equal(await upload, 409);
      assert.deepEqual(await readdir(root), []);
    }),
);
test(
  'Fastify file streaming remains encapsulated from the host binary parser',
  { skip: !binaryDir, timeout: 20000 },
  async () =>
    fixture(
      async ({ base, req, create }) => {
        const path = await create();
        const response = await req(
          'POST',
          path + '?name=plugin.bin',
          Buffer.alloc(100000, 7),
          { 'content-type': 'application/octet-stream' },
        );
        assert.equal(response.status, 201, await response.clone().text());
        const host = await fetch(base.replace(/\/rdp$/, '') + '/host', {
          method: 'POST',
          body: Buffer.alloc(12000),
          headers: { 'content-type': 'application/octet-stream' },
        });
        assert.equal(host.status, 200);
        assert.deepEqual(await host.json(), { size: 12000 });
      },
      { plugin: true },
    ),
);
