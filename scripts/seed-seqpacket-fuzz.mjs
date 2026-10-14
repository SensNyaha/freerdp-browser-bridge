import { mkdir, writeFile } from 'node:fs/promises';

const root = 'build/fuzz/seqpacket-corpus';
await mkdir(root, { recursive: true });
const hello = Buffer.from([
  82, 87, 83, 49, 0, 0, 0, 1, 0, 0, 0, 32, 0, 0, 0, 0, 82, 87, 73, 49, 0, 1, 0,
  1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 8, 0, 1, 0, 1, 0, 0, 0, 0,
]);
const first = hello.subarray(0, 40);
const second = Buffer.alloc(24);
hello.copy(second, 0, 0, 16);
second.writeUInt32BE(24, 12);
hello.copy(second, 16, 40);
const sequence = Buffer.alloc(2 + first.length + 2 + second.length);
sequence.writeUInt16BE(first.length);
first.copy(sequence, 2);
sequence.writeUInt16BE(second.length, 2 + first.length);
second.copy(sequence, 4 + first.length);
await writeFile(`${root}/hello`, hello);
await writeFile(`${root}/fragmented-hello`, sequence);
await writeFile(`${root}/header-only`, first);
await writeFile(`${root}/bad-order`, second);
