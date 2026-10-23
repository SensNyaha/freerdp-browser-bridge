import { mkdir, writeFile } from 'node:fs/promises';
const root = new URL('../build/fuzz/clipboard-corpus/', import.meta.url);
await mkdir(root, { recursive: true });
const samples = [
  Buffer.from('A\nЖ中😀', 'utf8'),
  Buffer.from('A\r\nЖ中😀\0', 'utf16le'),
  Buffer.from([0, 0]),
  Buffer.from([65]),
  Buffer.from([0, 0xd8, 0, 0]),
  Buffer.from([0, 0, 65, 0]),
  Buffer.from([0xf4, 0x90, 0x80, 0x80]),
  Buffer.from('a\rb\r\nc\nd'),
  Buffer.from([0xff, 0xfe, 0xff, 0xff, 0, 0]),
];
for (let i = 0; i < samples.length; ++i)
  await writeFile(new URL('sample-' + i, root), samples[i]);
