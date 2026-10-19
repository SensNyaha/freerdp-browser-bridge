import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  WorkerProcess,
  WorkerError,
  NativeSessionWorker,
  SessionError,
} from '../../packages/node-bridge/dist/index.js';

const paths = { workerPath: 'unused-worker', runtimeRoot: 'unused-runtime' };

test('resident watchdog host options reject invalid budgets and incoherent polling before startup', async () => {
  for (const maxResidentBytes of [
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    'private-policy',
    null,
  ])
    assert.throws(() => new WorkerProcess({ ...paths, maxResidentBytes }), {
      code: 'INVALID_OPTIONS',
    });
  for (const residentPollIntervalMs of [0, 99, 60001, 1.5, NaN])
    assert.throws(
      () =>
        new WorkerProcess({
          ...paths,
          maxResidentBytes: 1,
          residentPollIntervalMs,
        }),
      { code: 'INVALID_OPTIONS' },
    );
  assert.throws(
    () => new WorkerProcess({ ...paths, residentPollIntervalMs: 100 }),
    { code: 'INVALID_OPTIONS' },
  );
  if (!['win32', 'linux'].includes(process.platform)) {
    assert.throws(() => new WorkerProcess({ ...paths, maxResidentBytes: 1 }), {
      code: 'RESOURCE_WATCHDOG_UNSUPPORTED',
    });
    return;
  }
  for (const residentPollIntervalMs of [100, 60000]) {
    const worker = new WorkerProcess({
      ...paths,
      maxResidentBytes: Number.MAX_SAFE_INTEGER,
      residentPollIntervalMs,
    });
    assert.equal(worker.pid, undefined);
    await worker.close();
  }
});

test('native adapter preserves only known resource failure codes and stable public session errors', () => {
  class Adapter extends NativeSessionWorker {
    createWorkerProcess() {
      this.peer = new EventEmitter();
      return this.peer;
    }
  }
  const adapter = new Adapter(paths);
  const observed = [];
  const unsubscribe = adapter.onFailure((code) => observed.push(code));
  try {
    adapter.peer.emit('failure', new WorkerError('WORKER_MEMORY_LIMIT'));
    adapter.peer.emit('failure', new WorkerError('WORKER_CPU_LIMIT'));
    adapter.peer.emit(
      'failure',
      new WorkerError('WORKER_RESOURCE_UNAVAILABLE'),
    );
    adapter.peer.emit('failure', new Error('private-diagnostic'));
    assert.deepEqual(observed, [
      'WORKER_MEMORY_LIMIT',
      'WORKER_CPU_LIMIT',
      'WORKER_RESOURCE_UNAVAILABLE',
      'WORKER_FAILED',
    ]);
    const limited = new SessionError('WORKER_MEMORY_LIMIT');
    assert.equal(limited.statusCode, 503);
    assert.equal(limited.failure.retryable, false);
    assert.equal(
      limited.failure.message,
      'Session worker memory policy exceeded',
    );
    const unavailable = new SessionError('WORKER_RESOURCE_UNAVAILABLE');
    assert.equal(unavailable.statusCode, 503);
    assert.equal(unavailable.failure.retryable, true);
  } finally {
    unsubscribe();
  }
});
