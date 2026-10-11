import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { eventually } from '../fixtures/session-worker.mjs';
import {
  Kind,
  PacketDecoder,
  decodeBuild,
  encodePacket,
  encodeConnectionSettings,
  helloPayload,
} from '../../packages/protocol/dist/index.js';

test(
  'native lifecycle: preparatory Opus configuration is refused before secret/connect',
  { timeout: 10000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'bridge-opus-config-'));
    const workerPath = resolve(
      process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
      'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
    );
    const child = spawn(workerPath, [], {
      cwd: directory,
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
      child.stdin.write(
        encodePacket({
          kind: Kind.Hello,
          requestId: 1n,
          payload: helloPayload(),
        }),
      );
      await eventually(() => packets.length === 1);
      assert.equal(packets[0].kind, Kind.HelloAck);
      const core = decodeBuild(packets[0].payload).capabilities.connectCore;
      child.stdin.end(
        encodePacket({
          kind: Kind.Configure,
          requestId: 2n,
          payload: encodeConnectionSettings({
            host: '127.0.0.1',
            username: 'synthetic',
            domain: '',
            port: 3389,
            width: 1024,
            height: 768,
            colorDepth: 32,
            security: 2,
            certificatePolicy: 0,
            minimumTls: 2,
            connectMs: 1000,
            tcpAckMs: 1000,
            opusOutput: true,
          }),
        }),
      );
      const [code, signal] = await closed;
      assert.equal(code, 2);
      assert.equal(signal, null);
      assert.equal(invalid, false);
      decoder.finish();
      assert.equal(packets.length, core ? 1 : 2);
      assert.equal(
        packets.some((packet) =>
          [
            Kind.ConfigureAck,
            Kind.SecretAck,
            Kind.ConnectAck,
            Kind.AudioState,
          ].includes(packet.kind),
        ),
        false,
      );
      if (!core) {
        assert.equal(packets[1].kind, Kind.Error);
        assert.equal(packets[1].requestId, 2n);
        assert.equal(packets[1].payload.readUInt32BE(0), 3);
      }
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await closed.catch(() => {});
      await rm(directory, { recursive: true, force: true, maxRetries: 3 });
    }
  },
);
