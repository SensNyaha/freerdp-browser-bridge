import { copyFile, mkdir, readdir } from 'node:fs/promises';

// Checked-in reference files only; never traverse user-selected directories.
const source = new URL('../apps/reference-harness/', import.meta.url);
const destination = new URL('../apps/bridge-api/browser/', import.meta.url);
await mkdir(destination, { recursive: true });
let count = 0;
for (const entry of await readdir(source, { withFileTypes: true })) {
  if (!entry.isFile() || !/^[a-z][a-z0-9-]*\.(js|html)$/.test(entry.name))
    throw new Error('BROWSER_ASSET_REFUSED');
  await copyFile(new URL(entry.name, source), new URL(entry.name, destination));
  count++;
}
console.log(JSON.stringify({ browserAssets: count }));
