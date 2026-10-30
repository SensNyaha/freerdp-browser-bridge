import { mkdir, writeFile } from 'node:fs/promises';
const root = new URL('../build/fuzz/device-inventory-corpus/', import.meta.url);
await mkdir(root, { recursive: true });
const samples = [
  '0001001f00800000',
  '0001001000010000',
  '0001000000010000',
  '0001001000810000',
  '00010001000000000002000300000000',
  '00010001000100000005000000010000000100021234abcd020300000000000075d096',
  '00010001000100000005000300010000000100021234abcd020300000000000075d096',
  '000100020000000000030000000000000003000000000000',
  '00010001008100000005000000810000',
];
for (let i = 0; i < samples.length; i++)
  await writeFile(new URL(`seed-${i}`, root), Buffer.from(samples[i], 'hex'));
