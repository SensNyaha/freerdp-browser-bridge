import { mkdir, writeFile } from 'node:fs/promises';
const root = new URL(
  '../build/fuzz/clipboard-ingress-corpus/',
  import.meta.url,
);
await mkdir(root, { recursive: true });
function record(kind, flags, body = Buffer.alloc(0)) {
  const b = Buffer.alloc(8 + body.length);
  b.writeUInt16LE(kind, 0);
  b.writeUInt16LE(flags, 2);
  b.writeUInt32LE(body.length, 4);
  body.copy(b, 8);
  return b;
}
const samples = [
  record(1, 0),
  record(7, 0, Buffer.from([1, 0, 0, 0, 1, 0, 12, 0, 2, 0, 0, 0, 2, 0, 0, 0])),
  record(2, 0, Buffer.alloc(36)),
  record(2, 4, Buffer.alloc(36 * 64)),
  record(2, 0, Buffer.from([13, 0, 0, 0, 0, 0])),
  record(3, 1),
  record(4, 0, Buffer.from([13, 0, 0, 0])),
  record(5, 1, Buffer.from([65, 0, 0, 0])),
  record(5, 2),
  record(8, 0, Buffer.alloc(24)),
  // Hosted crash-59f84f3d714cbbeec6e2c2e4696d579b47d4893a: the
  // ingress accepts this short-format list but removes its zero DWORD trailer.
  Buffer.from(
    'AgAAACQAAAAAAAAAAAAAAAAAAwABAPsAAAAAAAAAAP////8AAAAAAAAAAAAAAAAA',
    'base64',
  ),
];
for (let i = 0; i < samples.length; ++i)
  await writeFile(new URL('record-' + i, root), samples[i]);
