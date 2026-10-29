import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  readdir,
  rm,
  realpath,
  lstat,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { WorkerProcess } from '../../packages/node-bridge/dist/index.js';
import { decodeFilePage } from '../../packages/protocol/dist/index.js';
const binaryDir = process.env.BRIDGE_FILE_TEST_BINARY_DIR;
const workerPath = join(
  resolve(binaryDir ?? 'build/foundation'),
  'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
);
const request = (
  worker,
  operation,
  id = 0n,
  argument = 0n,
  value = 0n,
  data = Buffer.alloc(0),
  flags = 0,
) => worker.nativeFileCommand({ operation, id, argument, value, data, flags });
async function fixture(run) {
  const parent = await realpath(tmpdir()),
    root = await mkdtemp(join(parent, 'bridge-file-ipc-'));
  assert.equal(dirname(root), parent);
  assert.match(basename(root), /^bridge-file-ipc-/);
  try {
    await run(root);
  } finally {
    assert.equal((await lstat(root)).isSymbolicLink(), false);
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
}
for (const transport of process.platform === 'linux'
  ? ['framed', 'seqpacket']
  : ['framed']) {
  test(
    `native file IPC / ${transport}: actual worker binary upload, listing, download and joined empty runtime cleanup; no RDP`,
    { skip: !binaryDir, timeout: 20000 },
    async () =>
      fixture(async (runtimeRoot) => {
        const worker = new WorkerProcess({
          workerPath,
          runtimeRoot,
          maxWriteBytes: 131072,
          ipcTransport:
            transport === 'framed' ? 'framed-pipes' : 'unix-seqpacket-rws1',
        });
        try {
          const build = await worker.start();
          assert.equal(build.capabilities.fileService, true);
          if (!build.capabilities.xrdpLegacyDelete) {
            await assert.rejects(
              request(
                worker,
                'initialize',
                262144n,
                131072n,
                8n,
                Buffer.alloc(0),
                1,
              ),
              { code: 'RDP_SETTING_NOT_IMPLEMENTED' },
            );
            await worker.ping();
          }
          assert.equal(
            (await request(worker, 'initialize', 262144n, 131072n, 8n)).status,
            'ok',
          );
          const upload = await request(
            worker,
            'begin-upload',
            0n,
            0n,
            0n,
            Buffer.from('Привет 日本語 😀.bin'),
          );
          assert.equal(upload.status, 'ok');
          assert.equal(
            (await request(worker, 'list', 0n, 0n, 64n)).argument,
            0n,
          );
          const data = Buffer.alloc(65536);
          for (let i = 0; i < data.length; i++) data[i] = (i * 31) & 255;
          const a = request(worker, 'write', upload.id, 0n, 0n, data);
          await assert.rejects(
            request(worker, 'write', upload.id, 0n, 0n, data),
            { code: 'FILES_BUSY' },
          );
          assert.equal((await a).value, 65536n);
          assert.equal(
            (
              await request(
                worker,
                'write',
                upload.id,
                65536n,
                0n,
                Buffer.from([0, 255]),
              )
            ).status,
            'ok',
          );
          assert.equal(
            (await request(worker, 'commit', upload.id, 65538n)).status,
            'ok',
          );
          const list = decodeFilePage(
            await request(worker, 'list', 0n, 0n, 64n),
          );
          assert.deepEqual(list, [
            {
              id: upload.id,
              parent: 0n,
              bytes: 65538n,
              directory: false,
              name: 'Привет 日本語 😀.bin',
            },
          ]);
          assert.equal(
            (await request(worker, 'open-download', upload.id)).value,
            65538n,
          );
          assert.equal(
            (await request(worker, 'remove', upload.id)).status,
            'busy',
          );
          assert.deepEqual(
            (await request(worker, 'read', upload.id, 0n, 65536n)).data,
            data,
          );
          assert.deepEqual(
            (await request(worker, 'read', upload.id, 65536n, 65536n)).data,
            Buffer.from([0, 255]),
          );
          assert.equal(
            (await request(worker, 'close-download', upload.id)).status,
            'ok',
          );
          // Closing the process must remove committed files and a pending upload.
          assert.equal(
            (
              await request(
                worker,
                'begin-upload',
                0n,
                0n,
                0n,
                Buffer.from('pending.bin'),
              )
            ).status,
            'ok',
          );
        } finally {
          await worker.close();
        }
        assert.equal(worker.state, 'closed');
        assert.deepEqual(await readdir(runtimeRoot), []);
      }),
  );
}
test(
  'native file IPC: unrecognized runtime content survives both native and Node cleanup refusal',
  { skip: !binaryDir, timeout: 15000 },
  async () =>
    fixture(async (runtimeRoot) => {
      let directory;
      const worker = new (class extends WorkerProcess {
        spawnWorker(path, env) {
          directory = path;
          return super.spawnWorker(path, env);
        }
      })({ workerPath, runtimeRoot });
      try {
        await worker.start();
        assert.equal(
          (await request(worker, 'initialize', 8n, 8n, 4n)).status,
          'ok',
        );
        assert.equal(dirname(directory), runtimeRoot);
        const sentinel = join(directory, 'managed-files', 'host-sentinel');
        await writeFile(sentinel, 'owned refusal sentinel', {
          flag: 'wx',
          mode: 0o600,
        });
        await assert.rejects(worker.close(), {
          code: 'FILE_CONTENTS_RETAINED',
        });
        assert.equal(worker.state, 'failed');
        assert.equal(
          await readFile(sentinel, 'utf8'),
          'owned refusal sentinel',
        );
      } finally {
        await worker
          .close()
          .catch((error) => assert.equal(error.code, 'FILE_CONTENTS_RETAINED'));
      }
    }),
);
