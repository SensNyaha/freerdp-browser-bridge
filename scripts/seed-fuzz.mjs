import { mkdir, writeFile } from 'node:fs/promises';
import {
  Kind,
  encodePacket,
  helloPayload,
  encodePcmAudioConfig,
  encodePcmAudioPacket,
  encodePcmAudioState,
  encodeMicrophonePcm,
  encodeMicrophoneResult,
  encodeMicrophoneState,
  encodeMicrophoneReset,
  encodeMicrophoneResetResult,
  encodeConnectionSettings,
  encodeClipboardState,
  encodeClipboardCommand,
  encodeClipboardResult,
  encodeClipboardImageItem,
  encodeFileRecord,
} from '../packages/protocol/dist/index.js';

await mkdir('build/fuzz/corpus', { recursive: true });
const fileSettings = {
  host: 'localhost',
  username: 'u',
  domain: '',
  port: 3389,
  width: 1024,
  height: 768,
  colorDepth: 32,
  security: 2,
  certificatePolicy: 0,
  minimumTls: 2,
  connectMs: 5000,
  tcpAckMs: 1000,
  drives: Array.from({ length: 32 }, (_, i) => ({
    name: 'D' + String(i).padStart(2, '0') + '_' + 'x'.repeat(60),
    subdir: 'a'.repeat(253),
    readOnly: i % 2 === 1,
  })),
};
await writeFile(
  'build/fuzz/corpus/configure-managed-drives-maximum',
  encodePacket({
    kind: Kind.Configure,
    requestId: 1n,
    payload: encodeConnectionSettings(fileSettings),
  }),
);
const fileBase = {
  status: 'ok',
  flags: 0,
  id: 0n,
  argument: 0n,
  value: 0n,
  data: Buffer.alloc(0),
};
for (const [name, response, record] of [
  [
    'initialize',
    false,
    { operation: 'initialize', id: 131072n, argument: 65536n, value: 8n },
  ],
  [
    'initialize-xrdp',
    false,
    {
      operation: 'initialize',
      flags: 1,
      id: 131072n,
      argument: 65536n,
      value: 8n,
    },
  ],
  [
    'mkdir-unicode',
    false,
    { operation: 'mkdir', data: Buffer.from('Ж日本語😀') },
  ],
  [
    'write-maximum',
    false,
    { operation: 'write', id: 1n, data: Buffer.alloc(65536, 0x5a) },
  ],
  [
    'read-maximum',
    true,
    {
      operation: 'read',
      id: 1n,
      value: 65536n,
      data: Buffer.alloc(65536, 0xa5),
    },
  ],
  ['list-empty', true, { operation: 'list' }],
  ['remove-denied', true, { operation: 'remove', status: 'denied', id: 1n }],
]) {
  const kind = response ? Kind.FileResult : Kind.FileCommand;
  await writeFile(
    'build/fuzz/corpus/files-' + name,
    encodePacket({
      kind,
      requestId: 1n,
      payload: encodeFileRecord({ ...fileBase, ...record }, response),
    }),
  );
}
const imageInner = encodeClipboardImageItem({
  width: 2,
  height: 1,
  rgba: Buffer.from('12345678fedcba98', 'hex'),
});
const imageConfig = encodeConnectionSettings({
  host: 'localhost',
  username: 'u',
  domain: '',
  port: 3389,
  width: 1024,
  height: 768,
  colorDepth: 32,
  security: 2,
  certificatePolicy: 0,
  minimumTls: 2,
  connectMs: 5000,
  tcpAckMs: 1000,
  clipboard: { toServer: true, fromServer: true, maximum: 1024, image: true },
});
for (const [name, kind, requestId, payload] of [
  ['configure-image', Kind.Configure, 1n, imageConfig],
  [
    'clipboard-image-state',
    Kind.ClipboardState,
    0n,
    encodeClipboardState({
      generation: 1n,
      revision: 0n,
      maximum: 1024,
      ready: false,
      toServer: true,
      fromServer: true,
      remoteText: false,
      localAccepted: false,
      localPending: false,
      remotePending: false,
      image: true,
      remoteImage: false,
      localImageAccepted: false,
    }),
  ],
  [
    'clipboard-image-set',
    Kind.ClipboardCommand,
    2n,
    encodeClipboardCommand({
      operation: 'set-image',
      generation: 1n,
      revision: 0n,
      text: imageInner,
    }),
  ],
  [
    'clipboard-image-result',
    Kind.ClipboardResult,
    2n,
    encodeClipboardResult({
      operation: 'read-image',
      generation: 1n,
      revision: 1n,
      text: imageInner,
      status: 'accepted',
    }),
  ],
])
  await writeFile(
    'build/fuzz/corpus/' + name,
    encodePacket({ kind, requestId, payload }),
  );
