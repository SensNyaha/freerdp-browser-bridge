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
  encodeAudioReset,
  decodeAudioResetResult,
} from '../../packages/protocol/dist/index.js';

test(
  'native lifecycle: prepared audio reset returns unavailable with healthy heartbeat and shutdown',
  { timeout: 10000 },
  async (t) => {
    const binary = resolve(
      process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
      'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
    );
    const child = spawn(binary, [], {
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
      signal: t.signal,
    });
    const closed = once(child, 'close');
    const decoder = new PacketDecoder();
    const records = [];
    let invalid = false;
    child.stdout.on('data', (bytes) => {
      try {
        decoder.push(bytes, (record) => {
          if (records.length >= 8) throw new Error('limit');
          records.push(record);
        });
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
            kind: Kind.AudioReset,
            requestId: 2n,
            payload: encodeAudioReset(1n),
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
      assert.deepEqual(
        records.map((p) => [p.kind, p.requestId]),
        [
          [Kind.HelloAck, 1n],
          [Kind.AudioResetResult, 2n],
          [Kind.HeartbeatAck, 3n],
          [Kind.ShutdownAck, 4n],
        ],
      );
      assert.equal(decodeAudioResetResult(records[1].payload), 'unavailable');
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await closed.catch(() => {});
    }
  },
);
