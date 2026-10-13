import { mkdir, writeFile } from 'node:fs/promises';
const root = 'build/fuzz/audio-svc-corpus';
await mkdir(root, { recursive: true });
for (const [name, bytes] of [
  ['volume', [3, 0, 4, 0, 1, 2, 3, 4]],
  ['close', [1, 0, 0, 0]],
  ['wave-info', [2, 0, 16, 0, 1, 0, 0, 0, 1, 0, 0, 0, 10, 11, 12, 13]],
  [
    'formats-overflow',
    [7, 0, 20, 0, ...new Array(14).fill(0), 65, 0, 0, 0, 0, 0],
  ],
])
  await writeFile(`${root}/${name}`, Buffer.from(bytes));
