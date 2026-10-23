import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(fileURLToPath(new URL('..', import.meta.url)));

export function dependencyRecipeHash() {
  const hash = createHash('sha256');
  let count = 0,
    total = 0;
  const inspect = (name, depth = 0) => {
    if (++count > 1024 || depth > 16)
      throw new Error('Dependency recipe count exceeded');
    const path = resolve(project, name),
      info = lstatSync(path);
    if (info.isSymbolicLink())
      throw new Error('Unexpected dependency recipe link');
    if (info.isDirectory()) {
      for (const child of readdirSync(path).sort())
        inspect(name + '/' + child, depth + 1);
    } else if (
      info.isFile() &&
      info.size <= 1048576 &&
      (total += info.size) <= 16777216
    ) {
      const bytes = readFileSync(path);
      hash.update(name + '\0' + bytes.length + '\0').update(bytes);
    } else throw new Error('Dependency recipe size or object refused');
  };
  inspect('native/dependencies.json');
  inspect('native/vcpkg');
  return hash.digest('hex');
}

export function dependencyRoots(triplet) {
  if (!['x64-linux-bundled', 'x64-windows-bundled'].includes(triplet))
    throw new Error('Unsupported dependency triplet');
  return [
    'zlib',
    'openssl',
    'libusb',
    'libjpeg-turbo',
    'openh264',
    'opus',
    ...(triplet === 'x64-linux-bundled'
      ? ['krb5', 'icu', 'cups', 'libfuse']
      : []),
  ];
}

export function readDependencyReceipt(input, triplet) {
  const path = resolve(input),
    installedRoot = dirname(path);
  if (
    !path.startsWith(resolve(project, 'build') + sep) ||
    basename(path) !== 'bridge-dependency-build.json' ||
    basename(installedRoot) !== 'installed' ||
    !/^dependencies-source-clean-[A-Za-z0-9_-]+$/.test(
      basename(dirname(installedRoot)),
    )
  )
    throw new Error('Dependency receipt is outside an isolated build prefix');
  const bounded = (name, maximum) => {
    const info = lstatSync(name);
    if (!info.isFile() || info.isSymbolicLink() || info.size > maximum)
      throw new Error(
        'Dependency receipt input exceeded or has an invalid object type',
      );
    return readFileSync(name);
  };
  const bytes = bounded(path, 65536);
  let receipt;
  try {
    receipt = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('Invalid dependency build receipt');
  }
  const lock = JSON.parse(
    readFileSync(resolve(project, 'native/dependencies.json'), 'utf8'),
  );
  const prefix = resolve(installedRoot, triplet);
  if (
    receipt?.vcpkgCommit !== lock.vcpkg.commit ||
    receipt.triplet !== triplet ||
    receipt.prefix !== prefix ||
    receipt.isolatedSourceRebuild !== true ||
    receipt.binaryCache !== false ||
    receipt.sourceDownloadsAllowed !== false ||
    receipt.cachedSourceInputs !== true ||
    receipt.maxConcurrency !== 2 ||
    receipt.buildDeadlineMs !== 3600000 ||
    receipt.recipeUnchanged !== true ||
    receipt.recipeSha256 !== dependencyRecipeHash() ||
    JSON.stringify(receipt.required) !==
      JSON.stringify(dependencyRoots(triplet))
  )
    throw new Error(
      'Dependency build provenance does not match the isolated pinned profile',
    );
  const status = bounded(resolve(installedRoot, 'vcpkg/status'), 4194304)
    .toString('utf8')
    .replaceAll('\r\n', '\n');
  if (
    createHash('sha256').update(status).digest('hex') !==
      receipt.statusSha256 ||
    status
      .split('\n\n')
      .filter((record) => record.includes('Status: install ok installed'))
      .length !== receipt.installedRecords
  )
    throw new Error('Dependency installed status does not match its receipt');
  return {
    prefix,
    installedRoot,
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}
