// Failure-only probe of the installed payload. Never emit paths, config or errors.
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
let phase = 'import';
let server;
try {
  const [payload, configuration, runtimeRoot] = process.argv
    .slice(2)
    .map((path) => resolve(path));
  const { resolveNativeRuntime, recoverRuntimeSessions } = await import(
    pathToFileURL(
      join(payload, 'service/node_modules/@freerdp-bridge/api/dist/plugin.js'),
    ).href
  );
  const { readStandaloneConfig } = await import(
    pathToFileURL(join(payload, 'service/dist/config.js')).href
  );
  const { createStandaloneServer } = await import(
    pathToFileURL(join(payload, 'service/dist/server.js')).href
  );
  phase = 'config';
  const config = await readStandaloneConfig(configuration);
  phase = 'resolve';
  const worker = await resolveNativeRuntime({ runtimeRoot });
  phase = 'recovery';
  const recovery = await recoverRuntimeSessions(worker);
  if (!recovery.supported || !recovery.complete) throw new Error();
  phase = 'create';
  server = await createStandaloneServer(config, worker);
  phase = 'listen';
  await server.listen(config.listen);
  phase = 'close';
  await server.close();
  server = undefined;
  console.log(JSON.stringify({ v: 1, phase: 'complete', failed: false }));
} catch {
  await server?.close().catch(() => {});
  console.log(JSON.stringify({ v: 1, phase, failed: true }));
  process.exitCode = 1;
}
