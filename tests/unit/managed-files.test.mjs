import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { EventEmitter } from 'node:events';
import {
  ManagedFiles,
  resolveManagedFilesPolicy,
  SessionManager,
  NativeSessionWorker,
} from '../../packages/node-bridge/dist/index.js';
import { FakeSessionWorker, eventually } from '../fixtures/session-worker.mjs';

const policy = (extra = {}) =>
  resolveManagedFilesPolicy({
    maxTotalBytes: 131072,
    maxFileBytes: 65536,
    maxEntries: 8,
    transferTimeoutMs: 3000,
    progressTimeoutMs: 1000,
    nativeTimeoutMs: 500,
    ...extra,
  });
function fixture(override, options = {}) {
  const calls = [],
    buffers = [];
  let next = 1n,
    offset = 0n,
    data = Buffer.alloc(0),
    fatal = 0;
  const files = new ManagedFiles(
    policy(options),
    async (command) => {
      calls.push(command);
      const base = {
        ...command,
        flags: 0,
        status: 'ok',
        data: Buffer.alloc(0),
        argument: 0n,
        value: 0n,
      };
      let response;
      if (override) response = await override(command, base);
      if (response === undefined) {
        switch (command.operation) {
          case 'begin-upload':
            offset = 0n;
            data = Buffer.alloc(0);
            response = { ...base, id: next++, argument: command.id };
            break;
          case 'write':
            offset += BigInt(command.data.length);
            data = Buffer.concat([data, command.data]);
            response = {
              ...base,
              argument: offset,
              value: BigInt(command.data.length),
            };
            break;
          case 'commit':
            response = { ...base, value: offset };
            break;
          case 'open-download':
            response = { ...base, value: BigInt(data.length) };
            break;
          case 'read': {
            const bytes = Buffer.from(
              data.subarray(
                Number(command.argument),
                Number(command.argument + command.value),
              ),
            );
            response = {
              ...base,
              argument: command.argument,
              value: BigInt(bytes.length),
              data: bytes,
            };
            break;
          }
          case 'mkdir':
            response = { ...base, id: next++, argument: command.id };
            break;
          case 'list':
            response = { ...base, id: 0n };
            break;
          default:
            response = base;
        }
      }
      buffers.push(response.data);
      return response;
    },
    () => {},
    () => {
      fatal++;
    },
  );
  return { files, calls, buffers, fatal: () => fatal };
}
test('managed file host policy is bounded, immutable and independently validated', () => {
  for (const input of [
    null,
    [],
    { maxFileBytes: 12, maxTotalBytes: 10 },
    { maxEntries: 65537 },
    { maxFileBytes: Infinity },
    { progressTimeoutMs: 10 },
    { nativeTimeoutMs: 30001 },
    { maxEntries: -1 },
    { maxFileBytes: 1.5 },
  ])
    assert.throws(() => resolveManagedFilesPolicy(input));
  const input = { maxFileBytes: 100 };
  const result = resolveManagedFilesPolicy(input);
  input.maxFileBytes = 200;
  assert.equal(result.maxFileBytes, 100);
  assert.equal(Object.isFrozen(result), true);
});
test('synthetic file backend: opaque locators, immutable metadata, binary roundtrip and exclusive transfer', async () => {
  const f = fixture();
  try {
    const upload = await f.files.upload('Ж日本語😀.bin', undefined, 4);
    await assert.rejects(f.files.list(), { code: 'FILE_BUSY' });
    assert.equal(
      f.calls.some((c) => c.operation === 'list'),
      false,
    );
    const bytes = Buffer.from([0, 255, 17, 128]);
    await upload.write(bytes);
    assert.deepEqual(bytes, Buffer.from([0, 255, 17, 128]));
    const file = await upload.finish();
    assert.match(file.fileId, /^[0-9a-f]{32}$/);
    assert.deepEqual(Object.keys(file).sort(), [
      'fileId',
      'kind',
      'name',
      'size',
    ]);
    const download = await f.files.download(file.fileId);
    assert.deepEqual(await download.read(), bytes);
    assert.equal((await download.read()).length, 0);
    await download.close();
    await f.files.remove(file.fileId);
    await assert.rejects(f.files.download(file.fileId), {
      code: 'FILE_NOT_FOUND',
    });
    assert.equal(f.fatal(), 0);
    assert.equal(
      f.buffers.every((b) => b.every((n) => n === 0)),
      true,
    );
  } finally {
    await f.files.close();
  }
});
test('synthetic file backend: traversal and length/size rejection happens before native mutation', async () => {
  const f = fixture(undefined, { maxFileBytes: 4 });
  try {
    for (const name of ['../x', '/x', 'C:x', 'NUL.txt', 'x\\y', 'x.', 'a\0b'])
      await assert.rejects(f.files.upload(name), { code: 'FILE_INVALID' });
    await assert.rejects(f.files.upload('x', undefined, 5), {
      code: 'FILE_QUOTA_EXCEEDED',
    });
    assert.equal(f.calls.length, 0);
    const upload = await f.files.upload('x', undefined, 3);
    await upload.write(Buffer.from([1, 2]));
    await assert.rejects(upload.finish(), { code: 'FILE_SIZE_MISMATCH' });
    assert.deepEqual(
      f.calls.map((c) => c.operation),
      ['begin-upload', 'write', 'abort'],
    );
    const over = await f.files.upload('y');
    await assert.rejects(over.write(Buffer.alloc(5)), {
      code: 'FILE_QUOTA_EXCEEDED',
    });
    assert.equal(f.calls.at(-1).operation, 'abort');
    assert.equal(f.fatal(), 0);
  } finally {
    await f.files.close();
  }
});
for (const [status, code] of [
  ['disk-full', 'FILE_DISK_FULL'],
  ['limit', 'FILE_QUOTA_EXCEEDED'],
  ['exists', 'FILE_EXISTS'],
]) {
  test(`synthetic file backend: ${status} aborts unpublished data and permits another operation`, async () => {
    const f = fixture((command, base) => {
      if (command.operation === 'write') return { ...base, status };
    });
    try {
      const upload = await f.files.upload('x');
      await assert.rejects(upload.write(Buffer.from([1])), { code });
      assert.equal(f.calls.at(-1).operation, 'abort');
      await f.files.list();
      assert.equal(f.fatal(), 0);
    } finally {
      await f.files.close();
    }
  });
}
test('synthetic file backend: cancellation during begin joins the response before releasing native upload', async () => {
  let resolve, entered;
  const started = new Promise((r) => {
    entered = r;
  });
  const gate = new Promise((r) => {
    resolve = r;
  });
  const f = fixture(async (command, base) => {
    if (command.operation === 'begin-upload') {
      entered();
      await gate;
      return { ...base, id: 12n, argument: command.id };
    }
  });
  const control = new AbortController();
  const upload = f.files.upload('x', undefined, undefined, control.signal);
  await started;
  control.abort();
  await assert.rejects(f.files.list(), { code: 'FILE_BUSY' });
  resolve();
  await assert.rejects(upload, { code: 'FILE_UNAVAILABLE' });
  assert.deepEqual(
    f.calls.map((c) => c.operation),
    ['begin-upload', 'abort'],
  );
  assert.equal(f.calls[1].id, 12n);
  await f.files.list();
  await f.files.close();
});
test('synthetic file backend: idle transfer deadline releases upload and does not poison known completion', async () => {
  const f = fixture(undefined, {
    nativeTimeoutMs: 20,
    progressTimeoutMs: 40,
    transferTimeoutMs: 100,
  });
  try {
    const upload = await f.files.upload('x');
    await delay(100);
    assert.equal(upload.signal.aborted, true);
    assert.equal(f.calls.at(-1).operation, 'abort');
    await f.files.list();
    assert.equal(f.fatal(), 0);
  } finally {
    await f.files.close();
  }
});
test('synthetic file backend: unknown native completion retires authority; late result cannot revive it', async () => {
  let release;
  const late = new Promise((r) => {
    release = r;
  });
  const f = fixture(
    async (command, base) => {
      if (command.operation === 'begin-upload') {
        await late;
        return { ...base, id: 88n };
      }
    },
    { nativeTimeoutMs: 20 },
  );
  try {
    await assert.rejects(f.files.upload('x'), { code: 'FILE_FAILED' });
    await assert.rejects(f.files.list(), { code: 'FILE_UNAVAILABLE' });
    release();
    await delay(10);
    assert.equal(f.fatal(), 1);
    assert.deepEqual(
      f.calls.map((c) => c.operation),
      ['begin-upload'],
    );
  } finally {
    release();
    await f.files.close();
  }
});
test('synthetic file backend: malformed or miscorrelated replies fail closed', async () => {
  for (const change of [
    { id: 0n },
    { argument: 9n },
    { operation: 'remove' },
    { flags: 1 },
  ]) {
    const f = fixture((_command, base) => ({ ...base, id: 1n, ...change }));
    await assert.rejects(f.files.upload('x'), { code: 'FILE_FAILED' });
    assert.equal(f.fatal(), 1);
    await f.files.close();
  }
});
test('synthetic file backend: bounded registry retires evicted IDs and rejects foreign parent/cursor tokens', async () => {
  const f = fixture(undefined, { maxEntries: 2 });
  try {
    const a = await f.files.mkdir('a'),
      b = await f.files.mkdir('b');
    const c = await f.files.mkdir('c', b.fileId);
    await assert.rejects(f.files.mkdir('x', a.fileId), {
      code: 'FILE_NOT_FOUND',
    });
    await assert.rejects(f.files.list(undefined, c.fileId), {
      code: 'FILE_INVALID',
    });
    await assert.rejects(f.files.download('f'.repeat(32)), {
      code: 'FILE_NOT_FOUND',
    });
    assert.equal(f.fatal(), 0);
  } finally {
    await f.files.close();
  }
});
test('session file opt-in is owner scoped; retained authority is revoked on close', async () => {
  let worker, limits;
  const manager = new SessionManager({
    files: policy(),
    workerFactory: (value) => {
      limits = value;
      worker = new FakeSessionWorker();
      worker.fileCommand = async (command) => {
        // Only list is needed here; file behavior is explicitly synthetic.
        return {
          ...command,
          status: 'ok',
          flags: 0,
          id: 0n,
          argument: 0n,
          value: 0n,
          data: Buffer.alloc(0),
        };
      };
      return worker;
    },
  });
  try {
    const { sessionId } = manager.create(
      {
        target: { host: 'example.test' },
        auth: { username: 'test', password: 'synthetic-only' },
      },
      { id: 'a' },
      'local',
    );
    await eventually(
      () => manager.get(sessionId, { id: 'a' }).state === 'connected',
    );
    assert.equal(Object.isFrozen(limits.files), true);
    assert.throws(() => manager.files(sessionId, { id: 'b' }), {
      code: 'SESSION_NOT_FOUND',
    });
    const files = manager.files(sessionId, { id: 'a' });
    assert.deepEqual(await files.list(), { entries: [] });
    await manager.close(sessionId, { id: 'a' });
    await assert.rejects(files.list(), { code: 'FILES_NOT_CONNECTED' });
  } finally {
    await manager.shutdown();
  }
});
test('native file opt-in reserves its wire budget without changing legacy defaults', () => {
  const paths = { workerPath: 'unused', runtimeRoot: 'unused' };
  assert.doesNotThrow(() => new NativeSessionWorker(paths));
  assert.throws(
    () =>
      new NativeSessionWorker(
        { ...paths, maxWriteBytes: 65536 },
        { files: policy() },
      ),
    { code: 'RDP_SETTING_NOT_IMPLEMENTED' },
  );
  assert.doesNotThrow(
    () =>
      new NativeSessionWorker(
        { ...paths, maxWriteBytes: 131072 },
        { files: policy() },
      ),
  );
});
test('synthetic native seam: file initialization precedes credentials/connect and absent capability refuses it', async () => {
  for (const supported of [false, true]) {
    const calls = [];
    class Adapter extends NativeSessionWorker {
      createWorkerProcess() {
        return Object.assign(new EventEmitter(), {
          start: async () => ({ capabilities: { fileService: supported } }),
          nativeFileCommand: async (command) => {
            calls.push(command.operation);
            assert.equal(command.id, 131072n);
            return {
              operation: command.operation,
              status: 'ok',
              flags: 0,
              id: 0n,
              argument: 0n,
              value: 0n,
              data: Buffer.alloc(0),
            };
          },
          connect: async () => {
            calls.push('connect');
          },
          close: async () => {},
        });
      }
    }
    const adapter = new Adapter(
      { workerPath: 'unused', runtimeRoot: 'unused' },
      { files: policy() },
    );
    try {
      const result = adapter.start(
        { target: { host: 'synthetic' }, auth: {} },
        new AbortController().signal,
      );
      if (supported) {
        await result;
        assert.deepEqual(calls, ['initialize', 'connect']);
      } else {
        await assert.rejects(result, { code: 'FILES_NOT_IMPLEMENTED' });
        assert.deepEqual(calls, []);
      }
    } finally {
      await adapter.close();
    }
  }
});
