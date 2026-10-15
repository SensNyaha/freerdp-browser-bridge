import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createRdpTlsFixture } from '../fixtures/rdp-tls.mjs';
import {
  Kind,
  PacketDecoder,
  encodePacket,
  helloPayload,
  encodeConnectionSettings,
  decodeConnectionState,
  encodeClipboardCommand,
  decodeClipboardResult,
  decodeClipboardState,
} from '../../packages/protocol/dist/index.js';

const workerPath = resolve(
  process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
  'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
);
const available = JSON.parse(
  execFileSync(workerPath, ['--capabilities'], {
    encoding: 'utf8',
    windowsHide: true,
  }),
).capabilities.connectCore;

for (const mode of ['to', 'from', 'both', 'cancel'])
  test(
    'actual native raw clipboard selection: ' +
      mode +
      ' / strict TLS and retirement',
    { skip: !available, timeout: 15000 },
    async (t) => {
      const endpoint = await createRdpTlsFixture();
      const directory = await mkdtemp(join(tmpdir(), 'rdp-clipboard-native-'));
      let child, closed;
      try {
        child = spawn(workerPath, [], {
          cwd: directory,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'ignore'],
          signal: t.signal,
        });
        closed = once(child, 'close');
        const decoder = new PacketDecoder(),
          packets = [];
        let invalid = false;
        child.stdin.on('error', () => {});
        child.stdout.on('data', (bytes) => {
          try {
            decoder.push(bytes, (p) => {
              if (packets.length >= 48)
                throw new Error('Fixture record budget');
              packets.push(p);
            });
          } catch {
            invalid = true;
          }
        });
        const wait = async (predicate, milliseconds = 6000) => {
          const deadline = Date.now() + milliseconds;
          while (!predicate()) {
            assert.equal(invalid, false);
            if (
              Date.now() >= deadline ||
              child.exitCode !== null ||
              child.signalCode !== null
            )
              throw new Error(
                'Native clipboard fixture completion unavailable',
              );
            await delay(5);
          }
        };
        const request = async (
          kind,
          expected,
          requestId,
          payload = Buffer.alloc(0),
        ) => {
          child.stdin.write(encodePacket({ kind, requestId, payload }));
          await wait(() =>
            packets.some(
              (p) => p.kind === expected && p.requestId === requestId,
            ),
          );
          return packets.find(
            (p) => p.kind === expected && p.requestId === requestId,
          );
        };
        await request(Kind.Hello, Kind.HelloAck, 1n, helloPayload());
        const baseline = encodeConnectionSettings({
          host: '127.0.0.1',
          port: endpoint.port,
          username: 'synthetic',
          domain: '',
          width: 1024,
          height: 768,
          colorDepth: 32,
          security: 2,
          certificatePolicy: mode === 'cancel' ? 1 : 0,
          minimumTls: 2,
          connectMs: 5000,
          tcpAckMs: 1000,
          dynamicResolution: true,
          pcmInput: mode === 'both',
          opusOutput: mode === 'both',
          audioBuffer200: mode === 'both',
        });
        const config = Buffer.concat([baseline, Buffer.alloc(4)]);
        config.writeUInt16BE(10, 0);
        const flagsAt = baseline.length - 4;
        const directions = mode === 'to' ? 128 : mode === 'from' ? 256 : 384;
        config.writeUInt32BE(
          config.readUInt32BE(flagsAt) | directions,
          flagsAt,
        );
        config.writeUInt32BE(1024, config.length - 4);
        await request(Kind.Configure, Kind.ConfigureAck, 2n, config);
        const command = encodeClipboardCommand({
          operation: 'set',
          generation: 1n,
          revision: 0n,
          text: Buffer.from('synthetic clipboard sentinel'),
        });
        const early = await request(
          Kind.ClipboardCommand,
          Kind.ClipboardResult,
          3n,
          command,
        );
        assert.equal(
          decodeClipboardResult(early.payload).status,
          'unavailable',
        );
        const secret = Buffer.from('synthetic private IPC sentinel');
        try {
          await request(Kind.Secret, Kind.SecretAck, 4n, secret);
        } finally {
          secret.fill(0);
        }
        await request(Kind.Connect, Kind.ConnectAck, 5n);
        if (mode === 'cancel') {
          await wait(() => packets.some((p) => p.kind === Kind.Certificate));
        } else {
          await wait(() =>
            packets.some(
              (p) =>
                p.kind === Kind.State &&
                decodeConnectionState(p.payload).state === 'failed',
            ),
          );
          const states = packets
            .filter((p) => p.kind === Kind.State)
            .map((p) => decodeConnectionState(p.payload));
          assert.equal(states.at(-1).error, 'RDP_CERTIFICATE_REJECTED');
        }
        const snapshots = packets.filter((p) => p.kind === Kind.ClipboardState);
        assert.equal(snapshots.length, 1);
        assert.equal(snapshots[0].requestId, 0n);
        const state = decodeClipboardState(snapshots[0].payload);
        assert.equal(state.generation, 1n);
        assert.equal(state.maximum, 1024);
        assert.equal(state.ready, false);
        assert.equal(state.toServer, mode !== 'from');
        assert.equal(state.fromServer, mode !== 'to');
        const late = await request(
          Kind.ClipboardCommand,
          Kind.ClipboardResult,
          6n,
          command,
        );
        const result = decodeClipboardResult(late.payload);
        assert.equal(result.status, 'unavailable');
        assert.equal(result.text.length, 0);
        command.fill(0);
        assert.equal(endpoint.applicationBytes, 0);
        await request(Kind.Heartbeat, Kind.HeartbeatAck, 7n);
        await request(Kind.Shutdown, Kind.ShutdownAck, 8n);
        child.stdin.end();
        assert.deepEqual(await closed, [0, null]);
        decoder.finish();
        assert.equal(invalid, false);
        assert.equal(
          packets.some(
            (p) =>
              p.kind === Kind.ClipboardResult &&
              decodeClipboardResult(p.payload).status === 'accepted',
          ),
          false,
        );
        assert.deepEqual(await readdir(directory), []);
      } finally {
        if (child && child.exitCode === null && child.signalCode === null)
          child.kill();
        await closed?.catch(() => {});
        await endpoint.close();
        const root = resolve(directory);
        if (!root.startsWith(resolve(tmpdir()) + sep + 'rdp-clipboard-native-'))
          throw new Error('Invalid owned fixture directory');
        await rm(root, { recursive: true, force: true, maxRetries: 3 });
      }
    },
  );
