import { resolve } from 'node:path';
import { createBuildServer } from './index.js';

const server = await createBuildServer({
  workerPath:
    process.env.BRIDGE_WORKER_PATH ??
    resolve(
      'build/foundation/rdp-worker' +
        (process.platform === 'win32' ? '.exe' : ''),
    ),
  runtimeRoot: process.env.BRIDGE_SESSION_RUNTIME_DIR ?? resolve('.runtime'),
});
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void server.close();
  });
await server.listen({
  host: '127.0.0.1',
  port: Number(process.env.BRIDGE_LISTEN_PORT ?? 8080),
});
