import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { eventually } from '../fixtures/session-worker.mjs';
import {
  Kind,
  PacketDecoder,
  encodePacket,
  helloPayload,
  decodeBuild,
  encodeMicrophoneOpus,
  decodeMicrophoneResult,
  encodeConnectionSettings,
} from '../../packages/protocol/dist/index.js';
const path = resolve(
  process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
  'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
);
async function run(t, body) {
  const directory = await mkdtemp(join(tmpdir(), 'bridge-opus-mic-envelope-'));
  const child = spawn(path, [], {
    cwd: directory,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'ignore'],
    signal: t.signal,
  });
  const closed = once(child, 'close'),
    decoder = new PacketDecoder(),
    packets = [];
  let invalid = false;
  child.stdout.on('data', (bytes) => {
    try {
      decoder.push(bytes, (p) => {
        if (packets.length >= 16) throw new Error('Fixture bound');
        packets.push(p);
      });
    } catch {
      invalid = true;
    }
  });
  child.stdin.on('error', () => {});
  const request = async (kind, expected, id, payload = Buffer.alloc(0)) => {
    child.stdin.write(encodePacket({ kind, requestId: id, payload }));
    await eventually(() => {
      if (invalid) throw new Error('Native fixture parser failed');
      if (packets.some((p) => p.kind === expected && p.requestId === id))
        return true;
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error('Native fixture ended before reply: ' + child.exitCode);
      return false;
    });
    return packets.find((p) => p.kind === expected && p.requestId === id);
  };
  try {
    const hello = await request(Kind.Hello, Kind.HelloAck, 1n, helloPayload());
    await body({
      child,
      closed,
      request,
      build: decodeBuild(hello.payload),
    });
    assert.equal(invalid, false);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.stdin.end();
      await closed;
    }
    assert.equal(dirname(directory), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('bridge-opus-mic-envelope-'));
    await rm(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}
test(
  'actual native lifecycle: prepared Opus input returns unavailable with bounded correlation and preserves heartbeat/shutdown',
  { timeout: 15000 },
  async (t) =>
    run(t, async ({ request, closed, build }) => {
      assert.equal(
        build.capabilities.opusInput,
        build.capabilities.microphoneReset,
      );
      for (const [id, length] of [
        [2n, 2],
        [3n, 1275],
      ]) {
        const payload = encodeMicrophoneOpus({
          epoch: 1n,
          timestampUs: 0n,
          discontinuity: true,
          lookaheadFrames: 312,
          encoded: Buffer.alloc(length, 0xfc),
        });
        const result = await request(
          Kind.MicrophoneOpus,
          Kind.MicrophoneResult,
          id,
          payload,
        );
        assert.equal(decodeMicrophoneResult(result.payload), 'unavailable');
      }
      await request(Kind.Heartbeat, Kind.HeartbeatAck, 4n);
      await request(Kind.Shutdown, Kind.ShutdownAck, 5n);
      assert.deepEqual(await closed, [0, null]);
    }),
);
test(
  'actual native lifecycle: raw schema-8 Opus selection is Windows gated and inactive before RDP connect',
  { timeout: 15000 },
  async (t) =>
    run(t, async ({ child, closed, build, request }) => {
      const bytes = encodeConnectionSettings({
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
        connectMs: 5000,
        tcpAckMs: 1000,
        opusInput: true,
      });
      if (build.capabilities.pcmInput) {
        await request(Kind.Configure, Kind.ConfigureAck, 2n, bytes);
        const result = await request(
          Kind.MicrophoneOpus,
          Kind.MicrophoneResult,
          3n,
          encodeMicrophoneOpus({
            epoch: 1n,
            timestampUs: 0n,
            discontinuity: true,
            lookaheadFrames: 312,
            encoded: Buffer.from([0xfc, 0xff]),
          }),
        );
        assert.equal(decodeMicrophoneResult(result.payload), 'unavailable');
        await request(Kind.Heartbeat, Kind.HeartbeatAck, 4n);
        await request(Kind.Shutdown, Kind.ShutdownAck, 5n);
        assert.deepEqual(await closed, [0, null]);
      } else {
        child.stdin.write(
          encodePacket({ kind: Kind.Configure, requestId: 2n, payload: bytes }),
        );
        assert.deepEqual(await closed, [2, null]);
      }
      assert.equal(
        build.capabilities.opusInput,
        build.capabilities.microphoneReset,
      );
    }),
);
