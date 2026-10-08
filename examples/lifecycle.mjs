import { resolve } from 'node:path';
import { WorkerProcess } from '../packages/node-bridge/dist/index.js';

const worker = new WorkerProcess({
  workerPath: resolve(
    'build/foundation/rdp-worker' +
      (process.platform === 'win32' ? '.exe' : ''),
  ),
  runtimeRoot: resolve('.runtime'),
});
try {
  const build = await worker.start();
  console.log(build);
  await worker.ping();
} finally {
  await worker.close();
}
