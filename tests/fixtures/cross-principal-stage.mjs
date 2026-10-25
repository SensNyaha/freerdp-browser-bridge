// Stage only declared public compiled inputs, never a checkout/home directory.
import {
  mkdir,
  lstat,
  readdir,
  copyFile,
  chmod,
  realpath,
} from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export async function stageLinuxIsolationActor(stage, binaryDir) {
  let files = 0;
  let bytes = 0;
  async function copy(source, target, depth = 0) {
    if (++files > 4096 || depth > 16) throw new Error('ISOLATION_INPUT_BOUND');
    const info = await lstat(source);
    if (info.isSymbolicLink()) throw new Error('ISOLATION_INPUT_LINK');
    if (info.isDirectory()) {
      await mkdir(target, { recursive: true, mode: 0o755 });
      for (const entry of await readdir(source))
        await copy(join(source, entry), join(target, entry), depth + 1);
    } else if (
      info.isFile() &&
      info.size <= 134217728 &&
      (bytes += info.size) <= 536870912
    ) {
      await mkdir(dirname(target), { recursive: true, mode: 0o755 });
      await copyFile(source, target);
      await chmod(target, info.mode & 0o111 ? 0o755 : 0o644);
    } else throw new Error('ISOLATION_INPUT_BOUND');
  }
  const source = join(stage, 'source');
  const owner = 'tests/fixtures/cross-principal-owner.mjs';
  await copy(join(project, owner), join(source, owner));
  for (const [from, to] of [
    ['packages/node-bridge', 'packages/node-bridge'],
    ['packages/protocol', 'node_modules/@freerdp-bridge/protocol'],
    ['packages/config', 'node_modules/@freerdp-bridge/config'],
  ]) {
    for (const entry of ['package.json', 'dist'])
      await copy(join(project, from, entry), join(source, to, entry));
  }
  const typebox = await realpath(
    join(project, 'packages/config/node_modules/@sinclair/typebox'),
  );
  for (const entry of ['package.json', 'build'])
    await copy(
      join(typebox, entry),
      join(source, 'node_modules/@sinclair/typebox', entry),
    );
  const stagedBin = join(stage, 'bin');
  for (const name of [
    'rdp-worker',
    'rdp-runtime-recovery',
    'rdp-worker.runtime.json',
    'rdp-process-query',
    'fixture-cross-principal',
    'rdp-ipc.node',
    'rdp-worker.ipc.json',
  ]) {
    try {
      await copy(join(binaryDir, name), join(stagedBin, name));
    } catch (error) {
      if (
        error.code !== 'ENOENT' ||
        !['rdp-ipc.node', 'rdp-worker.ipc.json'].includes(name)
      )
        throw error;
    }
  }
  const executable = join(stagedBin, 'node');
  await copy(process.execPath, executable);
  return { binaryDir: stagedBin, fixture: join(source, owner), executable };
}
