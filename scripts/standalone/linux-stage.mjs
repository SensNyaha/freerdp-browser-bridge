import { cp, mkdir, copyFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import {
  standalonePayloadInventory,
  readStandalonePayloadFile,
} from './payload.mjs';

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