for (const [name, flags, maximum] of [
  ['clipboard-both', 384, 1048576],
  ['clipboard-from-max', 256, 16777216],
  ['clipboard-no-direction-excess', 512, 1],
]) {
  const body = Buffer.from(
    '000a00096c6f63616c686f737400017500000d3d0400030000200201020000001388000003e81e145000003d0900003d09000000000000000000',
    'hex',
  );
  body.writeUInt32BE(flags, body.length - 8);
  body.writeUInt32BE(maximum, body.length - 4);
  await writeFile(
    'build/fuzz/corpus/configure-' + name,
    encodePacket({ kind: Kind.Configure, requestId: 1n, payload: body }),
  );
}
for (const [name, kind, requestId, payload] of [
  [
    'clipboard-state',
    Kind.ClipboardState,
    0n,
    encodeClipboardState({
      generation: 1n,
      revision: 0n,
      maximum: 1048576,
      ready: false,
      toServer: true,
      fromServer: true,
      remoteText: false,
      localAccepted: false,
      localPending: false,
      remotePending: false,
    }),
  ],
  [
    'clipboard-set',
    Kind.ClipboardCommand,
    1n,
    encodeClipboardCommand({
      operation: 'set',
      generation: 1n,
      revision: 0n,
      text: Buffer.from('Ж😀\n'),
    }),
  ],
  [
    'clipboard-result',
    Kind.ClipboardResult,
    1n,
    encodeClipboardResult({
      operation: 'read',
      status: 'accepted',
      generation: 1n,
      revision: 1n,
      text: Buffer.from('Ж😀\n'),
    }),
  ],
])
  await writeFile(
    'build/fuzz/corpus/' + name,
    encodePacket({ kind, requestId, payload }),
  );
await writeFile(
  'build/fuzz/corpus/microphone-reset',
  encodePacket({
    kind: Kind.MicrophoneReset,
    requestId: 1n,
    payload: encodeMicrophoneReset(1n),
  }),
);
await writeFile(
  'build/fuzz/corpus/microphone-reset-result',
  encodePacket({
    kind: Kind.MicrophoneResetResult,
    requestId: 1n,
    payload: encodeMicrophoneResetResult('unavailable'),
  }),
);
await writeFile(
  'build/fuzz/corpus/configure-microphone',
  encodePacket({
    kind: Kind.Configure,
    requestId: 1n,
    payload: encodeConnectionSettings({
      host: 'localhost',
      username: 'synthetic',
      domain: '',
      port: 3389,
      width: 1024,
      height: 768,
      colorDepth: 32,
      security: 2,
      certificatePolicy: 0,
      minimumTls: 2,
      connectMs: 5000,
      tcpAckMs: 1000,
      pcmInput: true,
      opusOutput: true,
    }),
  }),
);
await writeFile(
  'build/fuzz/corpus/microphone-state',
  encodePacket({
    kind: Kind.MicrophoneState,
    requestId: 0n,
    payload: encodeMicrophoneState({
      enabled: true,
      availability: 'ready',
      revision: 1n,
      epoch: 1n,
      timestampUs: 0n,
    }),
  }),
);
await writeFile(
  'build/fuzz/corpus/microphone-pcm',
  encodePacket({
    kind: Kind.MicrophonePcm,
    requestId: 1n,
    payload: encodeMicrophonePcm({
      epoch: 1n,
      timestampUs: 0n,
      discontinuity: true,
      pcm: Buffer.alloc(3840),
    }),
  }),
);
await writeFile(
  'build/fuzz/corpus/microphone-result',
  encodePacket({
    kind: Kind.MicrophoneResult,
    requestId: 1n,
    payload: encodeMicrophoneResult('unavailable'),
  }),
);
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
  'build/fuzz/corpus/audio-config',
  encodePacket({
    kind: Kind.AudioConfig,
    requestId: 0n,
    payload: encodePcmAudioConfig({
      epoch: 1n,
      codec: 'pcm',
      sampleRate: 48000,
      channels: 2,
      sampleFormat: 's16le',
      packetFrames: 960,
    }),
  }),
);
await writeFile(
  'build/fuzz/corpus/audio-pcm',
  encodePacket({
    kind: Kind.AudioPcm,
    requestId: 0n,
    payload: encodePcmAudioPacket({
      epoch: 1n,
      timestampUs: 1000000n,
      frames: 960,
      silenceFrames: 0,
      discontinuity: true,
      pcm: Buffer.alloc(3840),
    }),
  }),
);
const cursorShape = Buffer.alloc(44);
await writeFile(
  'build/fuzz/corpus/audio-state',
  encodePacket({
    kind: Kind.AudioState,
    requestId: 0n,
    payload: encodePcmAudioState({
      enabled: true,
      availability: 'closed',
      revision: 2n,
      epoch: 1n,
      timestampUs: 1020000n,
    }),
  }),
);
cursorShape.writeUInt16BE(1, 0);
cursorShape.writeUInt16BE(9, 2);
cursorShape.writeBigUInt64BE(1n, 4);
cursorShape.writeBigUInt64BE(1n, 12);
cursorShape.writeUInt16BE(1, 32);
cursorShape.writeUInt16BE(1, 34);
cursorShape.set([255, 0, 0, 255], 40);
await writeFile(
  'build/fuzz/corpus/cursor-shape',
  encodePacket({
    kind: Kind.CursorUpdate,
    requestId: 0n,
    payload: cursorShape,
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
// Standalone microphone Opus payload; also seed its prepared RWI1 envelope.
await writeFile(
  'build/fuzz/corpus/microphone-opus-payload',
  Buffer.from('010203c000000138010203040506070800000000000f4240fcfffe', 'hex'),
);
await writeFile(
  'build/fuzz/corpus/microphone-opus-envelope',
  encodePacket({
    kind: Kind.MicrophoneOpus,
    requestId: 1n,
    payload: Buffer.from(
      '010203c000000138010203040506070800000000000f4240fcfffe',
      'hex',
    ),
  }),
);
await writeFile(
  'build/fuzz/corpus/configure-opus-microphone',
  encodePacket({
    kind: Kind.Configure,
    requestId: 2n,
    payload: Buffer.from(
      '000800096c6f63616c686f737400017500000d3d0400030000200201020000001388000003e81e145000003d0900003d090000000020',
      'hex',
    ),
  }),
);
