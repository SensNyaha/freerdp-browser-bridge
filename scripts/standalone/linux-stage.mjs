import { cp, mkdir, copyFile, chmod, lstat, opendir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  standalonePayloadInventory,
  readStandalonePayloadFile,
} from './payload.mjs';

/** Program content is public code, installed root-owned for a separate service UID.
 * A private checkout/umask must not make JS, licenses or native helpers unreadable.
 * Never apply these modes to configuration or runtime; those live outside program.
 */
async function programModes(root) {
  let entries = 0;
  async function visit(path, depth) {
    if (depth > 32 || ++entries > 20000)
      throw new Error('STANDALONE_LINUX_PROGRAM_MODES_INVALID');
    const info = await lstat(path);
    if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile()))
      throw new Error('STANDALONE_LINUX_PROGRAM_MODES_INVALID');
    if (info.isDirectory()) {
      await chmod(path, 0o755);
      for await (const entry of await opendir(path))
        await visit(join(path, entry.name), depth + 1);
    } else await chmod(path, info.mode & 0o111 ? 0o755 : 0o644);
  }
  await visit(root, 0);
}

/** Shared program/config/unit staging for DEB and RPM; no installation scripts. */
export async function stageStandaloneLinux(
  source,
  root,
  repository,
  { unitRoot = 'lib' } = {},
) {
  if (!['lib', 'usr/lib'].includes(unitRoot))
    throw new Error('STANDALONE_LINUX_UNIT_ROOT_INVALID');
  const manifest = JSON.parse(
    (
      await readStandalonePayloadFile(
        join(source, 'service/package.json'),
        65536,
      )
    ).toString('utf8'),
  );
  const native = JSON.parse(
    (
      await readStandalonePayloadFile(
        join(
          source,
          'service/node_modules/@freerdp-bridge/runtime-linux-x64-gnu/package.json',
        ),
        65536,
      )
    ).toString('utf8'),
  );
  if (
    manifest.name !== '@freerdp-bridge/standalone' ||
    manifest.private !== true ||
    !/^0\.[0-9]+\.[0-9]+$/.test(manifest.version) ||
    native.version !== manifest.version ||
    manifest.dependencies?.['@freerdp-bridge/api'] !== manifest.version ||
    manifest.dependencies?.['@freerdp-bridge/runtime-linux-x64-gnu'] !==
      manifest.version
  )
    throw new Error('STANDALONE_LINUX_VERSION_MISMATCH');
  const inventory = await standalonePayloadInventory(source, {
    omitNpmBins: true,
  });
  await mkdir(root);
  const program = join(root, 'opt/freerdp-bridge');
  await mkdir(program, { recursive: true });
  for (const name of ['node', 'service'])
    await cp(join(source, name), join(program, name), {
      recursive: true,
      errorOnExist: true,
      filter: (path) => path !== join(source, 'service/node_modules/.bin'),
    });
  await copyFile(join(repository, 'LICENSE'), join(program, 'LICENSE'));
  await copyFile(
    join(repository, 'packaging/standalone/THIRD_PARTY.md'),
    join(program, 'THIRD_PARTY.md'),
  );
  await programModes(program);
  const configDirectory = join(root, 'etc/freerdp-bridge');
  await mkdir(configDirectory, { recursive: true, mode: 0o750 });
  await copyFile(
    join(repository, 'packaging/standalone/bridge.example.json'),
    join(configDirectory, 'bridge.json'),
  );
  await chmod(join(configDirectory, 'bridge.json'), 0o640);
  const unitDirectory = join(root, unitRoot, 'systemd/system');
  await mkdir(unitDirectory, { recursive: true });
  await copyFile(
    join(repository, 'packaging/standalone/linux/freerdp-bridge.service'),
    join(unitDirectory, 'freerdp-bridge.service'),
  );
  await chmod(join(program, 'node/node'), 0o755);
  return { version: manifest.version, inputFiles: inventory.length };
}
