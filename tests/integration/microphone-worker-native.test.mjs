import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { eventually } from '../fixtures/session-worker.mjs';
import { createRdpTlsFixture } from '../fixtures/rdp-tls.mjs';
import {
  NativeSessionWorker,
  SessionManager,
} from '../../packages/node-bridge/dist/index.js';
import {
  Kind,
  PacketDecoder,
  encodePacket,
  helloPayload,
  encodeConnectionSettings,
  decodeConnectionState,
  decodeMicrophoneState,
  encodeMicrophonePcm,
  decodeMicrophoneResult,
  encodeMicrophoneReset,
  decodeMicrophoneResetResult,
} from '../../packages/protocol/dist/index.js';

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
  ).capabilities.pcmInput;

for (const output of ['off', 'pcm', 'opus'])
  test(
    `actual native session microphone/${output} output preserves strict TLS and bounded cleanup`,
    { skip: !available, timeout: 15000 },
    async () => {
      const endpoint = await createRdpTlsFixture();
      const runtimeRoot = await mkdtemp(
        join(tmpdir(), 'bridge-microphone-session-'),
      );
      const principal = { id: 'native-microphone-fixture' };
      let source;
      const manager = new SessionManager({
        workerFactory: () => {
          const worker = new NativeSessionWorker({ workerPath, runtimeRoot });
          worker.onMicrophone((state) => {
            source = state;
          });
          return worker;
        },
      });
      try {
        const created = manager.create(
          {
            target: { host: '127.0.0.1', port: endpoint.port },
            auth: { username: 'synthetic', password: 'synthetic-IPC-sentinel' },
            security: { protocol: 'tls', certificatePolicy: 'strict' },
            media: { microphone: 'pcm', audioOutput: output },
            timeouts: { connectMs: 5000 },
          },
          principal,
          '127.0.0.1',
        );
        await eventually(
          () => manager.get(created.sessionId, principal).state === 'failed',
        );
        assert.equal(
          manager.get(created.sessionId, principal).error.code,
          'RDP_CERTIFICATE_REJECTED',
        );
        assert.equal(endpoint.applicationBytes, 0);
        assert.equal(source.enabled, true);
        assert.equal(source.availability, 'closed');
        assert.equal(source.epoch, 0n);
        await manager.shutdown();
        assert.deepEqual(await readdir(runtimeRoot), []);
      } finally {
        await manager.shutdown();
        await endpoint.close();
        await rm(runtimeRoot, { recursive: true, force: true, maxRetries: 3 });
      }
    },
  );

for (const output of ['off', 'pcm', 'opus'])
  test(
    `actual native private microphone/${output} output retires on strict TLS refusal without device capture`,
    { skip: !available, timeout: 15000 },
    async (t) => {
      const endpoint = await createRdpTlsFixture();
      const directory = await mkdtemp(
        join(tmpdir(), 'bridge-microphone-native-'),
      );
      const child = spawn(workerPath, [], {
        cwd: directory,
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
      const request = async (
        kind,
        expected,
        requestId,
        payload = Buffer.alloc(0),
      ) => {
        child.stdin.write(encodePacket({ kind, requestId, payload }));
        await eventually(() =>
          packets.some((p) => p.kind === expected && p.requestId === requestId),
        );
        return packets.find(
          (p) => p.kind === expected && p.requestId === requestId,
        );
      };
      try {
        await request(Kind.Hello, Kind.HelloAck, 1n, helloPayload());
        const reset = await request(
          Kind.MicrophoneReset,
          Kind.MicrophoneResetResult,
          9n,
          encodeMicrophoneReset(1n),
        );
        assert.equal(decodeMicrophoneResetResult(reset.payload), 'unavailable');
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
            pcmInput: true,
            pcmOutput: output === 'pcm',
            opusOutput: output === 'opus',
          }),
        );
        const pcm = encodeMicrophonePcm({
          epoch: 1n,
          timestampUs: 0n,
          discontinuity: true,
          pcm: Buffer.alloc(3840),
        });
        const early = await request(
          Kind.MicrophonePcm,
          Kind.MicrophoneResult,
          3n,
          pcm,
        );
        assert.equal(decodeMicrophoneResult(early.payload), 'unavailable');
        const syntheticSecret = Buffer.from('synthetic-IPC-sentinel');
        try {
          await request(Kind.Secret, Kind.SecretAck, 4n, syntheticSecret);
        } finally {
          syntheticSecret.fill(0);
        }
        await request(Kind.Connect, Kind.ConnectAck, 5n);
        await eventually(
          () =>
            packets.some(
              (p) =>
                p.kind === Kind.State &&
                decodeConnectionState(p.payload).state === 'failed',
            ),
          6000,
        );
        const states = packets
          .filter((p) => p.kind === Kind.State)
          .map((p) => decodeConnectionState(p.payload));
        assert.equal(states.at(-1).error, 'RDP_CERTIFICATE_REJECTED');
        const microphone = packets.filter(
          (p) => p.kind === Kind.MicrophoneState,
        );
        assert.equal(microphone.length, 1);
        assert.equal(microphone[0].requestId, 0n);
        const state = decodeMicrophoneState(microphone[0].payload);
        assert.equal(state.enabled, true);
        assert.equal(state.availability, 'closed');
        assert.equal(state.epoch, 0n);
        assert.ok(
          packets.indexOf(microphone[0]) <
            packets.findIndex(
              (p) =>
                p.kind === Kind.State &&
                decodeConnectionState(p.payload).state === 'failed',
            ),
        );
        assert.equal(
          packets.filter((p) => p.kind === Kind.AudioState).length,
          output === 'off' ? 0 : 1,
        );
        assert.equal(
          packets.some((p) => [Kind.AudioPcm, Kind.AudioOpus].includes(p.kind)),
          false,
        );
        assert.equal(endpoint.applicationBytes, 0);
        const late = await request(
          Kind.MicrophonePcm,
          Kind.MicrophoneResult,
          6n,
          pcm,
        );
        assert.equal(decodeMicrophoneResult(late.payload), 'unavailable');
        await request(Kind.Heartbeat, Kind.HeartbeatAck, 7n);
        await request(Kind.Shutdown, Kind.ShutdownAck, 8n);
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
