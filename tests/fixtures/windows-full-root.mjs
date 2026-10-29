import { dirname, basename, parse, isAbsolute } from 'node:path';
import { lstat, readFile, realpath, statfs } from 'node:fs/promises';

function refuse() {
  throw Object.assign(new Error('OWNED_WINDOWS_FULL_ROOT_REFUSED'), {
    code: 'OWNED_WINDOWS_FULL_ROOT_REFUSED',
  });
}

export function windowsFullProof(proof, root, coordinatorPid) {
  if (
    !proof ||
    typeof proof !== 'object' ||
    Array.isArray(proof) ||
    Object.keys(proof).sort().join(',') !==
      'coordinatorPid,diskBytes,imageSha256,kind,root,schema,volumeGuid' ||
    proof.schema !== 1 ||
    proof.kind !== 'owned-windows-vhd-full' ||
    proof.coordinatorPid !== coordinatorPid ||
    proof.root !== root ||
    !/^[A-Za-z]:\\bridge-owned-full-[0-9a-f]{32}$/.test(root) ||
    proof.diskBytes !== 16777216 ||
    !/^[0-9a-f]{64}$/.test(proof.imageSha256) ||
    !/^\\\\\?\\Volume\{[0-9a-f-]{36}\}\\$/i.test(proof.volumeGuid)
  )
    refuse();
  return proof;
}

// Only the parent-owned, bounded VHD coordinator may enable the Windows test.
// The coordinator checks image hashes and actual disk/partition/volume identity.
// This reader never mounts, formats, changes permissions or creates files.
export async function windowsFullRoot(root, proofPath) {
  if (
    process.platform !== 'win32' ||
    typeof root !== 'string' ||
    typeof proofPath !== 'string' ||
    !isAbsolute(root) ||
    !isAbsolute(proofPath)
  )
    refuse();
  if (
    root !== (await realpath(root)) ||
    proofPath !== (await realpath(proofPath))
  )
    refuse();
  const file = await lstat(proofPath),
    directory = await lstat(root);
  if (
    !file.isFile() ||
    file.isSymbolicLink() ||
    file.nlink !== 1 ||
    file.size < 1 ||
    file.size > 8192 ||
    !directory.isDirectory() ||
    directory.isSymbolicLink() ||
    dirname(root) !== parse(root).root ||
    !/^bridge-owned-full-[0-9a-f]{32}$/.test(basename(root))
  )
    refuse();
  const proof = JSON.parse(
    new TextDecoder('utf8', { fatal: true }).decode(await readFile(proofPath)),
  );
  windowsFullProof(proof, root, process.ppid);
  const fs = await statfs(root),
    mountedBytes = fs.bsize * fs.blocks;
  if (
    !Number.isSafeInteger(mountedBytes) ||
    mountedBytes < 8388608 ||
    mountedBytes > 16777216 ||
    fs.bavail * fs.bsize < 8388608
  )
    refuse();
  return { mountedBytes, freeBytes: fs.bavail * fs.bsize };
}
