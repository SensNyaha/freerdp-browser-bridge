import { dirname, isAbsolute } from 'node:path';
import { lstat, readdir, realpath, statfs } from 'node:fs/promises';

// Read-only admission. Never turn an ordinary host filesystem into a full-disk
// fixture, repair permissions, create a mount or delete an existing entry.
export async function disposableLinuxFullRoot(root) {
  const refused = () => {
    throw Object.assign(new Error('DISPOSABLE_FULL_ROOT_REFUSED'), {
      code: 'DISPOSABLE_FULL_ROOT_REFUSED',
    });
  };
  if (
    process.platform !== 'linux' ||
    typeof root !== 'string' ||
    root.length > 4096 ||
    !isAbsolute(root)
  )
    refused();
  if ((await realpath(root)) !== root) refused();
  const info = await lstat(root);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    info.uid !== process.getuid() ||
    (info.mode & 0o777) !== 0o700
  )
    refused();
  // An empty subdirectory is insufficient: filling it would also exhaust any
  // sibling using that filesystem. Require the dedicated mount boundary.
  if (info.dev === (await lstat(dirname(root))).dev) refused();
  const fs = await statfs(root);
  const mountedBytes = fs.bsize * fs.blocks;
  if (
    fs.type !== 0x01021994 ||
    !Number.isSafeInteger(mountedBytes) ||
    mountedBytes < 131072 ||
    mountedBytes > 1048576 ||
    fs.bavail * fs.bsize < mountedBytes - 65536 ||
    fs.ffree < 64 ||
    (await readdir(root)).length !== 0
  )
    refused();
  return { mountedBytes, blockBytes: fs.bsize };
}
