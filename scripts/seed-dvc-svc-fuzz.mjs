import { mkdir, writeFile } from 'node:fs/promises';
const root = 'build/fuzz/dvc-svc-corpus';
await mkdir(root, { recursive: true });
const packet = Buffer.from([0x20, 0x42, 3, 10, 11, 12]);
function fragment(flags, total, delta, bytes) {
  const header = Buffer.alloc(9);
  header[0] = flags;
  header.writeUInt32LE(total, 1);
  header.writeUInt16LE(delta, 5);
  header.writeUInt16LE(bytes.length, 7);
  return Buffer.concat([header, bytes]);
}
for (const [name, bytes] of [
  ['whole', fragment(3, 6, 0, packet)],
  [
    'split',
    Buffer.concat([
      fragment(1, 6, 0, packet.subarray(0, 2)),
      fragment(2, 6, 20, packet.subarray(2)),
    ]),
  ],
  [
    'zero-last',
    Buffer.concat([
      fragment(1, 6, 0, packet),
      fragment(2, 6, 20, Buffer.alloc(0)),
    ]),
  ],
  [
    'late-last',
    Buffer.concat([
      fragment(1, 6, 0, packet.subarray(0, 2)),
      fragment(2, 6, 2000, packet.subarray(2)),
    ]),
  ],
  [
    'duplicate-first',
    Buffer.concat([
      fragment(1, 6, 0, packet.subarray(0, 2)),
      fragment(1, 6, 1, packet.subarray(2)),
    ]),
  ],
  ['huge-total', fragment(1, 0xffffffff, 0, packet)],
])
  await writeFile(`${root}/${name}`, bytes);
