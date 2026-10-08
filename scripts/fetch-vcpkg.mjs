import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lock = JSON.parse(
  readFileSync(new URL('../native/dependencies.json', import.meta.url)),
).vcpkg;
const source = resolve('.deps/vcpkg');
function git(args, cwd) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error('Pinned vcpkg checkout failed');
  return result.stdout.trim();
}
mkdirSync(resolve('.deps'), { recursive: true });
if (!existsSync(source)) {
  git(
    ['clone', '--filter=blob:none', '--no-checkout', lock.repository, source],
    process.cwd(),
  );
  git(['checkout', '--detach', lock.commit], source);
}
if (git(['rev-parse', 'HEAD'], source) !== lock.commit)
  throw new Error('vcpkg commit mismatch');
if (git(['status', '--porcelain'], source))
  throw new Error('vcpkg checkout is modified');
console.log(`Verified vcpkg: ${lock.commit}`);
