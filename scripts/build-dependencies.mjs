import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  existsSync,
  writeFileSync,
  readFileSync,
  lstatSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { dependencyRecipeHash, dependencyRoots } from './dependency-input.mjs';

const root = process.cwd();
const source = resolve('.deps/vcpkg');
const windows = process.platform === 'win32';
const triplet = windows ? 'x64-windows-bundled' : 'x64-linux-bundled';
const arguments_ = process.argv.slice(2);
if (
  arguments_.length &&
  (arguments_.length !== 1 || arguments_[0] !== '--clean-local')
)
  throw new Error('Expected optional --clean-local');
const cleanLocal = arguments_.length === 1;
if (
  cleanLocal &&
  (process.versions.node.split('.')[0] !== '24' ||
    !['linux', 'win32'].includes(process.platform))
)
  throw new Error('Use Node 24 on the supported native build platform');
const executable = join(source, windows ? 'vcpkg.exe' : 'vcpkg');
if (cleanLocal && (!existsSync(source) || !existsSync(executable)))
  throw new Error(
    'Prepare the pinned local vcpkg checkout/tool before the offline source rebuild',
  );
if (cleanLocal) mkdirSync(resolve('build'), { recursive: true });
const fixture = cleanLocal
  ? mkdtempSync(resolve('build/dependencies-source-clean-'))
  : undefined;
const output = cleanLocal
  ? join(fixture, 'installed')
  : resolve('.deps/installed');
const work = cleanLocal ? join(fixture, 'work') : resolve('.deps/work');
const downloads = resolve('.tools/vcpkg-downloads');
const cache = resolve('.tools/vcpkg-cache');
for (const directory of [output, work, downloads, cache])
  mkdirSync(directory, { recursive: true });

const env = {
  ...process.env,
  VCPKG_DOWNLOADS: downloads,
  VCPKG_BINARY_SOURCES: cleanLocal ? 'clear' : `clear;files,${cache},readwrite`,
  VCPKG_DISABLE_METRICS: '1',
  VCPKG_ROOT: source,
  ...(cleanLocal ? { VCPKG_MAX_CONCURRENCY: '2' } : {}),
};
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: 'inherit',
    windowsHide: true,
    ...(cleanLocal ? { timeout: 3600000 } : {}),
  });
  if (result.status !== 0)
    throw new Error('Native dependency build failed; inspect the build log');
}
const recipeBefore = cleanLocal ? dependencyRecipeHash() : undefined;
run(process.execPath, [resolve('scripts/fetch-vcpkg.mjs')]);
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
  ...(cleanLocal ? ['--no-downloads', '--binarysource=clear'] : []),
]);
const lock = JSON.parse(readFileSync(resolve('native/dependencies.json')));
let verified;
if (cleanLocal) {
  run(process.execPath, [resolve('scripts/fetch-vcpkg.mjs')]);
  if (dependencyRecipeHash() !== recipeBefore)
    throw new Error('Dependency recipes changed during build');
  const statusPath = join(output, 'vcpkg/status');
  if (lstatSync(statusPath).size > 4194304)
    throw new Error('Dependency status exceeded');
  const status = readFileSync(statusPath, 'utf8').replaceAll('\r\n', '\n');
  const required = dependencyRoots(triplet);
  const packages = status.split('\n\n');
  if (
    !required.every((name) =>
      packages.some(
        (record) =>
          record.startsWith('Package: ' + name + '\n') &&
          record.includes('Architecture: ' + triplet + '\n') &&
          record.includes('Status: install ok installed'),
      ),
    )
  )
    throw new Error(
      'New dependency prefix is missing a required installed root',
    );
  verified = {
    isolatedSourceRebuild: true,
    binaryCache: false,
    sourceDownloadsAllowed: false,
    cachedSourceInputs: true,
    maxConcurrency: 2,
    buildDeadlineMs: 3600000,
    recipeSha256: recipeBefore,
    recipeUnchanged: true,
    statusSha256: createHash('sha256').update(status).digest('hex'),
    installedRecords: packages.filter((record) =>
      record.includes('Status: install ok installed'),
    ).length,
    required,
  };
}
writeFileSync(
  join(output, 'bridge-dependency-build.json'),
  JSON.stringify(
    {
      vcpkgCommit: lock.vcpkg.commit,
      triplet,
      prefix: join(output, triplet),
      ...verified,
    },
    null,
    2,
  ) + '\n',
);
console.log(`Local native prefix: ${join(output, triplet)}`);
