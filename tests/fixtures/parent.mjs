import { WorkerProcess } from '../../packages/node-bridge/dist/index.js';
const worker = new WorkerProcess({
  workerPath: process.argv[2],
  runtimeRoot: process.argv[3],
  ...(process.argv[4] ? { ipcTransport: process.argv[4] } : {}),
});
await worker.start();
process.stdout.write(JSON.stringify({ pid: worker.pid }) + '\n');
setInterval(() => {}, 1000);
