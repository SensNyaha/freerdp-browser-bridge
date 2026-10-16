import { win32 } from 'node:path';

// CMake's cached alias paths are relative to its recorded output tree. The
// current output tree may be reached through a different drive/path afterward.
export function rebaseWindowsBuildPath(
  actualBuild,
  cachedBuild,
  configuredPath,
) {
  return win32.resolve(
    actualBuild,
    win32.relative(cachedBuild, configuredPath),
  );
}
