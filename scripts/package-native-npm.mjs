import { spawnSync } from 'node:child_process';
import { constants } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  lstat,
  stat,
  realpath,
  opendir,
  open,
  copyFile,
  chmod,
  writeFile,
} from 'node:fs/promises';
import { resolve, relative, join, dirname, isAbsolute, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { productVersion } from './product-version.mjs';
import {
  nativeRuntimePackageName,
  parseNativeRuntimeManifest,
  resolveNativeRuntime,
} from '../packages/node-bridge/dist/native-runtime.js';

const project = fileURLToPath(new URL('..', import.meta.url));
let phase = 'arguments';
function refuse() {
  throw new Error('NATIVE_RUNTIME_PACKAGE_FAILED');
}
const inside = (root, file) => {
  const part = relative(root, file);
  return (
    part && part !== '..' && !part.startsWith('..' + sep) && !isAbsolute(part)
  );
};
async function digest(file, maximum = 67108864) {
  const handle = await open(
    file,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size < 1 || info.size > maximum) refuse();
    const hash = createHash('sha256'),
      buffer = Buffer.alloc(65536);
    let offset = 0;
    while (offset < info.size) {
      const { bytesRead } = await handle.read(
        buffer,
        0,
        Math.min(buffer.length, info.size - offset),
        offset,
      );
      if (!bytesRead) refuse();
      hash.update(buffer.subarray(0, bytesRead));
      offset += bytesRead;
    }
    const after = await handle.stat();
    if (
      after.size !== info.size ||
      after.mtimeMs !== info.mtimeMs ||
      after.ctimeMs !== info.ctimeMs
    )
      refuse();
    return { bytes: info.size, sha256: hash.digest('hex') };
  } finally {
    await handle.close();
  }
}
async function boundedJson(file) {
  const handle = await open(
    file,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size < 1 || info.size > 65536) refuse();
    const buffer = Buffer.alloc(65537);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead !== info.size) refuse();
    return JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'));
  } finally {
    await handle.close();
  }
}
function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: 65536,
    timeout: 120000,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) refuse();
  return result.stdout;
}
async function main() {
  if (
    process.versions.node.split('.')[0] !== '24' ||
    process.arch !== 'x64' ||
    !['linux', 'win32'].includes(process.platform) ||
    resolve('.') !== resolve(project) ||
    process.argv.length !== 3
  )
    refuse();
  const build = await realpath('build');
  phase = 'stage';
  const stage = await realpath(process.argv[2]);
  if (!inside(build, stage)) refuse();
  const dependencies = await boundedJson(
    join(stage, 'share/freerdp-bridge/dependencies.json'),
  );
  if (
    dependencies.freerdp?.version !== '3.32.1' ||
    dependencies.freerdp?.commit !== 'bf217a504e54cc719880c228e82353382cd7d4fa'
  )
    refuse();
  const executable =
    process.platform === 'win32' ? 'rdp-worker.exe' : 'rdp-worker';
  const env = Object.fromEntries(
    ['SystemRoot', 'WINDIR'].flatMap((key) =>
      process.env[key] === undefined ? [] : [[key, process.env[key]]],
    ),
  );
  env.PATH = process.platform === 'win32' ? '' : '/usr/bin:/bin';
  const info = JSON.parse(
    run(join(stage, 'bin', executable), ['--version'], stage, env),
  );
  phase = 'version';
  if (
    info.bridgeVersion !== productVersion ||
    info.freeRdpVersion !== '3.32.1' ||
    info.os !== (process.platform === 'win32' ? 'windows' : 'linux') ||
    info.arch !== 'x64'
  )
    refuse();
  phase = 'source-probe';
  const probe = run(
    join(
      stage,
      'bin',
      process.platform === 'win32'
        ? 'rdp-runtime-check.exe'
        : 'rdp-runtime-check',
    ),
    [],
    stage,
    env,
  );
  if (
    !probe.includes('jpegRoundtrip=true') ||
    !probe.includes('h264Roundtrip=true') ||
    !probe.includes('freerdpAvc420Roundtrip=true') ||
    !probe.includes('opusRoundtrip=true')
  )
    refuse();
  const destination = await mkdtemp(
    join(build, 'npm-native-' + process.platform + '-'),
  );
  phase = 'copy';
  const root = join(destination, 'package');
  await mkdir(join(root, 'runtime'), { recursive: true });
  const files = [];
  let visited = 0,
    total = 0;
  const walk = async (part, depth = 0) => {
    if (++visited > 1024 || depth > 16) refuse();
    const source = join(stage, part),
      canonical = await realpath(source);
    if (!inside(stage, canonical)) refuse();
    const entry = await lstat(source),
      target = await stat(source);
    if (target.isDirectory()) {
      if (entry.isSymbolicLink()) refuse();
      for await (const child of await opendir(source))
        await walk(part + '/' + child.name, depth + 1);
    } else {
      if (
        !target.isFile() ||
        files.length >= 512 ||
        !/^(?:bin|lib|share)\/(?:[A-Za-z0-9_+-][A-Za-z0-9_.+-]*\/){0,15}[A-Za-z0-9_+-][A-Za-z0-9_.+-]*$/.test(
          part,
        )
      )
        refuse();
      const inventory = await digest(canonical);
      if ((total += inventory.bytes) > 268435456) refuse();
      const output = join(root, 'runtime', part);
      await mkdir(dirname(output), { recursive: true });
      await copyFile(canonical, output);
      await chmod(output, target.mode & 0o111 ? 0o755 : 0o644);
      files.push({ path: part, ...inventory });
    }
  };
  for await (const entry of await opendir(stage)) {
    if (!['bin', 'lib', 'share'].includes(entry.name) || !entry.isDirectory())
      refuse();
    await walk(entry.name);
  }
  files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  const metadata = {
    schema: 1,
    productVersion,
    freeRdpVersion: '3.32.1',
    freeRdpCommit: 'bf217a504e54cc719880c228e82353382cd7d4fa',
    platform: process.platform,
    arch: 'x64',
    files,
  };
  phase = 'inventory';
  parseNativeRuntimeManifest(metadata, productVersion, process.platform);
  const name = nativeRuntimePackageName(process.platform);
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify(
      {
        name,
        version: productVersion,
        description: 'Private native runtime for FreeRDP Browser Bridge',
        license: 'SEE LICENSE IN THIRD_PARTY_NOTICES.md',
        os: [process.platform],
        cpu: ['x64'],
        ...(process.platform === 'linux' ? { libc: ['glibc'] } : {}),
        ...(process.platform === 'linux'
          ? {
              bin: {
                'freerdp-bridge-worker': 'runtime/bin/rdp-worker',
                'freerdp-bridge-process-query': 'runtime/bin/rdp-process-query',
                'freerdp-bridge-runtime-check': 'runtime/bin/rdp-runtime-check',
              },
            }
          : {}),
        engines: { node: '>=24 <25' },
        exports: { './package.json': './package.json' },
        files: [
          'runtime',
          'runtime-manifest.json',
          'LICENSE',
          'THIRD_PARTY_NOTICES.md',
        ],
        publishConfig: {
          access: 'public',
          registry: 'https://registry.npmjs.org/',
        },
      },
      null,
      2,
    ) + '\n',
  );
  await writeFile(
    join(root, 'runtime-manifest.json'),
    JSON.stringify(metadata, null, 2) + '\n',
  );
  await copyFile('LICENSE', join(root, 'LICENSE'));
  await writeFile(
    join(root, 'THIRD_PARTY_NOTICES.md'),
    '# Native runtime notices\n\nProject-owned bridge code uses MIT (LICENSE). Bundled FreeRDP and native dependencies retain their own terms. Read every document under runtime/share/freerdp-bridge/licenses/ and the accompanying runtime/share/freerdp-bridge/sbom/vcpkg/ metadata before redistribution. The runtime manifest records integrity/compatibility, not a publisher signature. This package includes no Node.js executable and runs no installation scripts.\n',
  );
  phase = 'verify';
  await resolveNativeRuntime({
    packageDirectory: root,
    runtimeRoot: join(destination, 'unused-private-runtime'),
  });
  // Verify the flattened npm payload's relocation, with no library-path override.
  phase = 'relocation';
  const relocated = join(root, 'runtime');
  const output = run(
    join(
      relocated,
      'bin',
      process.platform === 'win32'
        ? 'rdp-runtime-check.exe'
        : 'rdp-runtime-check',
    ),
    [],
    relocated,
    env,
  );
  const fields = new Map(
    output
      .trim()
      .split('\n')
      .map((line) => {
        const at = line.indexOf('=');
        return [line.slice(0, at), line.slice(at + 1).trim()];
      }),
  );
  for (const key of [
    'jpegRoundtrip',
    'h264Roundtrip',
    'freerdpAvc420Roundtrip',
    'opusRoundtrip',
  ])
    if (fields.get(key) !== 'true') refuse();
  for (const key of [
    'runtime',
    'freerdpRuntime',
    'jpegRuntime',
    'openh264Runtime',
    'opusRuntime',
    ...(process.platform === 'linux' ? ['udevRuntime'] : []),
  ]) {
    const file = fields.get(key);
    if (
      typeof file !== 'string' ||
      !inside(await realpath(relocated), await realpath(file))
    )
      refuse();
  }
  phase = 'pack';
  const archives = join(destination, 'archives');
  await mkdir(archives);
  if (process.platform === 'win32')
    run(
      process.execPath,
      [
        resolve('.tools/node_modules/pnpm/bin/pnpm.cjs'),
        'pack',
        '--pack-destination',
        archives,
      ],
      root,
    );
  else run('pnpm', ['pack', '--pack-destination', archives], root);
  const archive = join(
    archives,
    name.replace('@', '').replace('/', '-') + '-' + productVersion + '.tgz',
  );
  const receipt = {
    schema: 1,
    name,
    version: productVersion,
    platform: process.platform,
    files: files.length,
    unpackedBytes: total,
    sourceStage: relative(project, stage).replaceAll('\\', '/'),
    packageDirectory: relative(project, root).replaceAll('\\', '/'),
    archive: relative(project, archive).replaceAll('\\', '/'),
    ...(await digest(archive, 128 * 1024 * 1024)),
    published: false,
  };
  await writeFile(
    join(destination, 'receipt.json'),
    JSON.stringify(receipt, null, 2) + '\n',
  );
  console.log(JSON.stringify(receipt));
}
await main().catch(() => {
  console.error(
    JSON.stringify({ code: 'NATIVE_RUNTIME_PACKAGE_FAILED', phase }),
  );
  process.exitCode = 1;
});
