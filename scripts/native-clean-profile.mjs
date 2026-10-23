/** Explicit source-consumer profiles; existing linked builds stay Release. */
export function nativeCleanProfile(mode) {
  switch (mode) {
    case 'foundation':
      return { linked: false, buildType: 'Debug', receiptRequired: false };
    case 'linked':
      return { linked: true, buildType: 'Release', receiptRequired: false };
    case 'linked-debug':
      return { linked: true, buildType: 'Debug', receiptRequired: true };
    default:
      throw new Error('Unsupported clean native build profile');
  }
}

/** Caller-owned SDK allocations require the same dynamic CRT on both sides. */
export function requireWindowsSdkCrt(receipt, cache, buildType) {
  if (!['Debug', 'Release'].includes(buildType))
    throw new Error('Unsupported consumer CRT configuration');
  const value = (key) => {
    const lines = cache
      .split(/\r?\n/)
      .filter((line) => line.startsWith(key + ':'));
    return lines.length === 1
      ? lines[0].slice(lines[0].indexOf('=') + 1)
      : undefined;
  };
  if (
    (receipt.buildType !== buildType &&
      !(buildType === 'Release' && receipt.buildType === undefined)) ||
    value('CMAKE_BUILD_TYPE') !== buildType ||
    ![
      buildType === 'Debug' ? 'MultiThreadedDebugDLL' : 'MultiThreadedDLL',
      'MultiThreaded$<$<CONFIG:Debug>:Debug>DLL',
    ].includes(value('CMAKE_MSVC_RUNTIME_LIBRARY'))
  )
    throw new Error(
      `Windows linked ${buildType} requires a matching ${buildType} CRT SDK`,
    );
}

export function requireWindowsDebugSdk(receipt, cache) {
  requireWindowsSdkCrt(receipt, cache, 'Debug');
}
