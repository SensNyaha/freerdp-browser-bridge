// Failure-only probe of the installed payload. Never emit paths, config or errors.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { open, unlink, writeFile } from 'node:fs/promises';
const localServiceReport = process.argv[5] === '--owned-localservice-result';
let reportPath;
let timer;
if (localServiceReport) {
  const source = dirname(fileURLToPath(import.meta.url));
  const match = /^windows-msi-run-([a-f0-9]{32})$/.exec(
    dirname(source).split(/[\\/]/).at(-1),
  );
  if (
    process.platform !== 'win32' ||
    process.argv.length !== 6 ||
    !match ||
    !/^[A-Z]:\\bridge-owned-full-[a-f0-9]{32}\\runtime$/.test(
      process.argv[4],
    ) ||
    !process.argv[4].includes(match[1])
  )
    process.exit(2);
  reportPath = join(source, 'output', 'diagnostic.json');
  // Match the service supervisor's environment before importing its modules.
  for (const name of Object.keys(process.env))
    if (!['SYSTEMROOT', 'WINDIR'].includes(name.toUpperCase()))
      delete process.env[name];
  process.env.PATH = join(process.env.SystemRoot, 'System32');
  process.env.TEMP = process.env.TMP = process.argv[4];
  timer = setTimeout(() => process.exit(3), 25000);
}
async function report(value) {
  console.log(JSON.stringify(value));
  if (reportPath)
    await writeFile(reportPath, JSON.stringify(value), { flag: 'wx' });
}
let phase = 'import';
let server;
let ownedWritePath;
try {
  const [payload, configuration, runtimeRoot] = process.argv
    .slice(2, 5)
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
  if (localServiceReport) {
    phase = 'runtime-write';
    const path = join(runtimeRoot, '.owned-msi-startup-write');
    const file = await open(path, 'wx');
    ownedWritePath = path;
    try {
      await file.writeFile('owned-runtime-write');
      await file.sync();
    } finally {
      await file.close();
    }
    phase = 'runtime-delete';
    await unlink(path);
    ownedWritePath = undefined;
  }
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
  await report({ v: 1, phase: 'complete', failed: false });
} catch {
  if (ownedWritePath) await unlink(ownedWritePath).catch(() => {});
  await server?.close().catch(() => {});
  await report({ v: 1, phase, failed: true });
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
}
