import { mkdir, writeFile } from 'node:fs/promises';
import {
  Kind,
  encodePacket,
  helloPayload,
} from '../packages/protocol/dist/index.js';

await mkdir('build/fuzz/corpus', { recursive: true });
await writeFile(
  'build/fuzz/corpus/hello',
  encodePacket({ kind: Kind.Hello, requestId: 1n, payload: helloPayload() }),
);
await writeFile(
  'build/fuzz/corpus/heartbeat',
  encodePacket({
    kind: Kind.Heartbeat,
    requestId: 2n,
    payload: Buffer.alloc(0),
  }),
);
