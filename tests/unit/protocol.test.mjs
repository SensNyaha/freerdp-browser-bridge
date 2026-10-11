import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Kind,
  PacketDecoder,
  ProtocolError,
  decodeHeader,
  encodePacket,
  helloPayload,
  decodeBuild,
  encodeConnectionSettings,
  decodeConnectionState,
  decodeCertificatePrompt,
  encodeCertificateDecision,
  decodeCapturedFrame,
  encodeJpegRecords,
  MAX_JPEG_BYTES,
  decodeAvcFrame,
  encodeAvcRecords,
} from '../../packages/protocol/dist/index.js';

test('AVC IPC/RWB1 independent vectors, parameter sets, keyframe classification and allocation bounds', () => {
  const config = '0142c01effe100046742c01e01000468ce3c80';
  const payload = Buffer.from(
    '00000000000000010000000000000002008000400200001300000006' +
      config +
      '000000026588',
    'hex',
  );
  const frame = decodeAvcFrame(payload);
  assert.equal(frame.avc.keyframe, true);
  assert.equal(frame.width, 128);
  const records = encodeAvcRecords(frame, 10, true);
  assert.equal(
    records[0].toString('hex'),
    '5257423101010002000000010000000a00000000000000020000001b0101008000400000' +
      config,
  );
  assert.equal(
    records[1].toString('hex'),
    '5257423101020003000000010000000b000000000000000200000006000000026588',
  );
  const delta = Buffer.from(payload);
  delta[20] = 1;
  delta[delta.length - 2] = 0x41;
  assert.equal(decodeAvcFrame(delta).avc.keyframe, false);
  assert.throws(
    () => encodeAvcRecords(decodeAvcFrame(delta), 0, true),
    ProtocolError,
  );
  const unchanged = Buffer.from(payload.subarray(0, 28));
  unchanged.fill(0, 20);
  assert.equal(decodeAvcFrame(unchanged).avc, undefined);
  for (const offset of [
    16,
    18,
    20,
    21,
    22,
    24,
    28,
    32,
    33,
    34,
    36,
    40,
    43,
    payload.length - 2,
  ]) {
    const bad = Buffer.from(payload);
    bad[offset] ^= 255;
    assert.throws(() => decodeAvcFrame(bad), ProtocolError, 'offset ' + offset);
  }
  assert.throws(() => decodeAvcFrame(payload.subarray(0, -1)), ProtocolError);
  assert.throws(
    () => decodeAvcFrame(Buffer.concat([unchanged, Buffer.alloc(1)])),
    ProtocolError,
  );
  const mixed = {
    ...frame,
    avc: { ...frame.avc, bytes: Buffer.from('000000076588000001419a', 'hex') },
  };
  assert.throws(() => encodeAvcRecords(mixed, 0, false), ProtocolError);
  const many = {
    ...frame,
    avc: {
      ...frame.avc,
      keyframe: false,
      bytes: Buffer.concat(
        Array.from({ length: 1025 }, () => Buffer.from('00000002419a', 'hex')),
      ),
    },
  };
  assert.throws(() => encodeAvcRecords(many, 0, false), ProtocolError);
  for (const [kind, length] of [
    [Kind.CaptureAvc, 11],
    [Kind.FrameAvc, 27],
    [Kind.FrameAvc, MAX_JPEG_BYTES + 2059 + 29],
  ])
    assert.throws(
      () =>
        encodePacket({ kind, requestId: 1n, payload: Buffer.alloc(length) }),
      ProtocolError,
    );
  const header = encodePacket({
    kind: Kind.FrameAvc,
    requestId: 1n,
    payload,
  }).subarray(0, 24);
  header.writeUInt32BE(MAX_JPEG_BYTES + 2059 + 29, 20);
  assert.throws(() => decodeHeader(header), ProtocolError);
});

