import { mkdir, writeFile } from 'node:fs/promises';

const root = 'build/fuzz/audin-corpus';
await mkdir(root, { recursive: true });
const format = Buffer.alloc(18);
format.writeUInt16LE(1, 0);
format.writeUInt16LE(2, 2);
format.writeUInt32LE(48000, 4);
format.writeUInt32LE(192000, 8);
format.writeUInt16LE(4, 12);
format.writeUInt16LE(16, 14);
const formats = Buffer.concat([
  Buffer.from([2, 1, 0, 0, 0, 27, 0, 0, 0]),
  format,
]);
const open = Buffer.concat([
  Buffer.from([3, 0xc0, 3, 0, 0, 0, 0, 0, 0]),
  format,
]);
for (const [name, bytes] of [
  ['version', Buffer.from([1, 2, 0, 0, 0])],
  ['formats', formats],
  ['open', open],
  ['change', Buffer.from([7, 0, 0, 0, 0])],
]) {
  await writeFile(`${root}/${name}`, bytes);
}
