import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, lstat, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const invalid = () => new Error('STANDALONE_PAYLOAD_INVALID');

export async function readStandalonePayloadFile(path, maximum) {
  if (!Number.isSafeInteger(maximum) || maximum < 0 || maximum > 536870912)
    throw invalid();
  const initial = await lstat(path);
  if (!initial.isFile() || initial.isSymbolicLink()) throw invalid();
  const file = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const info = await file.stat();
    if (
      !info.isFile() ||
      info.size < 0 ||
      info.size > maximum ||
      info.dev !== initial.dev ||
      info.ino !== initial.ino
    )
      throw invalid();
    const bytes = Buffer.alloc(info.size + 1);
    let position = 0;
    while (position < bytes.length) {
      const result = await file.read(
        bytes,
        position,
        bytes.length - position,
        position,
      );
      if (result.bytesRead === 0) break;
      position += result.bytesRead;
    }
    if (position !== info.size) throw invalid();
    return bytes.subarray(0, position);
  } finally {
    await file.close();
  }
}

/** Inventory a staging tree without following links or reading special files. */
export async function standalonePayloadInventory(
  root,
  { omitNpmBins = false } = {},
) {
  const files = [];
  let total = 0,
    entries = 0;
  async function visit(directory, depth) {
    if (depth > 32) throw invalid();
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw invalid();
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (++entries > 20000) throw invalid();
      const path = join(directory, entry.name);
      if (
        omitNpmBins &&
        relative(root, path).split(sep).join('/') ===
          'service/node_modules/.bin'
      ) {
        if (!entry.isDirectory()) throw invalid();
        continue;
      }
      if (entry.isDirectory()) await visit(path, depth + 1);
      else {
        if (!entry.isFile() || files.length >= 10000) throw invalid();
        const info = await lstat(path);
        if (
          !info.isFile() ||
          info.isSymbolicLink() ||
          info.size > 536870912 ||
          (total += info.size) > 1073741824
        )
          throw invalid();
        const file = await open(
          path,
          constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        );
        let bytes = 0;
        const hash = createHash('sha256');
        try {
          const chunk = Buffer.alloc(65536);
          for (;;) {
            const { bytesRead } = await file.read(chunk, 0, chunk.length, null);
            if (!bytesRead) break;
            if ((bytes += bytesRead) > info.size) throw invalid();
            hash.update(chunk.subarray(0, bytesRead));
          }
          if (bytes !== info.size) throw invalid();
        } finally {
          await file.close();
        }
        files.push({
          path: relative(root, path).split(sep).join('/'),
          bytes,
          sha256: hash.digest('hex'),
        });
      }
    }
  }
  await visit(root, 0);
  return files.sort((left, right) => left.path.localeCompare(right.path, 'en'));
}
