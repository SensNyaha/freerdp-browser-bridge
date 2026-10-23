import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ProtocolError,
  encodeOpusAudioState,
  decodeOpusAudioState,
  encodeOpusAudioStateRecord,
  encodeOpusAudioConfigRecord,
  encodeOpusAudioPacketRecord,
  decodePcmAudioState,
  encodePcmAudioStateRecord,
} from '../../packages/protocol/dist/index.js';
const { parseOpusAudioRecord } = await import(
  'data:text/javascript;base64,' +
    (await readFile('apps/reference-harness/opus-wire.js')).toString('base64')
);
const { parsePcmAudioRecord } = await import(
  'data:text/javascript;base64,' +
    (await readFile('apps/reference-harness/pcm-playback.js')).toString(
      'base64',
    )
);
const buffer = (bytes) =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const state = {
  enabled: true,
  availability: 'ready',
  revision: 1n,
  epoch: 9n,
  timestampUs: 1000000n,
};
const stateBytes = Buffer.from(
  '000101020000000000000001000000000000000900000000000f4240010200000000bb8003c00000',
  'hex',
);
const config = {
  codec: 'opus',
  epoch: 9n,
  sampleRate: 48000,
  channels: 2,
  packetFrames: 960,
  lookaheadFrames: 312,
};
const packet = {
  epoch: 9n,
  timestampUs: 1000000n,
  frames: 960,
  silenceFrames: 0,
  discontinuity: true,
  encoded: Buffer.from('fcfffe', 'hex'),
};
const stateRecord = Buffer.from(
  '5257423101090002000000030000000700000000000f424000000028' +
    stateBytes.toString('hex'),
  'hex',
);
const configRecord = Buffer.from(
  '5257423101030002000000030000000800000000000f424000000014010102000000bb8003c001380000000000000009',
  'hex',
);
const packetRecord = Buffer.from(
  '5257423101040002000000030000000900000000000f424000000003fcfffe',
  'hex',
);

test('Opus source state: independent profile, common semantics, fixed metadata and mode separation', () => {
  const original = Buffer.from(stateBytes);
  assert.deepEqual(decodeOpusAudioState(stateBytes), state);
  assert.deepEqual(encodeOpusAudioState(state), stateBytes);
  assert.deepEqual(stateBytes, original);
  assert.throws(() => decodePcmAudioState(stateBytes), ProtocolError);
  for (let size = 0; size < 40; size++)
    assert.throws(
      () => decodeOpusAudioState(stateBytes.subarray(0, size)),
      ProtocolError,
    );
  assert.throws(
    () => decodeOpusAudioState(Buffer.concat([stateBytes, Buffer.alloc(1)])),
    ProtocolError,
  );
  for (const at of [0, 1, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39]) {
    const bad = Buffer.from(stateBytes);
    bad[at] ^= 1;
    assert.throws(() => decodeOpusAudioState(bad), ProtocolError);
  }
  for (const enabled of [2, 255]) {
    const bad = Buffer.from(stateBytes);
    bad[2] = enabled;
    assert.throws(() => decodeOpusAudioState(bad), ProtocolError);
  }
  for (const availability of [6, 255]) {
    const bad = Buffer.from(stateBytes);
    bad[3] = availability;
    assert.throws(() => decodeOpusAudioState(bad), ProtocolError);
  }
  for (const invalid of [
    { ...state, enabled: false },
    { ...state, epoch: 0n },
    { ...state, revision: 0n },
    { ...state, timestampUs: (1n << 64n) - 1n },
    { ...state, availability: 'unknown' },
  ])
    assert.throws(() => encodeOpusAudioState(invalid), ProtocolError);
  for (const availability of [
    'unavailable',
    'waiting',
    'ready',
    'suspended',
    'closed',
    'failed',
  ])
    assert.deepEqual(
      decodeOpusAudioState(encodeOpusAudioState({ ...state, availability })),
      { ...state, availability },
    );
  const disabled = {
    enabled: false,
    availability: 'unavailable',
    revision: 1n,
    epoch: 0n,
    timestampUs: 0n,
  };
  assert.deepEqual(
    decodeOpusAudioState(encodeOpusAudioState(disabled)),
    disabled,
  );
  assert.deepEqual(
    decodePcmAudioState(encodeOpusAudioState(disabled)),
    disabled,
  );
});

