import { opendir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  checkNpmDirectoryReadme,
  checkNpmArchiveReadme,
  readNpmDocumentation,
  validateNpmReadme,
} from './npm-readme.mjs';

const args = process.argv.slice(2);
const receipts = [];
if (args[0] === '--archives' && args.length > 1 && args.length <= 33) {
  for (const archive of args.slice(1))
    receipts.push(await checkNpmArchiveReadme(archive));
} else if (args.length === 0) {
  // Discover new adapters too: a fixed package list would miss future releases.
  for (const parent of ['packages', 'apps']) {
    let entries = 0;
    for await (const entry of await opendir(parent)) {
      if (++entries > 128 || entry.isSymbolicLink())
        throw new Error('NPM_README_WORKSPACE_INVALID');
      if (!entry.isDirectory()) continue;
      const directory = join(parent, entry.name);
      let manifest;
      try {
        manifest = JSON.parse(
          await readNpmDocumentation(join(directory, 'package.json')),
        );
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }
      if (manifest.private === true) continue;
      receipts.push(await checkNpmDirectoryReadme(directory));
    }
  }
  for (const platform of ['win32-x64', 'linux-x64-gnu']) {
    receipts.push(
      validateNpmReadme(
        await readNpmDocumentation(
          'docs/npm/runtime-' + platform + '.README.md',
        ),
        '@freerdp-bridge/runtime-' + platform,
      ),
    );
  }
} else throw new Error('NPM_README_USAGE');
console.log(JSON.stringify({ npmReadmes: receipts }));
