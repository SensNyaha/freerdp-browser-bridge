// Actual Node owner and native worker, without RDP credentials or a connection.
// The bounded hold lets the driver kill both processes before JS cleanup can run.
import { WorkerProcess } from '../../packages/node-bridge/dist/index.js';
import { rm, rmdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { runtimeFixture, binaryDir } from './runtime-ownership.mjs';

await runtimeFixture(async (root, directory) => {
  await rm(join(directory, '.rdp-worker-owned'));
  await rmdir(directory);
  const worker = new WorkerProcess({
    workerPath: join(
      binaryDir,
      'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
    ),
    runtimeRoot: root,
  });
  try {
    await worker.start();
    const names = await readdir(root);
    if (names.length !== 1) throw new Error('RECOVERY_FIXTURE_NOT_READY');
    // PID is test-control metadata, never cleanup/deletion authority.
    process.stdout.write(
      JSON.stringify({ root, name: names[0], pid: worker.pid }) + '\n',
    );
    await new Promise((resolve) => {
      process.stdin.once('data', (bytes) => {
        if (bytes.toString('utf8') !== 'hold\n') {
          resolve();
          return;
        }
        process.stdout.write('holding\n', () => {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20000);
          resolve();
        });
      });
      process.stdin.resume();
    });
  } finally {
    worker.terminate();
    await worker.close();
  }
});
