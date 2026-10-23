import { resolve } from 'node:path';
import { readStandaloneReleaseReceipts } from './release-artifacts.mjs';
if (process.argv.length !== 3)
  throw new Error('STANDALONE_RELEASE_VERIFY_USAGE');
const manifest = await readStandaloneReleaseReceipts(resolve(process.argv[2]));
console.log(
  JSON.stringify({
    version: manifest.version,
    sourceCommit: manifest.sourceCommit,
    files: manifest.files.length,
    platforms: manifest.acceptance,
  }),
);
