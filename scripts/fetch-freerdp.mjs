import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lock = JSON.parse(
  readFileSync(new URL('../native/dependencies.json', import.meta.url)),
).freerdp;
const source = resolve('.deps/FreeRDP');
function git(args, cwd) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error('Pinned dependency checkout failed');
  return result.stdout.trim();
}
mkdirSync(resolve('.deps'), { recursive: true });
if (!existsSync(source))
  git(
    [
      'clone',
      '--depth',
      '1',
      '--branch',
      lock.version,
      lock.repository,
      source,
    ],
    process.cwd(),
  );
if (git(['rev-parse', 'HEAD'], source) !== lock.commit)
  throw new Error('FreeRDP commit mismatch');
if (git(['status', '--porcelain'], source))
  throw new Error('FreeRDP checkout is modified');
console.log(`Verified FreeRDP ${lock.version}: ${lock.commit}`);