test('JPEG IPC metadata and RWB1 vectors have independent byte order and strict bounds', () => {
  const payload = Buffer.from(
    '000000000000000100000000000000020400030001000000ffd8ffd9',
    'hex',
  );
  const frame = decodeCapturedFrame(payload);
  assert.equal(frame.revision, 1n);
  assert.equal(frame.width, 1024);
  assert.equal(frame.height, 768);
  const records = encodeJpegRecords(frame, 10, true);
  assert.equal(
    records[0].toString('hex'),
    '5257423101010002000000010000000a0000000000000002000000080102040003000000',
  );
  assert.equal(
    records[1].toString('hex'),
    '5257423101020003000000010000000b000000000000000200000004ffd8ffd9',
  );
  const noChange = Buffer.from(payload.subarray(0, 24));
  noChange[20] = 0;
  assert.equal(decodeCapturedFrame(noChange).jpeg, undefined);
  const zeroRevision = Buffer.from(payload);
  zeroRevision.fill(0, 0, 8);
  assert.throws(() => decodeCapturedFrame(zeroRevision), ProtocolError);
  for (const offset of [16, 18, 20, 21, 25, 27]) {
    const bad = Buffer.from(payload);
    bad[offset] = 255;
    assert.throws(() => decodeCapturedFrame(bad), ProtocolError);
  }
  assert.throws(
    () => decodeCapturedFrame(payload.subarray(0, 23)),
    ProtocolError,
  );
  assert.throws(
    () => decodeCapturedFrame(Buffer.alloc(MAX_JPEG_BYTES + 25)),
    ProtocolError,
  );
  assert.throws(
    () => decodeCapturedFrame(Buffer.concat([noChange, Buffer.alloc(1)])),
    ProtocolError,
  );
  const header = encodePacket({
    kind: Kind.Frame,
    requestId: 1n,
    payload,
  }).subarray(0, 24);
  header.writeUInt32BE(MAX_JPEG_BYTES + 25, 20);
  assert.throws(() => decodeHeader(header), ProtocolError);
});

test('RWI1 golden network-order vector is independent of native serializer', () => {
  const packet = encodePacket({
    kind: Kind.Hello,
    requestId: 0x0102030405060708n,
    payload: helloPayload(),
  });
  assert.equal(
    packet.toString('hex'),
    '5257493100010001000000000102030405060708000000080001000100000000',
  );
});

test('build IPC: video quality capability preserves old peers and requires the native connection core', () => {
  const build = (flags) => {
    const header = Buffer.alloc(4);
    header.writeUInt16BE(1, 0);
    header.writeUInt16BE(flags, 2);
    return Buffer.concat([
      header,
      ...[
        '0.1.0',
        'fixture',
        '3.32.1',
        '3.32.1',
        'windows',
        'x64',
        'framed-pipes',
      ].flatMap((value) => {
        const text = Buffer.from(value);
        const size = Buffer.alloc(2);
        size.writeUInt16BE(text.length);
        return [size, text];
      }),
    ]);
  };
  assert.equal(decodeBuild(build(253)).capabilities.videoQuality, false);
  assert.equal(decodeBuild(build(509)).capabilities.videoQuality, true);
  assert.equal(decodeBuild(build(509)).capabilities.displayControl, false);
  assert.equal(decodeBuild(build(1021)).capabilities.displayControl, true);
  assert.equal(decodeBuild(build(1021)).capabilities.unicodeInput, false);
  assert.equal(decodeBuild(build(2045)).capabilities.unicodeInput, true);
  assert.equal(decodeBuild(build(4093)).capabilities.pcmOutput, false);
  assert.equal(decodeBuild(build(8189)).capabilities.pcmOutput, true);
  assert.equal(decodeBuild(build(8189)).capabilities.opusOutput, false);
  assert.equal(decodeBuild(build(16381)).capabilities.opusOutput, true);
  assert.equal(decodeBuild(build(8197)).capabilities.opusOutput, true);
  assert.equal(decodeBuild(build(8197)).capabilities.pcmOutput, false);
  assert.equal(decodeBuild(build(16381)).capabilities.audioReset, false);
  assert.equal(decodeBuild(build(24581)).capabilities.audioReset, true);
  assert.equal(decodeBuild(build(20485)).capabilities.audioReset, true);
  assert.equal(decodeBuild(build(32765)).capabilities.audioReset, true);
  assert.equal(decodeBuild(build(32765)).capabilities.pcmInput, false);
  assert.equal(decodeBuild(build(32773)).capabilities.pcmInput, true);
  assert.equal(decodeBuild(build(32773)).capabilities.opusOutput, false);
  assert.equal(decodeBuild(build(65533)).capabilities.pcmInput, true);
  for (const flags of [1, 253, 2045, 4093])
    assert.equal(decodeBuild(build(flags)).capabilities.penInput, false);
  for (const flags of [
    257, 513, 1025, 1029, 2049, 4097, 8193, 16385, 16389, 32769,
  ])
    assert.throws(() => decodeBuild(build(flags)), ProtocolError);
});

