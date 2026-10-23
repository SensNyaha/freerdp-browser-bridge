import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { resolve } from 'node:path';

/** Bind new source-consumer outputs; retain the existing linked inventory. */
export async function nativeCleanArtifactHashes(
  binary,
  linked,
  platform = process.platform,
) {
  if (typeof linked !== 'boolean' || !['win32', 'linux'].includes(platform))
    throw new Error('Unsupported native artifact profile');
  const names =
    platform === 'win32'
      ? ['rdp-worker.exe', 'rdp-runtime-directory.exe']
      : linked
        ? ['rdp-worker', 'rdp-ipc.node', 'rdp-worker.ipc.json']
        : ['rdp-worker', 'rdp-process-query'];
  const artifacts = {};
  for (const name of names) {
    const hash = createHash('sha256');
    let bytes = 0;
    for await (const chunk of createReadStream(resolve(binary, name))) {
      if ((bytes += chunk.length) > 67108864)
        throw new Error('Build artifact exceeded');
      hash.update(chunk);
    }
    artifacts[name] = hash.digest('hex');
  }
  return artifacts;
}
