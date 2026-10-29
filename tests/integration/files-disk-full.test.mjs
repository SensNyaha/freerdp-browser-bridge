import test from 'node:test';
import assert from 'node:assert/strict';
import { isAbsolute, join, resolve } from 'node:path';
import {
  lstat,
  mkdtemp,
  readdir,
  realpath,
  rm,
  statfs,
} from 'node:fs/promises';
import { Writable } from 'node:stream';
import { createSessionServer } from '../../apps/bridge-api/dist/session-server.js';
import { NativeFileWorker } from '../fixtures/file-worker.mjs';
import { eventually } from '../fixtures/session-worker.mjs';

const binaryDir = process.env.BRIDGE_FILE_TEST_BINARY_DIR;
const fullRoot = process.env.BRIDGE_FILE_TEST_FULL_ROOT;
const enabled = process.platform === 'linux' && binaryDir && fullRoot;

// Explicitly provision a disposable tmpfs of at most 1 MiB. This suite never
// fills the normal temporary directory, creates mounts, changes permissions
// or starts RDP. Missing opt-in skips; an unsafe opt-in fails before allocation.
for (const transport of ['framed-pipes', 'unix-seqpacket-rws1']) {
  test(
    `HTTP bounded tmpfs / ${transport}: real native ENOSPC returns 507, repeatedly refunds quota and permits fresh IO; synthetic RDP`,
    { skip: !enabled, timeout: 20000 },
    async (t) => {
      assert.ok(isAbsolute(fullRoot));
      assert.equal(await realpath(fullRoot), fullRoot);
      const base = await lstat(fullRoot);
      assert.equal(base.isDirectory(), true);
      assert.equal(base.isSymbolicLink(), false);
      const filesystem = await statfs(fullRoot);
      assert.equal(filesystem.type, 0x01021994);
      const mountedBytes = filesystem.bsize * filesystem.blocks;
      assert.ok(mountedBytes >= 131072 && mountedBytes <= 1048576);
      assert.ok(filesystem.bavail * filesystem.bsize >= mountedBytes - 65536);
      const runtimeRoot = await mkdtemp(join(fullRoot, 'bridge-http-full-'));
      const workers = [];
      const server = await createSessionServer({
        worker: {
          workerPath: resolve(binaryDir, 'rdp-worker'),
          runtimeRoot,
        },
        authenticate: (request) =>
          request.headers.authorization === 'Bearer synthetic-file-owner'
            ? { id: 'synthetic-file-owner' }
            : undefined,
        sessions: {
          maxSessions: 1,
          maxPerPrincipal: 1,
          files: {
            maxTotalBytes: 8388608,
            maxFileBytes: 4194304,
            maxEntries: 16,
            nativeTimeoutMs: 1000,
            progressTimeoutMs: 2000,
            transferTimeoutMs: 5000,
          },
          workerFactory: (limits) => {
            const worker = new NativeFileWorker(runtimeRoot, limits, transport);
            workers.push(worker);
            return worker;
          },
        },
        logDestination: new Writable({
          write(_bytes, _encoding, done) {
            done();
          },
        }),
      });
      try {
        await server.listen({ host: '127.0.0.1', port: 0 });
        const baseUrl = 'http://127.0.0.1:' + server.server.address().port;
        const req = (method, path, body, headers = {}) =>
          fetch(baseUrl + path, {
            method,
            headers: {
              authorization: 'Bearer synthetic-file-owner',
              ...headers,
            },
            ...(body === undefined ? {} : { body }),
          });
        const created = await req(
          'POST',
          '/v1/sessions',
          JSON.stringify({ target: { host: 'no-rdp.invalid' }, auth: {} }),
          { 'content-type': 'application/json' },
        );
        assert.equal(created.status, 202);
        const { sessionId } = await created.json();
        const path = '/v1/sessions/' + sessionId;
        const files = path + '/files';
        const due = performance.now() + 5000;
        for (;;) {
          const state = await (await req('GET', path)).json();
          if (state.state === 'connected') break;
          assert.notEqual(state.state, 'failed');
          assert.ok(performance.now() < due);
          await new Promise((done) => setTimeout(done, 5));
        }
        const worker = workers[0];
        const call = worker.fileCommand.bind(worker);
        let diskFullReplies = 0;
        let successfulNativeWriteBytes = 0;
        let maximumFreeBytesAtFull = 0;
        worker.fileCommand = async (command) => {
          const reply = await call(command);
          if (command.operation === 'write' && reply.status === 'ok')
            successfulNativeWriteBytes += Number(reply.value);
          if (reply.status === 'disk-full') {
            ++diskFullReplies;
            const full = await statfs(runtimeRoot);
            const free = full.bavail * full.bsize;
            maximumFreeBytesAtFull = Math.max(maximumFreeBytesAtFull, free);
            assert.ok(free <= 65536);
          }
          return reply;
        };
        const directory = (await readdir(runtimeRoot))[0];
        assert.match(directory, /^worker-[0-9a-f]{32}-1-[0-9a-f]{32}$/);
        const uploads = join(
          runtimeRoot,
          directory,
          'managed-files',
          '.uploads',
        );
        for (let attempt = 0; attempt < 12; ++attempt) {
          const response = await req(
            'POST',
            files + '?name=too-large-for-owned-tmpfs.bin',
            Buffer.alloc(2097152, 0x5a),
            { 'content-type': 'application/octet-stream' },
          );
          assert.equal(response.status, 507);
          assert.equal((await response.json()).code, 'FILE_DISK_FULL');
          assert.equal(diskFullReplies, attempt + 1);
          assert.equal(
            worker.calls.filter((entry) => entry.operation === 'abort').length,
            attempt + 1,
          );
          assert.deepEqual(await (await req('GET', files)).json(), {
            entries: [],
          });
          assert.deepEqual(await readdir(uploads), []);
          const available = await statfs(runtimeRoot);
          assert.ok(available.bavail * available.bsize >= 524288);
        }
        assert.ok(successfulNativeWriteBytes > 8388608);
        const payload = Buffer.alloc(65536, 0xa5);
        const upload = await req(
          'POST',
          files + '?name=after-full.bin',
          payload,
          {
            'content-type': 'application/octet-stream',
          },
        );
        assert.equal(upload.status, 201);
        const file = await upload.json();
        assert.equal(file.size, payload.length);
        const download = await req('GET', files + '/' + file.fileId);
        assert.equal(download.status, 200);
        assert.deepEqual(Buffer.from(await download.arrayBuffer()), payload);
        const removed = await req('DELETE', files + '/' + file.fileId);
        assert.equal(removed.status, 204);
        await removed.arrayBuffer();
        await worker.native.ping();
        const closed = await req('DELETE', path);
        assert.equal(closed.status, 200);
        await closed.arrayBuffer();
        await eventually(() => worker.native.state === 'closed');
        assert.deepEqual(await readdir(runtimeRoot), []);
        t.diagnostic(
          JSON.stringify({
            transport,
            mountedBytes,
            attempts: 12,
            diskFullReplies,
            successfulNativeWriteBytes,
            quotaBytes: 8388608,
            maximumFreeBytesAtFull,
          }),
        );
      } finally {
        await server.close();
        assert.deepEqual(await readdir(runtimeRoot), []);
        assert.equal((await lstat(runtimeRoot)).isSymbolicLink(), false);
        await rm(runtimeRoot, { recursive: true, force: true, maxRetries: 3 });
      }
    },
  );
}
