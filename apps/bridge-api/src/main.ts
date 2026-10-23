import { resolve } from 'node:path';
import { createSessionServer } from './session-server.js';

const server = await createSessionServer({
  worker: {
    workerPath:
      process.env.BRIDGE_WORKER_PATH ??
      resolve(
        'build/foundation/rdp-worker' +
          (process.platform === 'win32' ? '.exe' : ''),
      ),
    runtimeRoot: process.env.BRIDGE_SESSION_RUNTIME_DIR ?? resolve('.runtime'),
  },
  allowedOrigins: [],
});
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void server.close();
  });
await server.listen({
  host: process.env.BRIDGE_LISTEN_HOST ?? '127.0.0.1',
  port: Number(process.env.BRIDGE_LISTEN_PORT ?? 8080),
});
