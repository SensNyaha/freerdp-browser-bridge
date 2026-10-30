import { realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareNativePackageSources } from './native-source-download.mjs';

try {
  const project = await realpath(fileURLToPath(new URL('..', import.meta.url)));
  const build = await realpath(resolve('build'));
  if (
    process.argv.length !== 3 ||
    (await realpath('.')) !== project ||
    process.versions.node.split('.')[0] !== '24' ||
    !['win32', 'linux'].includes(process.platform)
  )
    throw new Error();
  const stage = await realpath(process.argv[2]);
  if (!stage.startsWith(build + sep)) throw new Error();
  const sources = await prepareNativePackageSources({
    project,
    stage,
    platform: process.platform,
  });
  console.log(
    JSON.stringify({
      nativeSourceArchives: sources,
      extracted: false,
      executed: false,
    }),
  );
} catch {
  console.error(JSON.stringify({ code: 'NATIVE_SOURCE_PREPARATION_FAILED' }));
  process.exitCode = 1;
}
