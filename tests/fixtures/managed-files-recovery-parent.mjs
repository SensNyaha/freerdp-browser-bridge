// Own binary files only; no RDP connection or credentials. The driver kills
// both processes while this owner is blocked, preventing graceful JS cleanup.
import assert from 'node:assert/strict';
import { readdir, rm, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { WorkerProcess } from '../../packages/node-bridge/dist/index.js';
import { runtimeFixture, binaryDir } from './runtime-ownership.mjs';

const transport = process.argv[2];
if (
  process.argv.length !== 3 ||
  !['framed-pipes', 'unix-seqpacket-rws1'].includes(transport)
)
  throw new Error('MANAGED_RECOVERY_FIXTURE_ARGUMENTS');

await runtimeFixture(async (root, initial) => {
  await rm(join(initial, '.rdp-worker-owned'));
  await rmdir(initial);
  const worker = new WorkerProcess({
    workerPath: join(
      binaryDir,
      'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
    ),
    runtimeRoot: root,
    ipcTransport: transport,
    maxWriteBytes: 131072,
  });
  const request = (
    operation,
    id = 0n,
    argument = 0n,
    value = 0n,
    data = Buffer.alloc(0),
  ) => worker.nativeFileCommand({ operation, id, argument, value, data });
  try {
    assert.equal((await worker.start()).capabilities.fileService, true);
    assert.equal(
      (await request('initialize', 524288n, 262144n, 16n)).status,
      'ok',
    );
    const folder = await request('mkdir', 0n, 0n, 0n, Buffer.from('nested'));
    assert.equal(folder.status, 'ok');
    const payload = Buffer.alloc(131111, 0xa7);
    const upload = await request(
      'begin-upload',
      folder.id,
      0n,
      0n,
      Buffer.from('owned-Ж日本語😀.bin'),
    );
    assert.equal(upload.status, 'ok');
    for (let position = 0; position < payload.length; position += 65536)
      assert.equal(
        (
          await request(
            'write',
            upload.id,
            BigInt(position),
            0n,
            payload.subarray(position, position + 65536),
          )
        ).status,
        'ok',
      );
    assert.equal(
      (await request('commit', upload.id, BigInt(payload.length))).status,
      'ok',
    );
    const staged = await request(
      'begin-upload',
      0n,
      0n,
      0n,
      Buffer.from('partial.bin'),
    );
    assert.equal(staged.status, 'ok');
    assert.equal(
      (await request('write', staged.id, 0n, 0n, payload.subarray(0, 65536)))
        .status,
      'ok',
    );
    payload.fill(0);
    const names = await readdir(root);
    assert.equal(names.length, 1);
    process.stdout.write(
      JSON.stringify({ root, name: names[0], pid: worker.pid }) + '\n',
    );
    await new Promise((resolve) => {
      process.stdin.once('data', (bytes) => {
        if (bytes.toString('utf8') === 'hold\n')
          process.stdout.write('holding\n', () => {
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20000);
            resolve();
          });
        else resolve();
      });
      process.stdin.resume();
    });
  } finally {
    worker.terminate();
    await worker.close();
  }
});
