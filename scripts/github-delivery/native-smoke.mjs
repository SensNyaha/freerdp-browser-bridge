import {
  mkdir,
  mkdtemp,
  copyFile,
  readFile,
  writeFile,
  lstat,
  realpath,
  symlink,
} from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  readJson,
  parseManifest,
  safePath,
  verifyArchives,
  verifySources,
  fail,
} from './manifest.mjs';
import { assetDirectory } from './fetch.mjs';

let phase = 'inputs';
try {
  if (
    process.argv.length !== 2 ||
    !['win32', 'linux'].includes(process.platform) ||
    process.arch !== 'x64' ||
    process.versions.node.split('.')[0] !== '24'
  )
    fail('DELIVERY_NATIVE_PLATFORM_UNSUPPORTED');
  const root = resolve('.'),
    manifest = parseManifest(await readJson(root, '.delivery/release.json'));
  if (manifest.kind !== 'core') fail('DELIVERY_NATIVE_CORE_REQUIRED');
  await verifySources(root, manifest);
  const assets = await assetDirectory(root);
  await verifyArchives(assets, manifest);
  const suffix = process.platform === 'win32' ? 'win32-x64' : 'linux-x64-gnu';
  const item = manifest.packages.find(
    (item) => item.name === '@freerdp-bridge/runtime-' + suffix,
  );
  if (!item) fail('DELIVERY_NATIVE_PACKAGE_MISSING');
  const archive = join(assets, item.archive);
  const tool = (command, args, maximum = 4 * 1024 * 1024) => {
    const result = spawnSync(command, args, {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 90000,
      maxBuffer: maximum,
    });
    if (result.error || result.status !== 0)
      fail('DELIVERY_NATIVE_SMOKE_FAILED');
    return result.stdout;
  };
  phase = 'native-packlist';
  const paths = tool('tar', ['-tf', archive]).trim().split(/\r?\n/);
  const types = tool('tar', ['-tvf', archive]).trim().split(/\r?\n/);
  if (
    paths.length > 4096 ||
    types.length > 4096 ||
    types.some((line) => !/^[-d]/.test(line))
  )
    fail('DELIVERY_NATIVE_PACKLIST_INVALID');
  for (const path of paths) {
    const name = path.endsWith('/') ? path.slice(0, -1) : path;
    safePath(name);
    if (name !== 'package' && !name.startsWith('package/'))
      fail('DELIVERY_NATIVE_PACKLIST_INVALID');
  }
  const scratch = await mkdtemp(join(dirname(assets), 'native-smoke-'));
  phase = 'native-extraction';
  tool('tar', ['-xf', archive, '-C', scratch]);
  const scope = join(root, 'node_modules/@freerdp-bridge');
  await mkdir(scope, { recursive: true });
  const link = async (name, destination) => {
    const path = join(scope, name),
      target = await realpath(destination);
    try {
      await lstat(path);
      if ((await realpath(path)) !== target)
        fail('DELIVERY_NATIVE_ALIAS_CONFLICT');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await symlink(
        target,
        path,
        process.platform === 'win32' ? 'junction' : 'dir',
      );
    }
  };
  for (const [name, directory] of [
    ['protocol', 'packages/protocol'],
    ['config', 'packages/config'],
    ['node', 'packages/node-bridge'],
    ['api', 'apps/bridge-api'],
    ['fastify', 'packages/fastify'],
  ])
    await link(name, join(root, directory));
  await link('runtime-' + suffix, join(scratch, 'package'));
  // This case checks the source workspace with its accepted native archive.
  // pnpm intentionally does not hoist API-owned host dependencies to root.
  let fixture = await readFile(
    'tests/fixtures/fastify-package-consumer.mjs',
    'utf8',
  );
  if (
    !fixture.includes("import Fastify from 'fastify';") ||
    !fixture.includes("import { WebSocket, WebSocketServer } from 'ws';")
  )
    fail('DELIVERY_NATIVE_FIXTURE_INVALID');
  fixture = fixture
    .replace(
      "import Fastify from 'fastify';",
      "import { createRequire } from 'node:module';\nconst hostRequire = createRequire(import.meta.resolve('@freerdp-bridge/api/fastify'));\nconst Fastify = hostRequire('fastify');",
    )
    .replace(
      "import { WebSocket, WebSocketServer } from 'ws';",
      "const { WebSocket, WebSocketServer } = hostRequire('ws');",
    );
  await writeFile(join(scratch, 'consumer.mjs'), fixture);
  await copyFile(
    'tests/fixtures/rdp-tls.mjs',
    join(scratch, 'tls-fixture.mjs'),
  );
  await copyFile(
    'tests/fixtures/browser-port.mjs',
    join(scratch, 'browser-port.mjs'),
  );
  phase = 'source-native-consumer';
  tool(process.execPath, [join(scratch, 'consumer.mjs'), '--package-runtime']);
  phase = 'final-source-verification';
  await verifySources(root, manifest);
  console.log(
    JSON.stringify({
      phase,
      version: manifest.version,
      platform: process.platform,
      sourceWorkspaceAndAcceptedNative: true,
      nativeTlsAndLifecycle: true,
      actualRdpDesktop: false,
      published: false,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      code: /^[A-Z][A-Z0-9_]{1,63}$/.test(error?.code ?? '')
        ? error.code
        : 'DELIVERY_NATIVE_SMOKE_FAILED',
      phase,
    }),
  );
  process.exitCode = 1;
}
