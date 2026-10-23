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
// A large logical clipboard record still starts with one inspected RWI1 header;
// this seed stores only that first bounded datagram, never a 16 MiB corpus file.
for (const [name, kind, total] of [
  ['clipboard-maximum-first', 46, 16777264],
  ['oversized-video-first', 19, 16777264],
  ['clipboard-excess-first', 46, 16777265],
]) {
  const b = Buffer.alloc(40);
  b.write('RWS1', 0);
  b.writeUInt32BE(1, 4);
  b.writeUInt32BE(total, 8);
  b.write('RWI1', 16);
  b.writeUInt16BE(1, 20);
  b.writeUInt16BE(kind, 22);
  b.writeBigUInt64BE(1n, 28);
  b.writeUInt32BE(total - 24, 36);
  await writeFile(`${root}/${name}`, b);
}
