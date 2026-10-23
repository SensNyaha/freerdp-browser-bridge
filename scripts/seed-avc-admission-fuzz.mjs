import { mkdir, writeFile } from 'node:fs/promises';
const root = 'build/fuzz/avc-admission-corpus';
await mkdir(root, { recursive: true });
for (const [name, bytes] of [
  ['predictive', [0, 0, 1, 0x41, 0x89, 0x80]],
  [
    'sps',
    [0, 0, 0, 1, 0x67, 0x42, 0, 0x34, 0xf4, 0x03, 0xc0, 0x11, 0x3c, 0x80],
  ],
  ['incomplete', [0, 0, 0, 1, 0x67, 0]],
  ['empty-nal', [0, 0, 1]],
  ['emulation', [0, 0, 1, 0x67, 0x42, 0, 0, 3, 0, 0x80]],
])
  await writeFile(`${root}/${name}`, Buffer.from(bytes));
