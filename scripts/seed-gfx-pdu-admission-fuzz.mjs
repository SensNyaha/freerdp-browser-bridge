import { mkdir, writeFile } from 'node:fs/promises';
const root = 'build/fuzz/gfx-pdu-admission-corpus';
await mkdir(root, { recursive: true });
const caps = Buffer.from([
  19, 0, 0, 0, 20, 0, 0, 0, 4, 0, 8, 0, 4, 0, 0, 0, 0, 0, 0, 0,
]);
for (const [name, bytes] of [
  ['caps', caps],
  ['batch', Buffer.concat([caps, caps])],
  ['short-header', caps.subarray(0, 7)],
  ['huge-header', Buffer.from([1, 0, 0, 0, 255, 255, 255, 255])],
  ['fill', Buffer.from([4, 0, 0, 0, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])],
])
  await writeFile(`${root}/${name}`, bytes);
