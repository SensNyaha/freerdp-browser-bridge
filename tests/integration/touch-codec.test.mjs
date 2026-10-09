import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import {
  Kind,
  PacketDecoder,
  decodeBuild,
  encodePacket,
  encodeTouchInput,
  helloPayload,
} from '../../packages/protocol/dist/index.js';

test(
  'native lifecycle: touch codec is recognized but unsupported dispatch is refused without activation',
  { timeout: 10000 },
  async (t) => {
    const workerPath = resolve(
      process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
      'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
    );
    const child = spawn(workerPath, [], {
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
      signal: t.signal,
    });
    const closed = once(child, 'close');
    const decoder = new PacketDecoder();
    const packets = [];
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
            kind: Kind.InputTouch,
            requestId: 2n,
            payload: encodeTouchInput({
              action: 'begin',
              contactId: 1,
              x: 0,
              y: 0,
            }),
          }),
        ]),
      );
      const [code, signal] = await closed;
      assert.equal(code, 2);
      assert.equal(signal, null);
      assert.equal(invalid, false);
      decoder.finish();
      assert.equal(packets.length, 2);
      assert.equal(packets[0].kind, Kind.HelloAck);
      assert.equal(packets[0].requestId, 1n);
      assert.equal(
        Object.hasOwn(decodeBuild(packets[0].payload).capabilities, 'touch'),
        false,
      );
      assert.equal(packets[1].kind, Kind.Error);
      assert.equal(packets[1].requestId, 2n);
      assert.equal(packets[1].payload.readUInt32BE(0), 3);
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await closed.catch(() => {});
    }
  },
);
