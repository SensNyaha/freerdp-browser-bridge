import Fastify from 'fastify';
import { probeWorkerBuild, type WorkerOptions } from '@freerdp-bridge/node';

/** Foundation API exposes actual worker build information; session API comes in Stage 2. */
export async function createBuildServer(options: WorkerOptions) {
  const build = await probeWorkerBuild(options);
  const server = Fastify({ logger: false, bodyLimit: 65536 });
  server.get('/healthz', async () => ({ status: 'ok' }));
  server.get('/readyz', async () => ({
    status: 'ok',
    rdp: build.capabilities.rdp,
  }));
  server.get('/v1/build', async () => ({
    ...build,
    nodeVersion: process.version,
    enabledChannels: [],
    codecProviders: [],
  }));
  server.get('/v1/capabilities', async () => ({
    ...build.capabilities,
    devices: [],
  }));
  return server;
}
