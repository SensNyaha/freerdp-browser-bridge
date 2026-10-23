import { realpathSync } from 'node:fs';

// pnpm junctions resolve to physical Windows paths. Loading other workspace
// modules through a subst drive can otherwise create a second ESM instance.
export function nodeTestDirectories(project, binary) {
  return process.platform === 'win32'
    ? {
        project: realpathSync.native(project),
        binary: realpathSync.native(binary),
      }
    : { project, binary };
}