test('Opus RWB1: independent state/config/raw-packet vectors and borrowed browser payload', () => {
  assert.deepEqual(encodeOpusAudioStateRecord(state, 7), stateRecord);
  assert.deepEqual(
    encodeOpusAudioConfigRecord(config, 1000000n, 8),
    configRecord,
  );
  assert.deepEqual(encodeOpusAudioPacketRecord(packet, 9), packetRecord);
  assert.deepEqual(parseOpusAudioRecord(buffer(stateRecord)), {
    type: 'state',
    ...state,
    sequence: 7,
  });
  assert.deepEqual(parseOpusAudioRecord(buffer(configRecord)), {
    type: 'config',
    epoch: 9n,
    timestampUs: 1000000n,
    lookaheadFrames: 312,
    sequence: 8,
  });
  const owned = buffer(packetRecord),
    parsed = parseOpusAudioRecord(owned);
  assert.equal(parsed.type, 'packet');
  assert.equal(parsed.timestampUs, 1000000n);
  assert.equal(parsed.sequence, 9);
  assert.equal(parsed.discontinuity, true);
  assert.equal(parsed.encoded.buffer, owned);
  assert.equal(parsed.encoded.byteOffset, 28);
  assert.deepEqual(Array.from(parsed.encoded), [0xfc, 0xff, 0xfe]);
  for (const record of [stateRecord, configRecord, packetRecord])
    assert.throws(
      () => parsePcmAudioRecord(buffer(record)),
      /Invalid PCM audio record/,
    );
  assert.throws(
    () => parseOpusAudioRecord(buffer(encodePcmAudioStateRecord(state, 7))),
    /Invalid Opus audio record/,
  );
  for (const sequence of [-1, 0x100000000, NaN, 0.5, '1']) {
    assert.throws(
      () => encodeOpusAudioStateRecord(state, sequence),
      ProtocolError,
    );
    assert.throws(
      () => encodeOpusAudioConfigRecord(config, 1000000n, sequence),
      ProtocolError,
    );
    assert.throws(
      () => encodeOpusAudioPacketRecord(packet, sequence),
      ProtocolError,
    );
  }
  for (const timestampUs of [-1n, (1n << 64n) - 20000n, 1, '1'])
    assert.throws(
      () => encodeOpusAudioConfigRecord(config, timestampUs, 0),
      ProtocolError,
    );
  assert.throws(() => encodeOpusAudioStateRecord(null, 0), ProtocolError);
  assert.equal(
    parseOpusAudioRecord(
      buffer(
        encodeOpusAudioPacketRecord(
          { ...packet, discontinuity: false },
          0xffffffff,
        ),
      ),
    ).discontinuity,
    false,
  );
});

test('Opus browser parser: allocation bounds, header claims, state clock and config/profile faults', () => {
  for (const value of [
    null,
    undefined,
    Buffer.alloc(31),
    new Uint8Array(31),
    new ArrayBuffer(29),
    new ArrayBuffer(1304),
  ])
    assert.throws(
      () => parseOpusAudioRecord(value),
      /Invalid Opus audio record/,
    );
  for (const record of [stateRecord, configRecord, packetRecord]) {
    for (const at of [0, 4, 5, 6, 7, 8, 11, 24, 27]) {
      const bad = Buffer.from(record);
      bad[at] ^= 255;
      assert.throws(
        () => parseOpusAudioRecord(buffer(bad)),
        /Invalid Opus audio record/,
      );
    }
    const badClock = Buffer.from(record);
    badClock.writeBigUInt64BE(0xffffffffffffffffn, 16);
    assert.throws(
      () => parseOpusAudioRecord(buffer(badClock)),
      /Invalid Opus audio record/,
    );
  }
  for (const at of [
    28, 29, 30, 31, 32, 35, 36, 37, 40, 47, 48, 55, 56, 57, 58, 59, 60, 63, 64,
    65, 66, 67,
  ]) {
    const bad = Buffer.from(stateRecord);
    bad[at] ^= 255;
    // Scalar nonzero epochs/revisions can legitimately change; enforce only
    // descriptor/clock and bounded availability here.
    if ([32, 35, 36, 37, 40, 47].includes(at)) continue;
    assert.throws(
      () => parseOpusAudioRecord(buffer(bad)),
      /Invalid Opus audio record/,
    );
  }
  for (const at of [28, 29, 30, 31, 32, 35, 36, 37]) {
    const bad = Buffer.from(configRecord);
    bad[at] ^= 255;
    assert.throws(
      () => parseOpusAudioRecord(buffer(bad)),
      /Invalid Opus audio record/,
    );
  }
  const delay = Buffer.from(configRecord);
  delay.writeUInt16BE(961, 38);
  assert.throws(
    () => parseOpusAudioRecord(buffer(delay)),
    /Invalid Opus audio record/,
  );
  const epoch = Buffer.from(configRecord);
  epoch.fill(0, 40);
  assert.throws(
    () => parseOpusAudioRecord(buffer(epoch)),
    /Invalid Opus audio record/,
  );
  for (let toc = 0; toc < 256; toc++) {
    const bad = Buffer.from(packetRecord);
    bad[28] = toc;
    if ([0x0c, 0x2c, 0x4c, 0x6c, 0x7c, 0x9c, 0xbc, 0xdc, 0xfc].includes(toc))
      assert.doesNotThrow(() => parseOpusAudioRecord(buffer(bad)));
    else
      assert.throws(
        () => parseOpusAudioRecord(buffer(bad)),
        /Invalid Opus audio record/,
      );
  }
  for (const length of [2, 1275]) {
    const encoded = Buffer.alloc(length, 0xff);
    encoded[0] = 0xfc;
    const record = encodeOpusAudioPacketRecord({ ...packet, encoded }, 10);
    assert.equal(
      parseOpusAudioRecord(buffer(record)).encoded.byteLength,
      length,
    );
  }
});
