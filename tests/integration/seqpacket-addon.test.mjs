import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeSync } from 'node:fs';
import { mkdtemp, readdir, writeFile, rm, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { Worker } from 'node:worker_threads';
import {
  Kind,
  encodePacket,
  helloPayload,
  PacketDecoder,
  decodeBuild,
} from '../../packages/protocol/dist/index.js';

const binaryDir = resolve(
  process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
);
const modulePath = join(binaryDir, 'rdp-ipc.node');
const skip = process.platform !== 'linux' || !existsSync(modulePath);
const addon = skip ? undefined : createRequire(import.meta.url)(modulePath);
const workerPath = join(binaryDir, 'rdp-worker');
const fdCount = async () => (await readdir('/proc/self/fd')).length;
async function closeWatched(id) {
  addon.close(id);
  const due = Date.now() + 1000;
  while (!addon.closed(id) && Date.now() < due) await delay(2);
  assert.equal(addon.closed(id), true);
}
async function deadline(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('readiness fixture deadline')),
          3000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function write(id, packet) {
  const due = Date.now() + 2000;
  let done = addon.write(id, packet);
  while (!done && Date.now() < due) {
    await delay(2);
    done = addon.flush(id);
  }
  assert.equal(done, true);
}
async function read(id) {
  const decoder = new PacketDecoder();
  let packet;
  const due = Date.now() + 2000;
  while (!packet && Date.now() < due) {
    const bytes = addon.read(id);
    assert.notEqual(bytes, undefined, 'unexpected packet EOF');
    if (bytes === null) await delay(2);
    else
      decoder.push(bytes, (value) => {
        assert.equal(packet, undefined);
        packet = value;
      });
  }
  assert.ok(packet);
  decoder.finish();
  return packet;
}
async function withWorker(run) {
  const root = await mkdtemp(join(tmpdir(), 'rdp-node-packet-'));
  const id = addon.create();
  let child;
  let closed;
  try {
    await writeFile(join(root, '.rdp-worker-owned'), 'runtime-v1');
    child = spawn(workerPath, ['--ipc-seqpacket-fd=3'], {
      cwd: root,
      stdio: ['ignore', 'ignore', 'pipe', addon.childFd(id)],
    });
    closed = once(child, 'close');
    child.stderr.resume();
    addon.closeChild(id);
    await run(id, closed);
    assert.equal(existsSync(root), false);
  } finally {
    addon.close(id);
    if (child && child.exitCode === null) child.kill('SIGKILL');
    if (closed) await closed;
    await rm(root, { recursive: true, force: true });
  }
}

test(
  'prepared Node IPC-only addon: real inherited packet worker hello/heartbeat/shutdown and cleanup',
  { skip, timeout: 30000 },
  async () => {
    const before = await fdCount();
    assert.equal(addon.schemaVersion, 1);
    for (let i = 0; i < 10; ++i) {
      await withWorker(async (id, closed) => {
        await write(
          id,
          encodePacket({
            kind: Kind.Hello,
            requestId: 1n,
            payload: helloPayload(),
          }),
        );
        const hello = await read(id);
        assert.equal(hello.kind, Kind.HelloAck);
        assert.equal(
          decodeBuild(hello.payload).transport,
          'unix-seqpacket-rws1',
        );
        await write(
          id,
          encodePacket({
            kind: Kind.Heartbeat,
            requestId: 2n,
            payload: Buffer.alloc(0),
          }),
        );
        assert.equal((await read(id)).kind, Kind.HeartbeatAck);
        await write(
          id,
          encodePacket({
            kind: Kind.Shutdown,
            requestId: 3n,
            payload: Buffer.alloc(0),
          }),
        );
        assert.equal((await read(id)).kind, Kind.ShutdownAck);
        assert.deepEqual(await closed, [0, null]);
        assert.equal(addon.read(id), undefined);
      });
    }
    assert.equal(await fdCount(), before);
    assert.doesNotMatch(
      await readFile('/proc/self/maps', 'utf8'),
      /\/lib(?:freerdp|winpr)[^/\s]*\.so/,
    );
  },
);
test(
  'prepared Node packet addon: fixed pair capacity, monotonic handles and stale close preserve replacement',
  { skip },
  async () => {
    const before = await fdCount();
    const ids = [];
    try {
      for (let i = 0; i < 32; ++i) ids.push(addon.create());
      assert.throws(() => addon.create(), { code: 'IPC_ADAPTER_FAILURE' });
      const old = ids.shift();
      assert.equal(addon.close(old), true);
      const replacement = addon.create();
      ids.push(replacement);
      assert.ok(replacement > old);
      assert.equal(addon.close(old), false);
      assert.ok(addon.childFd(replacement) >= 0);
      assert.throws(() => addon.read(NaN), { code: 'IPC_ADAPTER_FAILURE' });
      assert.throws(() => addon.read(1.5), { code: 'IPC_ADAPTER_FAILURE' });
    } finally {
      for (const id of ids) addon.close(id);
    }
    assert.equal(await fdCount(), before);
  },
);
test(
  'prepared Node packet addon: malformed records and uncertain pending overwrite are terminal and wipe retained storage',
  { skip },
  async () => {
    const id = addon.create();
    try {
      assert.throws(() => addon.write(id, Buffer.alloc(24)), {
        code: 'IPC_ADAPTER_FAILURE',
      });
      assert.throws(() => addon.read(id), { code: 'IPC_ADAPTER_FAILURE' });
    } finally {
      addon.close(id);
    }
    const stalled = addon.create();
    const wire = encodePacket({
      kind: Kind.Frame,
      requestId: 1n,
      payload: Buffer.alloc(8 * 1024 * 1024, 0x55),
    });
    try {
      assert.equal(addon.write(stalled, wire), false);
      assert.throws(
        () =>
          addon.write(
            stalled,
            encodePacket({
              kind: Kind.Heartbeat,
              requestId: 2n,
              payload: Buffer.alloc(0),
            }),
          ),
        { code: 'IPC_ADAPTER_FAILURE' },
      );
      assert.ok(wire.every((value) => value === 0));
      assert.throws(() => addon.flush(stalled), {
        code: 'IPC_ADAPTER_FAILURE',
      });
    } finally {
      addon.close(stalled);
    }
  },
);
test(
  'prepared Node packet addon: per-environment cleanup closes unclosed pairs on worker-thread exit',
  { skip, timeout: 10000 },
  async () => {
    const before = await fdCount();
    const worker = new Worker(
      `const {workerData}=require('node:worker_threads');const addon=require(workerData);const ids=[];for(let i=0;i<32;i++)ids.push(addon.create());const wire=Buffer.alloc(24+8*1024*1024);wire.write('RWI1');wire.writeUInt16BE(1,4);wire.writeUInt16BE(19,6);wire.writeBigUInt64BE(1n,12);wire.writeUInt32BE(8*1024*1024,20);addon.write(ids[0],wire);`,
      { eval: true, workerData: modulePath },
    );
    assert.deepEqual(await once(worker, 'exit'), [0]);
    await delay(30);
    assert.equal(await fdCount(), before);
  },
);
test(
  'prepared Node packet addon: original send/partial receive deadlines latch failure and discard retained bytes',
  { skip, timeout: 10000 },
  async () => {
    const id = addon.create();
    const wire = encodePacket({
      kind: Kind.Frame,
      requestId: 1n,
      payload: Buffer.alloc(8 * 1024 * 1024, 0x55),
    });
    try {
      assert.equal(addon.write(id, wire), false);
      await delay(1050);
      assert.throws(() => addon.flush(id), { code: 'IPC_ADAPTER_FAILURE' });
      assert.ok(wire.every((value) => value === 0));
    } finally {
      addon.close(id);
    }
    const input = addon.create();
    try {
      const hello = encodePacket({
        kind: Kind.Hello,
        requestId: 1n,
        payload: helloPayload(),
      });
      const first = Buffer.alloc(16 + 24);
      first.write('RWS1');
      first.writeUInt32BE(1, 4);
      first.writeUInt32BE(hello.length, 8);
      hello.copy(first, 16, 0, 24);
      assert.equal(writeSync(addon.childFd(input), first), first.length);
      assert.equal(addon.read(input).length, 24);
      await delay(1050);
      assert.throws(() => addon.read(input), { code: 'IPC_ADAPTER_FAILURE' });
    } finally {
      addon.close(input);
    }
  },
);
test(
  'prepared Node packet addon: transferred pending buffers are refused without stale native pointer access',
  { skip },
  () => {
    const id = addon.create();
    try {
      const encoded = encodePacket({
        kind: Kind.Frame,
        requestId: 1n,
        payload: Buffer.alloc(8 * 1024 * 1024),
      });
      const backing = new ArrayBuffer(encoded.length);
      const wire = Buffer.from(backing);
      encoded.copy(wire);
      assert.equal(addon.write(id, wire), false);
      structuredClone(backing, { transfer: [backing] });
      assert.equal(wire.length, 0);
      assert.throws(() => addon.flush(id), { code: 'IPC_ADAPTER_FAILURE' });
    } finally {
      addon.close(id);
    }
  },
);
test(
  'prepared Node packet addon: maximum framed record crosses kernel packets with nonblocking sender credit',
  { skip, timeout: 15000 },
  async () => {
    await withWorker(async (id, closed) => {
      await write(
        id,
        encodePacket({
          kind: Kind.Frame,
          requestId: 1n,
          payload: Buffer.alloc(8 * 1024 * 1024),
        }),
      );
      assert.equal((await read(id)).kind, Kind.Error);
      assert.deepEqual(await closed, [2, null]); // Valid carrier, unavailable lifecycle message.
    });
  },
);

test(
  'Node packet readiness: paused read emits nothing, resume observes data and close inside callback joins retirement',
  { skip, timeout: 10000 },
  async () => {
    const before = await fdCount();
    const id = addon.create();
    let callbacks = 0;
    const observed = new Promise((resolve) =>
      addon.watch(id, (status, events) => {
        ++callbacks;
        assert.equal(status, 0);
        assert.ok(events & 1);
        const chunk = addon.read(id);
        assert.equal(chunk.length, 24);
        assert.equal(addon.close(id), true);
        assert.equal(addon.closed(id), false);
        resolve();
      }),
    );
    try {
      const packet = encodePacket({
        kind: Kind.HeartbeatAck,
        requestId: 1n,
        payload: Buffer.alloc(0),
      });
      const datagram = Buffer.alloc(16 + packet.length);
      datagram.write('RWS1');
      datagram.writeUInt32BE(1, 4);
      datagram.writeUInt32BE(packet.length, 8);
      packet.copy(datagram, 16);
      addon.interest(id, 0);
      assert.equal(writeSync(addon.childFd(id), datagram), datagram.length);
      await delay(25);
      assert.equal(callbacks, 0);
      addon.interest(id, 1);
      await deadline(observed);
      await closeWatched(id);
      assert.equal(callbacks, 1);
      assert.equal(await fdCount(), before);
    } finally {
      await closeWatched(id);
    }
  },
);
test(
  'Node packet readiness: callback fault retires listener once without leaking or forwarding exception text',
  { skip, timeout: 10000 },
  async () => {
    const before = await fdCount();
    const id = addon.create();
    let calls = 0;
    try {
      addon.watch(id, () => {
        ++calls;
        throw new Error('synthetic host fault');
      });
      addon.interest(id, 2);
      await delay(30);
      assert.equal(calls, 1);
      assert.throws(() => addon.flush(id), { code: 'IPC_ADAPTER_FAILURE' });
    } finally {
      await closeWatched(id);
    }
    assert.equal(await fdCount(), before);
  },
);
test(
  'Node packet readiness: actual worker drains maximum record through writable callbacks without polling sender',
  { skip, timeout: 15000 },
  async () => {
    await withWorker(async (id, closed) => {
      const wire = encodePacket({
        kind: Kind.Frame,
        requestId: 1n,
        payload: Buffer.alloc(8 * 1024 * 1024),
      });
      let sent = addon.write(id, wire);
      assert.equal(sent, false);
      const decoder = new PacketDecoder();
      const reply = new Promise((resolve) =>
        addon.watch(id, (status, events) => {
          assert.equal(status, 0);
          if (events & 2 && !sent) {
            sent = addon.flush(id);
            if (sent) addon.interest(id, 1);
          }
          if (events & 1) {
            for (let i = 0; i < 32; i++) {
              const chunk = addon.read(id);
              if (chunk === null) break;
              if (chunk === undefined) {
                addon.interest(id, 0);
                break;
              }
              decoder.push(chunk, (packet) => {
                addon.interest(id, 0);
                resolve(packet);
              });
            }
          }
        }),
      );
      addon.interest(id, 3);
      assert.equal((await deadline(reply)).kind, Kind.Error);
      assert.equal(sent, true);
      decoder.finish();
      assert.deepEqual(await closed, [2, null]);
      await closeWatched(id);
    });
  },
);
test(
  'Node packet readiness: active unreferenced watchers and pending Buffer join async environment cleanup',
  { skip, timeout: 10000 },
  async () => {
    const before = await fdCount();
    const worker = new Worker(
      `const {workerData}=require('node:worker_threads');const a=require(workerData);const ids=[];for(let i=0;i<32;i++){const id=a.create();ids.push(id);a.watch(id,()=>{});a.interest(id,1);}const wire=Buffer.alloc(24+8*1024*1024);wire.write('RWI1');wire.writeUInt16BE(1,4);wire.writeUInt16BE(19,6);wire.writeBigUInt64BE(1n,12);wire.writeUInt32BE(8*1024*1024,20);a.write(ids[0],wire);`,
      { eval: true, workerData: modulePath },
    );
    assert.deepEqual(await deadline(once(worker, 'exit')), [0]);
    await delay(30);
    assert.equal(await fdCount(), before);
  },
);
