import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { eventually } from '../fixtures/session-worker.mjs';
import { createRdpTlsFixture } from '../fixtures/rdp-tls.mjs';
import {
  Kind,
  PacketDecoder,
  encodePacket,
  helloPayload,
  encodeConnectionSettings,
  decodeConnectionState,
  encodeAudioReset,
  decodeAudioResetResult,
} from '../../packages/protocol/dist/index.js';
import { OpusSource } from '../../packages/node-bridge/dist/opus-source.js';

const workerPath = resolve(
  process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
  'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
);
const available =
  process.platform === 'win32' &&
  JSON.parse(
    execFileSync(workerPath, ['--capabilities'], {
      encoding: 'utf8',
      windowsHide: true,
    }),
  ).capabilities.opusOutput;

test(
  'actual native Opus profile retires codec-1 source on strict TLS refusal and keeps control healthy',
  { skip: !available, timeout: 15000 },
  async (t) => {
    const endpoint = await createRdpTlsFixture();
    const directory = await mkdtemp(join(tmpdir(), 'bridge-opus-native-'));
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
        decoder.push(bytes, (packet) => {
          if (packets.length >= 32)
            throw new Error('Bounded fixture record limit');
          packets.push(packet);
        });
      } catch {
        invalid = true;
      }
    });
    child.stdin.on('error', () => {});
    const request = async (kind, ack, requestId, payload = Buffer.alloc(0)) => {
      child.stdin.write(encodePacket({ kind, requestId, payload }));
      await eventually(() =>
        packets.some(
          (packet) => packet.kind === ack && packet.requestId === requestId,
        ),
      );
    };
    try {
      await request(Kind.Hello, Kind.HelloAck, 1n, helloPayload());
      await request(
        Kind.Configure,
        Kind.ConfigureAck,
        2n,
        encodeConnectionSettings({
          host: '127.0.0.1',
          username: 'synthetic',
          domain: '',
          port: endpoint.port,
          width: 1024,
          height: 768,
          colorDepth: 32,
          security: 2,
          certificatePolicy: 0,
          minimumTls: 2,
          connectMs: 5000,
          tcpAckMs: 1000,
          opusOutput: true,
        }),
      );
      const syntheticSecret = Buffer.from('synthetic-IPC-sentinel');
      try {
        await request(Kind.Secret, Kind.SecretAck, 3n, syntheticSecret);
      } finally {
        syntheticSecret.fill(0);
      }
      await request(Kind.Connect, Kind.ConnectAck, 4n);
      await eventually(
        () =>
          packets.some(
            (packet) =>
              packet.kind === Kind.State &&
              decodeConnectionState(packet.payload).state === 'failed',
          ),
        6000,
      );
      const terminal = packets
        .filter((packet) => packet.kind === Kind.State)
        .map((packet) => decodeConnectionState(packet.payload));
      assert.equal(terminal.at(-1).error, 'RDP_CERTIFICATE_REJECTED');
      const audio = packets.filter((packet) =>
        [
          Kind.AudioState,
          Kind.AudioConfig,
          Kind.AudioPcm,
          Kind.AudioOpus,
        ].includes(packet.kind),
      );
      assert.equal(audio.length, 1);
      assert.equal(audio[0].kind, Kind.AudioState);
      assert.equal(audio[0].requestId, 0n);
      const source = new OpusSource();
      assert.equal(
        source.accept(audio[0].kind, audio[0].payload).state.availability,
        'closed',
      );
      assert.equal(source.current.enabled, true);
      assert.equal(endpoint.applicationBytes, 0);
      await request(
        Kind.AudioReset,
        Kind.AudioResetResult,
        7n,
        encodeAudioReset(source.current.epoch),
      );
      assert.equal(
        decodeAudioResetResult(
          packets.find((p) => p.kind === Kind.AudioResetResult).payload,
        ),
        'unavailable',
      );
      await request(Kind.Heartbeat, Kind.HeartbeatAck, 5n);
      await request(Kind.Shutdown, Kind.ShutdownAck, 6n);
      child.stdin.end();
      const [code, signal] = await closed;
      assert.equal(code, 0);
      assert.equal(signal, null);
      assert.equal(invalid, false);
      decoder.finish();
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await closed.catch(() => {});
      await endpoint.close();
      await rm(directory, { recursive: true, force: true, maxRetries: 3 });
    }
  },
);
