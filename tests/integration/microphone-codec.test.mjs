import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import {
  Kind,
  PacketDecoder,
  encodePacket,
  helloPayload,
  encodeMicrophonePcm,
  decodeMicrophoneResult,
} from '../../packages/protocol/dist/index.js';

test(
  'native lifecycle: microphone PCM dispatch explicitly unavailable preserves heartbeat and shutdown',
  { timeout: 10000 },
  async (t) => {
    const worker = resolve(
      process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
      'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
    );
    const child = spawn(worker, [], {
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
      signal: t.signal,
    });
    const closed = once(child, 'close'),
      decoder = new PacketDecoder(),
      packets = [];
    let invalid = false;
    child.stdout.on('data', (bytes) => {
      try {
        decoder.push(bytes, (packet) => packets.push(packet));
      } catch {
        invalid = true;
      }
    });
    child.stdin.on('error', () => {});
    try {
      child.stdin.end(
        Buffer.concat([
          encodePacket({
            kind: Kind.Hello,
            requestId: 1n,
            payload: helloPayload(),
          }),
          encodePacket({
            kind: Kind.MicrophonePcm,
            requestId: 2n,
            payload: encodeMicrophonePcm({
              epoch: 1n,
              timestampUs: 0n,
              discontinuity: true,
              pcm: Buffer.alloc(3840),
            }),
          }),
          encodePacket({
            kind: Kind.Heartbeat,
            requestId: 3n,
            payload: Buffer.alloc(0),
          }),
          encodePacket({
            kind: Kind.Shutdown,
            requestId: 4n,
            payload: Buffer.alloc(0),
          }),
        ]),
      );
      const [code, signal] = await closed;
      assert.equal(code, 0);
      assert.equal(signal, null);
      assert.equal(invalid, false);
      decoder.finish();
      assert.equal(packets.length, 4);
      assert.deepEqual(
        packets.map((p) => [p.kind, p.requestId]),
        [
          [Kind.HelloAck, 1n],
          [Kind.MicrophoneResult, 2n],
          [Kind.HeartbeatAck, 3n],
          [Kind.ShutdownAck, 4n],
        ],
      );
      assert.equal(decodeMicrophoneResult(packets[1].payload), 'unavailable');
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await closed.catch(() => {});
    }
  },
);