test('connection IPC: independent golden settings, byte limits and no legacy security fallback', () => {
  const settings = {
    host: 'localhost',
    username: 'u',
    domain: '',
    port: 3389,
    width: 1024,
    height: 768,
    colorDepth: 32,
    security: 2,
    certificatePolicy: 1,
    minimumTls: 2,
    connectMs: 5000,
    tcpAckMs: 1000,
  };
  assert.equal(
    encodeConnectionSettings(settings).toString('hex'),
    '000100096c6f63616c686f737400017500000d3d0400030000200201020000001388000003e8',
  );
  const videoQuality = {
    h264Fps: 10,
    jpegFps: 10,
    jpegQuality: 60,
    targetBitrate: 1000000,
    maxBitrate: 2000000,
  };
  assert.equal(
    encodeConnectionSettings({ ...settings, pcmOutput: true }).toString('hex'),
    '000500096c6f63616c686f737400017500000d3d0400030000200201020000001388000003e81e145000003d0900003d090000000004',
  );
  assert.equal(
    encodeConnectionSettings({ ...settings, opusOutput: true }).toString('hex'),
    '000600096c6f63616c686f737400017500000d3d0400030000200201020000001388000003e81e145000003d0900003d090000000008',
  );
  for (const touch of [false, true])
    for (const dynamicResolution of [false, true]) {
      const bytes = encodeConnectionSettings({
        ...settings,
        opusOutput: true,
        touch,
        dynamicResolution,
      });
      assert.equal(bytes.readUInt16BE(0), 6);
      assert.equal(
        bytes.subarray(-4).readUInt32BE(0),
        8 | (touch ? 2 : 0) | (dynamicResolution ? 1 : 0),
      );
    }
  assert.deepEqual(
    encodeConnectionSettings({ ...settings, opusOutput: false }),
    encodeConnectionSettings(settings),
  );
  assert.deepEqual(
    encodeConnectionSettings({
      ...settings,
      pcmOutput: true,
      opusOutput: false,
    }),
    encodeConnectionSettings({ ...settings, pcmOutput: true }),
  );
  for (const opusOutput of [null, 1, 'opus'])
    assert.throws(
      () => encodeConnectionSettings({ ...settings, opusOutput }),
      ProtocolError,
    );
  assert.throws(
    () =>
      encodeConnectionSettings({
        ...settings,
        opusOutput: true,
        pcmOutput: true,
      }),
    ProtocolError,
  );
  assert.equal(
    encodeConnectionSettings({
      ...settings,
      pcmOutput: true,
      touch: true,
      dynamicResolution: true,
    })
      .subarray(-4)
      .readUInt32BE(0),
    7,
  );
  assert.deepEqual(
    encodeConnectionSettings({ ...settings, pcmOutput: false }),
    encodeConnectionSettings(settings),
  );
  assert.throws(
    () => encodeConnectionSettings({ ...settings, pcmOutput: 'pcm' }),
    ProtocolError,
  );
  assert.equal(
    encodeConnectionSettings({ ...settings, videoQuality }).toString('hex'),
    '000200096c6f63616c686f737400017500000d3d0400030000200201020000001388000003e80a0a3c00000f4240001e8480',
  );
  assert.equal(
    encodeConnectionSettings({
      ...settings,
      videoQuality,
      dynamicResolution: true,
    }).toString('hex'),
    '000300096c6f63616c686f737400017500000d3d0400030000200201020000001388000003e80a0a3c00000f4240001e848000000001',
  );
  assert.equal(
    encodeConnectionSettings({ ...settings, dynamicResolution: true }).toString(
      'hex',
    ),
    '000300096c6f63616c686f737400017500000d3d0400030000200201020000001388000003e81e145000003d0900003d090000000001',
  );
  assert.deepEqual(
    encodeConnectionSettings({ ...settings, dynamicResolution: false }),
    encodeConnectionSettings(settings),
  );
  assert.throws(
    () => encodeConnectionSettings({ ...settings, dynamicResolution: 1 }),
    ProtocolError,
  );
  for (const patch of [
    { h264Fps: 0 },
    { h264Fps: 31 },
    { jpegFps: 21 },
    { jpegQuality: 0 },
    { jpegQuality: 101 },
    { targetBitrate: 99999 },
    { maxBitrate: 999999 },
    { maxBitrate: 20000001 },
    { maxBitrate: NaN },
  ])
    assert.throws(
      () =>
        encodeConnectionSettings({
          ...settings,
          videoQuality: { ...videoQuality, ...patch },
        }),
      ProtocolError,
    );
  for (const patch of [
    { host: '' },
    { host: 'host name' },
    { username: 'bad\0secret' },
    { username: '\ud800' },
    { username: 'я'.repeat(129) },
    { port: 0 },
    { width: 7681 },
    { height: 4321 },
    { colorDepth: 8 },
    { security: 3 },
    { certificatePolicy: 2 },
    { minimumTls: 1 },
    { connectMs: 99 },
    { tcpAckMs: 120001 },
  ])
    assert.throws(
      () => encodeConnectionSettings({ ...settings, ...patch }),
      ProtocolError,
    );
  for (const [kind, length] of [
    [Kind.Configure, 2049],
    [Kind.Secret, 4097],
    [Kind.State, 7],
    [Kind.Certificate, 41],
    [Kind.CertificateDecision, 40],
  ]) {
    assert.throws(
      () =>
        encodePacket({ kind, requestId: 1n, payload: Buffer.alloc(length) }),
      ProtocolError,
    );
  }
  const state = Buffer.from('0005000300020008', 'hex');
  assert.deepEqual(decodeConnectionState(state), {
    state: 'failed',
    error: 'RDP_CERTIFICATE_REJECTED',
    nativeError: 131080,
  });
  for (const malformed of [
    Buffer.alloc(8),
    Buffer.from('0003000300000000', 'hex'),
    Buffer.from('0005000000000000', 'hex'),
  ])
    assert.throws(() => decodeConnectionState(malformed), ProtocolError);
});

