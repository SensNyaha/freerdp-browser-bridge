import { lstatSync, readFileSync } from 'node:fs';

const manifest = new URL('../package.json', import.meta.url);
const info = lstatSync(manifest);
if (!info.isFile() || info.isSymbolicLink() || info.size > 65536)
  throw new Error('PRODUCT_VERSION_INVALID');
const version = JSON.parse(readFileSync(manifest, 'utf8')).version;
if (
  typeof version !== 'string' ||
  version.length > 32 ||
  !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(version)
)
  throw new Error('PRODUCT_VERSION_INVALID');

export const productVersion = version;
