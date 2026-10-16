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

export function windowsFreeRdpBuildPath(
  actualBuild,
  cachedBuild,
  configuredPrefix,
) {
  const prefix = rebaseWindowsBuildPath(
    actualBuild,
    cachedBuild,
    configuredPrefix,
  );
  const parent = win32.dirname(prefix);
  if (
    win32.basename(prefix).toLowerCase() === 'installed' &&
    /^freerdp-source-clean-[a-z0-9_-]+$/i.test(win32.basename(parent))
  )
    return win32.join(parent, 'out');
  if (
    win32.basename(prefix).toLowerCase() === 'freerdp-install' &&
    win32.basename(parent).toLowerCase() === '.deps'
  )
    return win32.resolve(parent, '../build/freerdp-local');
  throw new Error(
    'Unsupported FreeRDP SDK build layout for dependency tracking',
  );
}