test('certificate IPC: challenge and SHA-256 bound decisions, bounded metadata and no PEM echo', () => {
  const bytes = Buffer.alloc(42);
  bytes.writeBigUInt64BE(1n);
  bytes.writeUInt16BE(3, 8);
  bytes.fill(0xa5, 10);
  const prompt = decodeCertificatePrompt(bytes);
  assert.deepEqual(prompt, {
    challenge: '1',
    fingerprint: 'sha256:' + 'a5'.repeat(32),
    untrusted: true,
    hostnameMismatch: true,
  });
  const decision = encodeCertificateDecision(prompt, true);
  assert.equal(
    decision.toString('hex'),
    '0000000000000001' + 'a5'.repeat(32) + '01',
  );
  for (const patch of [
    { challenge: '0' },
    { challenge: '-1' },
    { challenge: '18446744073709551616' },
    { fingerprint: 'sha256:bad' },
  ])
    assert.throws(
      () => encodeCertificateDecision({ ...prompt, ...patch }, true),
      ProtocolError,
    );
  bytes.writeUInt16BE(4, 8);
  assert.throws(() => decodeCertificatePrompt(bytes), ProtocolError);
});

test('fragmentation at every split and coalesced empty records', () => {
  const records = [
    { kind: Kind.Hello, requestId: 1n, payload: helloPayload() },
    { kind: Kind.Heartbeat, requestId: 2n, payload: Buffer.alloc(0) },
    {
      kind: Kind.Shutdown,
      requestId: 0xffffffffffffffffn,
      payload: Buffer.alloc(0),
    },
  ];
  const bytes = Buffer.concat(records.map(encodePacket));
  for (let i = 0; i <= bytes.length; ++i) {
    const decoder = new PacketDecoder();
    const output = [];
    decoder.push(bytes.subarray(0, i), (packet) => output.push(packet));
    decoder.push(bytes.subarray(i), (packet) => output.push(packet));
    decoder.finish();
    assert.deepEqual(output, records);
  }
  const decoder = new PacketDecoder();
  const output = [];
  for (const byte of bytes)
    decoder.push(Buffer.from([byte]), (packet) => output.push(packet));
  assert.deepEqual(output, records);
});

test('reject unknown kinds, versions, flags and lengths before payload allocation', () => {
  const good = encodePacket({
    kind: Kind.Heartbeat,
    requestId: 1n,
    payload: Buffer.alloc(0),
  });
  for (const index of [0, 4, 7, 8, 20, 23]) {
    const bad = Buffer.from(good);
    bad[index] = 255;
    const decoder = new PacketDecoder();
    assert.throws(() => decoder.push(bad, () => assert.fail()), ProtocolError);
    assert.throws(() => decoder.push(good, () => assert.fail()), ProtocolError);
  }
  assert.throws(
    () =>
      encodePacket({
        kind: Kind.HelloAck,
        requestId: 1n,
        payload: Buffer.alloc(4097),
      }),
    ProtocolError,
  );
  assert.throws(
    () =>
      encodePacket({
        kind: Kind.Hello,
        requestId: 1n,
        payload: Buffer.alloc(7),
      }),
    ProtocolError,
  );
  assert.throws(() => decodeHeader(good.subarray(0, 23)), ProtocolError);
  const highBit = Buffer.from(good);
  highBit[0] |= 128;
  assert.throws(() => decodeHeader(highBit), ProtocolError);
});

test('truncated streams and malformed build reports never interpolate input into errors', () => {
  const packet = encodePacket({
    kind: Kind.Hello,
    requestId: 1n,
    payload: helloPayload(),
  });
  for (let n = 1; n < packet.length; ++n) {
    const decoder = new PacketDecoder();
    decoder.push(packet.subarray(0, n), () => assert.fail());
    assert.throws(() => decoder.finish(), ProtocolError);
  }
  const sentinel = 'sensitive-SENTINEL';
  assert.throws(
    () => decodeBuild(Buffer.from(sentinel)),
    (error) => !error.message.includes(sentinel),
  );
});
