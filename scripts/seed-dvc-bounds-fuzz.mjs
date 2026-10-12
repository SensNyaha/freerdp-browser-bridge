import { mkdir, writeFile } from 'node:fs/promises';
const root = 'build/fuzz/dvc-bounds-corpus';
await mkdir(root, { recursive: true });
const multipart = Buffer.from([
  0xe1, 2, 0, 3, 0, 0, 0, 3, 0, 0, 0, 4, 10, 11, 2, 0, 0, 0, 4, 12,
]);
for (const [name, bytes] of [
  ['data-first-u8', [0x20, 0x42, 14]],
  ['data-first-u32', [0x2a, 0x42, 0, 0, 0, 14, 0, 0, 0]],
  ['data-first-huge', [0x2f, 0x42, 0, 0, 0, 255, 255, 255, 255]],
  ['data-raw', [0x30, 0x42, 0, 1, 2]],
  ['compressed-first', [0x60, 0x42, 14, 0xe0, 4, 10, 11]],
  ['compressed-data', [0x70, 0x42, 0xe0, 0x24, 0, 0, 7]],
  ['zgfx-single-raw', [0xe0, 4, 10, 11]],
  ['zgfx-single-literal', [0xe0, 0x24, 0, 0, 7]],
  ['zgfx-multipart', multipart],
  ['zgfx-huge-count', [0xe1, 255, 255, 0, 0, 0, 0]],
  ['zgfx-huge-output', [0xe1, 1, 0, 255, 255, 255, 255, 2, 0, 0, 0, 4, 0]],
  ['zgfx-empty', [0xe1, 0, 0, 0, 0, 0, 0]],
  ['zgfx-empty-coded', [0xe1, 1, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0x24, 0]],
])
  await writeFile(`${root}/${name}`, Buffer.from(bytes));
