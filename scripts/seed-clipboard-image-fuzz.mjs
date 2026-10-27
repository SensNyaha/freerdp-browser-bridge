import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const directory = resolve('build/fuzz/clipboard-image-corpus');
await mkdir(directory, { recursive: true });
function dib(header, bits, compression, topDown) {
  const bytes = Buffer.alloc(
    header + (header === 40 && compression === 3 ? 12 : 0) + 8,
  );
  bytes.writeUInt32LE(header, 0);
  bytes.writeUInt32LE(1, 4);
  bytes.writeInt32LE(topDown ? -2 : 2, 8);
  bytes.writeUInt16LE(1, 12);
  bytes.writeUInt16LE(bits, 14);
  bytes.writeUInt32LE(compression, 16);
  bytes.writeUInt32LE(8, 20);
  if (header >= 108) {
    bytes.writeUInt32LE(0x73524742, 56);
    bytes.writeUInt32LE(0xff000000, 52);
  }
  if (compression === 3) {
    bytes.writeUInt32LE(0x00ff0000, 40);
    bytes.writeUInt32LE(0x0000ff00, 44);
    bytes.writeUInt32LE(0x000000ff, 48);
  }
  bytes.set([0x56, 0x34, 0x12, 0x78, 0xba, 0xdc, 0xfe, 0x98], bytes.length - 8);
  return bytes;
}
const canonical = dib(124, 32, 3, true);
const huge = Buffer.from(canonical);
huge.writeUInt32LE(0x7fffffff, 4);
huge.writeUInt32LE(0x7fffffff, 8);
const profile = Buffer.from(canonical);
profile.writeUInt32LE(0x4c494e4b, 56);
const seeds = [
  Buffer.alloc(0),
  Buffer.from([1, 2, 3, 4]),
  canonical,
  dib(124, 32, 3, false),
  dib(108, 32, 3, true),
  dib(40, 32, 3, false),
  dib(40, 32, 0, true),
  dib(40, 24, 0, false),
  canonical.subarray(0, 123),
  Buffer.concat([canonical, Buffer.from([0])]),
  huge,
  profile,
];
for (let index = 0; index < seeds.length; index++)
  await writeFile(join(directory, 'seed-' + index), seeds[index]);
console.log(JSON.stringify({ clipboardImageFuzzSeeds: seeds.length }));
