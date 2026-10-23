import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import inputs from '../packaging/standalone/inputs.json' with { type: 'json' };
import { readStandalonePayloadFile } from './standalone/payload.mjs';

if (process.argv.length !== 3 || !Object.hasOwn(inputs, process.argv[2]))
  throw new Error('STANDALONE_INPUT_USAGE');
const input = inputs[process.argv[2]];
await mkdir('.tools/standalone-inputs', { recursive: true });
const path = resolve('.tools/standalone-inputs', input.file);
let bytes;
try {
  bytes = await readStandalonePayloadFile(path, 268435456);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (!bytes) {
  const response = await fetch(input.url, {
    redirect: 'error',
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error('STANDALONE_INPUT_FETCH_FAILED');
  const chunks = [];
  let count = 0;
  for await (const chunk of response.body) {
    if ((count += chunk.length) > 268435456)
      throw new Error('STANDALONE_INPUT_FETCH_LIMIT');
    chunks.push(chunk);
  }
  bytes = Buffer.concat(chunks);
  if (createHash('sha256').update(bytes).digest('hex') !== input.sha256)
    throw new Error('STANDALONE_INPUT_HASH_MISMATCH');
  await writeFile(path, bytes, { flag: 'wx' });
}
if (createHash('sha256').update(bytes).digest('hex') !== input.sha256)
  throw new Error('STANDALONE_INPUT_HASH_MISMATCH');
await writeFile(
  join('.tools/standalone-inputs', process.argv[2] + '.json'),
  JSON.stringify({ ...input, path }, null, 2) + '\n',
);
console.log(
  JSON.stringify({ key: process.argv[2], path, sha256: input.sha256 }),
);
