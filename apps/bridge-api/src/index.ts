import Fastify, { type FastifyServerOptions } from 'fastify';
import {
  probeWorkerBuild,
  probeWorkerFeatures,
  type WorkerOptions,
} from '@freerdp-bridge/node';

/** Foundation API exposes actual worker build information; session API comes in Stage 2. */
export async function createBuildServer(
  options: WorkerOptions,
  serverOptions?: FastifyServerOptions,
) {
  const build = await probeWorkerBuild(options);
  const features = await probeWorkerFeatures(options);
  const server = Fastify({ logger: false, bodyLimit: 65536, ...serverOptions });
  server.get('/healthz', async () => ({ status: 'ok' }));
  server.get('/readyz', async () => ({
    status: 'ok',
    rdp: build.capabilities.rdp,
  }));
  server.get('/v1/build', async () => ({
    ...build,
    nodeVersion: process.version,
    ...features,
  }));
  server.get('/v1/capabilities', async () => ({
    ...build.capabilities,
    devices: [],
  }));
  return server;
}
