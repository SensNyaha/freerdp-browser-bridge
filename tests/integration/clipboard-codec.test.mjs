import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { join, sep } from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  SeqpacketOwner,
  loadPacketAddon,
} from '../../packages/node-bridge/dist/seqpacket-owner.js';
import {
  Kind,
  PacketDecoder,
  encodePacket,
  helloPayload,
  encodeClipboardCommand,
  decodeClipboardResult,
} from '../../packages/protocol/dist/index.js';
test(
  'native clipboard IPC: unselected commands return unavailable while heartbeat and shutdown remain healthy',
  { timeout: 10000 },
  async (t) => {
    const path = resolve(
      process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
      'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
    );
    const child = spawn(path, [], {
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
      signal: t.signal,
    });
    const closed = once(child, 'close'),
      decoder = new PacketDecoder(),
      packets = [];
    let invalid = false;
    let resolveReply;
    child.stdout.on('data', (data) => {
      try {
        decoder.push(data, (p) => {
          packets.push(p);
          const done = resolveReply;
          resolveReply = undefined;
          done?.(p);
        });
      } catch {
        invalid = true;
      }
    });
    child.stdin.on('error', () => {});
    const exchange = (bytes) => {
      const reply = new Promise((done) => {
        resolveReply = done;
      });
      child.stdin.write(bytes);
      return Promise.race([
        reply,
        closed.then(() => {
          throw new Error('Worker closed before reply');
        }),
      ]);
    };
    try {
      const records = [
        encodePacket({
          kind: Kind.Hello,
          requestId: 1n,
          payload: helloPayload(),
        }),
        encodePacket({
          kind: Kind.ClipboardCommand,
          requestId: 2n,
          payload: encodeClipboardCommand({
            operation: 'read',
            generation: 1n,
            revision: 1n,
            text: Buffer.alloc(0),
          }),
        }),
        encodePacket({
          kind: Kind.ClipboardCommand,
          requestId: 3n,
          payload: encodeClipboardCommand({
            operation: 'set',
            generation: 1n,
            revision: 0n,
            text: Buffer.from('Ж😀\n'),
          }),
        }),
        encodePacket({
          kind: Kind.Heartbeat,
          requestId: 4n,
          payload: Buffer.alloc(0),
        }),
        encodePacket({
          kind: Kind.Shutdown,
          requestId: 5n,
          payload: Buffer.alloc(0),
        }),
      ];
      for (const bytes of records) await exchange(bytes);
      child.stdin.end();
      assert.deepEqual(await closed, [0, null]);
      assert.equal(invalid, false);
      decoder.finish();
      assert.deepEqual(
        packets.map((p) => [p.kind, p.requestId]),
        [
          [Kind.HelloAck, 1n],
          [Kind.ClipboardResult, 2n],
          [Kind.ClipboardResult, 3n],
          [Kind.HeartbeatAck, 4n],
          [Kind.ShutdownAck, 5n],
        ],
      );
      for (const [i, operation, revision] of [
        [1, 'read', 1n],
        [2, 'set', 0n],
      ]) {
        assert.deepEqual(decodeClipboardResult(packets[i].payload), {
          operation,
          status: 'unavailable',
          generation: 1n,
          revision,
          text: Buffer.alloc(0),
        });
      }
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await closed.catch(() => {});
    }
  },
);
for (const transport of ['framed-pipes', 'unix-seqpacket-rws1']) {
  const directory = resolve(
    process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
  );
  test(
    'native clipboard carrier: full 16 MiB UTF8 command, heartbeat and cleanup / ' +
      transport,
    {
      timeout: 15000,
      skip:
        transport === 'unix-seqpacket-rws1' &&
        (process.platform !== 'linux' ||
          !existsSync(join(directory, 'rdp-ipc.node'))),
    },
    async (t) => {
      const root = await mkdtemp(join(tmpdir(), 'rdp-clipboard-carrier-'));
      let io, child, closed;
      const decoder = new PacketDecoder();
      let resolveReply,
        invalid = false;
      try {
        await writeFile(join(root, '.rdp-worker-owned'), 'runtime-v1');
        if (transport === 'unix-seqpacket-rws1') {
          io = await SeqpacketOwner.open(
            loadPacketAddon(join(directory, 'rdp-ipc.node')),
            { maxBytes: 16777216 + 65536 },
          );
          io.on('error', () => {});
        }
        child = spawn(
          join(
            directory,
            'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
          ),
          io ? ['--ipc-seqpacket-fd=3'] : [],
          {
            cwd: root,
            windowsHide: true,
            signal: t.signal,
            stdio: io
              ? ['ignore', 'ignore', 'pipe', io.childFd()]
              : ['pipe', 'pipe', 'pipe'],
          },
        );
        closed = once(child, 'close');
        child.stderr.resume();
        io?.closeChild();
        const input = io ?? child.stdin,
          output = io ?? child.stdout;
        input.on('error', () => {});
        output.on('data', (b) => {
          try {
            decoder.push(b, (p) => {
              const done = resolveReply;
              resolveReply = undefined;
              done?.(p);
            });
          } catch {
            invalid = true;
          }
        });
        io?.resume();
        const request = (kind, id, payload = Buffer.alloc(0)) => {
          const result = new Promise((done, reject) => {
            resolveReply = done;
            input.write(
              encodePacket({ kind, requestId: id, payload }),
              (error) => {
                if (error) reject(error);
              },
            );
          });
          return Promise.race([
            result,
            closed.then(() => {
              throw new Error('Worker closed before reply');
            }),
          ]);
        };
        assert.equal(
          (await request(Kind.Hello, 1n, helloPayload())).kind,
          Kind.HelloAck,
        );
        const text = Buffer.alloc(16777216);
        text.fill(Buffer.from([0xe4, 0xb8, 0xad]));
        text[text.length - 1] = 65;
        const body = encodeClipboardCommand({
          operation: 'set',
          generation: 1n,
          revision: 0n,
          text,
        });
        const reply = await request(Kind.ClipboardCommand, 2n, body);
        assert.equal(reply.kind, Kind.ClipboardResult);
        assert.equal(
          decodeClipboardResult(reply.payload).status,
          'unavailable',
        );
        body.fill(0);
        text.fill(0);
        assert.equal(
          (await request(Kind.Heartbeat, 3n)).kind,
          Kind.HeartbeatAck,
        );
        assert.equal((await request(Kind.Shutdown, 4n)).kind, Kind.ShutdownAck);
        assert.deepEqual(await closed, [0, null]);
        decoder.finish();
        assert.equal(invalid, false);
        assert.equal(existsSync(root), false);
      } finally {
        io?.destroy();
        if (io) await io.retired;
        if (child && child.exitCode === null && child.signalCode === null)
          child.kill();
        if (closed) await closed.catch(() => {});
        if (
          !root.startsWith(resolve(tmpdir()) + sep + 'rdp-clipboard-carrier-')
        )
          throw new Error('Invalid test root');
        await rm(root, { recursive: true, force: true });
      }
    },
  );
}
