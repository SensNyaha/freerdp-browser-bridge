// Explicit synthetic IPC peer, never a FreeRDP/device/capture implementation.
import {
  Kind,
  PacketDecoder,
  encodePacket,
  decodeMicrophonePcm,
  decodeMicrophoneOpus,
  encodeMicrophoneResult,
  encodeMicrophoneState,
  decodeMicrophoneReset,
  encodeMicrophoneResetResult,
} from '../../packages/protocol/dist/index.js';
const decoder = new PacketDecoder();
let host, codec, pending, pendingReset;
let state = {
  enabled: true,
  availability: 'ready',
  revision: 1n,
  epoch: 1n,
  timestampUs: 1000n,
};
function send(kind, requestId, payload = Buffer.alloc(0)) {
  if (process.stdout.writableLength + payload.length + 24 > 65536)
    throw new Error('FIXTURE_OUTPUT_LIMIT');
  process.stdout.write(encodePacket({ kind, requestId, payload }));
}
function status() {
  send(Kind.MicrophoneState, 0n, encodeMicrophoneState(state));
}
function resetResult(id, result) {
  const bytes = encodeMicrophoneResetResult(result);
  if (host === 'reset-malformed') bytes[1] = 4;
  send(Kind.MicrophoneResetResult, id, bytes);
  if (host === 'reset-duplicate') send(Kind.MicrophoneResetResult, id, bytes);
  if (result === 'scheduled' && host !== 'reset-scheduled-only') {
    state = {
      ...state,
      epoch: state.epoch + 1n,
      revision: state.revision + 1n,
      timestampUs: state.timestampUs + 1n,
    };
    status();
  }
}
function receive({ kind, requestId, payload }) {
  if (requestId === 0n) throw new Error('FIXTURE_CORRELATION');
  if (kind === Kind.Hello) {
    if (!payload.equals(Buffer.from('0001000100000000', 'hex')))
      throw new Error('FIXTURE_HELLO');
    const header = Buffer.from('00018005', 'hex');
    const strings = [
      '0.1.0',
      'synthetic-microphone',
      '3.32.1',
      '3.32.1',
      'fake',
      'x64',
      'framed-pipes',
    ].flatMap((value) => {
      const bytes = Buffer.from(value),
        length = Buffer.alloc(2);
      length.writeUInt16BE(bytes.length);
      return [length, bytes];
    });
    send(
      Kind.HelloAck,
      requestId,
      Buffer.concat([
        header,
        ...strings,
        Buffer.from('0001000000000003', 'hex'),
      ]),
    );
  } else if (kind === Kind.Configure) {
    // Minimal bounded fake scenario selector; production/native config parsers are tested separately.
    if (
      host ||
      payload.length < 12 ||
      ![7, 8].includes(payload.readUInt16BE(0))
    )
      throw new Error('FIXTURE_CONFIG');
    const length = payload.readUInt16BE(2);
    if (
      !length ||
      length > 253 ||
      4 + length > payload.length ||
      (payload.readUInt32BE(payload.length - 4) & 48) !==
        (payload.readUInt16BE(0) === 8 ? 32 : 16)
    )
      throw new Error('FIXTURE_CONFIG');
    host = payload.subarray(4, 4 + length).toString('utf8');
    codec = payload.readUInt16BE(0) === 8 ? 'opus' : 'pcm';
    send(Kind.ConfigureAck, requestId);
  } else if (kind === Kind.Secret) {
    payload.fill(0);
    send(Kind.SecretAck, requestId);
  } else if (kind === Kind.Connect) {
    if (!host) throw new Error('FIXTURE_CONFIG');
    send(Kind.ConnectAck, requestId);
    send(Kind.State, 0n, Buffer.from('0003000000000000', 'hex'));
    status();
  } else if (kind === Kind.MicrophonePcm || kind === Kind.MicrophoneOpus) {
    if (!host || pending) throw new Error('FIXTURE_QUEUE_LIMIT');
    if ((kind === Kind.MicrophoneOpus ? 'opus' : 'pcm') !== codec)
      throw new Error('FIXTURE_PROFILE');
    const packet =
      kind === Kind.MicrophoneOpus
        ? decodeMicrophoneOpus(payload)
        : decodeMicrophonePcm(payload);
    const result = packet.epoch === state.epoch ? 'accepted' : 'stale';
    payload.fill(0);
    if (host === 'hold') pending = requestId;
    else {
      const reply = encodeMicrophoneResult(result);
      if (host === 'input-malformed') reply[2] = 1;
      send(Kind.MicrophoneResult, requestId, reply);
      if (host === 'input-duplicate')
        send(Kind.MicrophoneResult, requestId, reply);
    }
  } else if (kind === Kind.MicrophoneReset) {
    const epoch = decodeMicrophoneReset(payload);
    if (!host || pendingReset) throw new Error('FIXTURE_QUEUE_LIMIT');
    if (host === 'reset-hold') pendingReset = requestId;
    else
      resetResult(
        requestId,
        epoch !== state.epoch || host === 'reset-stale'
          ? 'stale'
          : host === 'reset-busy'
            ? 'busy'
            : host === 'reset-unavailable'
              ? 'unavailable'
              : 'scheduled',
      );
  } else if (kind === Kind.Heartbeat) {
    send(Kind.HeartbeatAck, requestId);
    if (pending) {
      send(Kind.MicrophoneResult, pending, encodeMicrophoneResult('accepted'));
      pending = undefined;
    }
    if (pendingReset) {
      resetResult(pendingReset, 'scheduled');
      pendingReset = undefined;
    }
  } else if (kind === Kind.Shutdown) {
    if (pendingReset) resetResult(pendingReset, 'unavailable');
    if (pending)
      send(
        Kind.MicrophoneResult,
        pending,
        encodeMicrophoneResult('unavailable'),
      );
    if (host) {
      state = {
        ...state,
        revision: state.revision + 1n,
        timestampUs: state.timestampUs + 1n,
        availability: 'closed',
      };
      status();
    }
    send(Kind.ShutdownAck, requestId);
    process.stdin.destroy();
    process.stdout.end();
  } else throw new Error('FIXTURE_KIND');
}
process.stdin.on('data', (bytes) => {
  try {
    decoder.push(bytes, receive);
  } catch {
    process.exit(2);
  }
});
process.stdin.on('end', () => {
  try {
    decoder.finish();
  } catch {
    process.exitCode = 2;
  }
});
process.stdin.on('error', () => process.exit(2));
process.stdout.on('error', () => process.exit(2));
