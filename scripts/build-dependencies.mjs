import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = process.cwd();
const source = resolve('.deps/vcpkg');
const windows = process.platform === 'win32';
const triplet = windows ? 'x64-windows-bundled' : 'x64-linux-bundled';
const output = resolve('.deps/installed');
const work = resolve('.deps/work');
const downloads = resolve('.tools/vcpkg-downloads');
const cache = resolve('.tools/vcpkg-cache');
for (const directory of [output, work, downloads, cache])
  mkdirSync(directory, { recursive: true });

const env = {
  ...process.env,
  VCPKG_DOWNLOADS: downloads,
  VCPKG_BINARY_SOURCES: `clear;files,${cache},readwrite`,
  VCPKG_DISABLE_METRICS: '1',
  VCPKG_ROOT: source,
};
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.status !== 0)
    throw new Error('Native dependency build failed; inspect the build log');
}
run(process.execPath, [resolve('scripts/fetch-vcpkg.mjs')]);
const executable = join(source, windows ? 'vcpkg.exe' : 'vcpkg');
if (!existsSync(executable)) {
  if (windows)
    run(
      'cmd.exe',
      ['/d', '/c', 'bootstrap-vcpkg.bat', '-disableMetrics'],
      source,
    );
  else run('sh', ['bootstrap-vcpkg.sh', '-disableMetrics'], source);
}
run(executable, [
  'install',
  `--triplet=${triplet}`,
  `--x-manifest-root=${resolve('native/vcpkg')}`,
  `--overlay-triplets=${resolve('native/vcpkg/triplets')}`,
  `--overlay-ports=${resolve('native/vcpkg/ports')}`,
  `--x-install-root=${output}`,
  `--x-buildtrees-root=${join(work, 'buildtrees')}`,
  `--x-packages-root=${join(work, 'packages')}`,
]);
const lock = JSON.parse(readFileSync(resolve('native/dependencies.json')));
writeFileSync(
  join(output, 'bridge-dependency-build.json'),
  JSON.stringify(
    { vcpkgCommit: lock.vcpkg.commit, triplet, prefix: join(output, triplet) },
    null,
    2,
  ) + '\n',
);
console.log(`Local native prefix: ${join(output, triplet)}`);
