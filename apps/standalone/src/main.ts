import { isAbsolute } from 'node:path';
import { resolveNativeRuntime } from '@freerdp-bridge/api/fastify';
import { readStandaloneConfig } from './config.js';
import { createStandaloneServer } from './server.js';

async function main() {
  if (
    process.versions.node.split('.')[0] !== '24' ||
    process.argv.length !== 6 ||
    process.argv[2] !== '--config' ||
    process.argv[4] !== '--runtime-root' ||
    !isAbsolute(process.argv[3]!) ||
    !isAbsolute(process.argv[5]!)
  )
    throw new Error('STANDALONE_USAGE');
  const config = await readStandaloneConfig(process.argv[3]!);
  const worker = await resolveNativeRuntime({ runtimeRoot: process.argv[5]! });
  const server = await createStandaloneServer(config, worker);
  let closing = false;
  const stop = () => {
    if (closing) return;
    closing = true;
    const deadline = setTimeout(() => process.exit(1), 10000);
    deadline.unref();
    void server.close().then(
      () => clearTimeout(deadline),
      () => process.exit(1),
    );
  };
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK'] as const)
    process.once(signal, stop);
  try {
    await server.listen(config.listen);
  } catch {
    await server.close();
    throw new Error('STANDALONE_START_FAILED');
  }
}
void main().catch(() => {
  console.error(JSON.stringify({ code: 'STANDALONE_START_FAILED' }));
  process.exitCode = 1;
});
