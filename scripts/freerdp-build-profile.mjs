/** SDK Debug builds are always isolated; existing SDK tasks remain Release. */
export function freerdpBuildProfile(args) {
  if (
    !Array.isArray(args) ||
    args.length > 2 ||
    (args.length && !['--clean-local', '--clean-debug'].includes(args[0]))
  )
    throw new Error(
      'Expected optional --clean-local/--clean-debug and completed dependency receipt',
    );
  return {
    cleanLocal: args.length > 0,
    buildType: args[0] === '--clean-debug' ? 'Debug' : 'Release',
    dependencyReceiptPath: args[1],
  };
}
