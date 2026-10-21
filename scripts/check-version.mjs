import { lstat, readFile, opendir } from 'node:fs/promises';
import { join } from 'node:path';

// Product release versions are independent of protocol and dependency versions.
const stable = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
if (process.argv.length > 3) throw new Error('VERSION_USAGE');
async function text(path, maximum = 65536) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > maximum)
    throw new Error('VERSION_FILE_INVALID');
  return (await readFile(path, 'utf8')).replace(/^\uFEFF/, '');
}
const root = JSON.parse(await text('package.json'));
const version = root.version;
if (typeof version !== 'string' || version.length > 32 || !stable.test(version))
  throw new Error('VERSION_STABLE_REQUIRED');
if (process.argv[2] !== undefined && process.argv[2] !== version)
  throw new Error('VERSION_EXPECTED_MISMATCH');
let manifests = 1;
for (const parent of ['packages', 'apps']) {
  let entries = 0;
  for await (const entry of await opendir(parent)) {
    if (++entries > 128) throw new Error('VERSION_WORKSPACE_LIMIT');
    if (entry.isSymbolicLink()) throw new Error('VERSION_WORKSPACE_LINK');
    if (!entry.isDirectory()) continue;
    let contents;
    try {
      contents = await text(join(parent, entry.name, 'package.json'));
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (JSON.parse(contents).version !== version)
      throw new Error('VERSION_MANIFEST_MISMATCH');
    ++manifests;
  }
}
const cmake = await text('CMakeLists.txt', 1048576);
const nativeVersion = cmake.match(
  /project\([^)]*\bVERSION[ \t]+([0-9]+\.[0-9]+\.[0-9]+)[ \t)]/,
)?.[1];
if (nativeVersion !== version) throw new Error('VERSION_NATIVE_MISMATCH');
console.log(
  JSON.stringify({ productVersion: version, nativeVersion, manifests }),
);
