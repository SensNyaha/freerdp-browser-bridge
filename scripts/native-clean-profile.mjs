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

/** A Debug CRT consumer cannot free SDK allocations from a Release CRT. */
export function requireWindowsDebugSdk(receipt, cache) {
  const value = (key) => {
    const lines = cache
      .split(/\r?\n/)
      .filter((line) => line.startsWith(key + ':'));
    return lines.length === 1
      ? lines[0].slice(lines[0].indexOf('=') + 1)
      : undefined;
  };
  if (
    receipt.buildType !== 'Debug' ||
    value('CMAKE_BUILD_TYPE') !== 'Debug' ||
    ![
      'MultiThreadedDebugDLL',
      'MultiThreaded$<$<CONFIG:Debug>:Debug>DLL',
    ].includes(value('CMAKE_MSVC_RUNTIME_LIBRARY'))
  )
    throw new Error('Windows linked Debug requires a matching Debug CRT SDK');
}
