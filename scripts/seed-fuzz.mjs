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
await writeFile(
  'build/fuzz/corpus/connection',
  encodePacket({
    kind: Kind.Configure,
    requestId: 3n,
    payload: Buffer.from(
      '000100096c6f63616c686f737400017500000d3d0400030000200201020000001388000003e8',
      'hex',
    ),
  }),
);
await writeFile(
  'build/fuzz/corpus/secret-synthetic',
  encodePacket({
    kind: Kind.Secret,
    requestId: 4n,
    payload: Buffer.from('synthetic-fuzz-only'),
  }),
);
