import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { SessionManager } from '../../packages/node-bridge/dist/index.js';
import { FakeSessionWorker } from '../fixtures/session-worker.mjs';

const owner = { id: 'startup-deadline-control' };
const config = () => ({
  target: { host: 'rdp.example.test' },
  auth: { username: 'fixture', password: 'synthetic-only' },
});
for (const event of [true, false])
  test(`fake startup stalls beyond budget: ${event ? 'late connected event' : 'late completion without event'} cannot succeed`, async (t) => {
    let now = 0n;
    t.mock.method(process.hrtime, 'bigint', () => now);
    const worker = new FakeSessionWorker();
    const seen = [];
    let signal;
    worker.start = async (_config, abort) => {
      signal = abort;
      worker.emit('state', 'connecting');
      // Cross the budget only after invocation has started. A real 5 ms timer
      // can expire during unrelated host scheduling before backend start.
      now = 40_000_000n;
      if (event) worker.emit('state', 'connected');
    };
    const manager = new SessionManager({
      workerFactory: () => worker,
      startupTimeoutMs: 5,
    });
    manager.on('event', (value) => {
      if (value.type === 'session.state') seen.push(value.session.state);
    });
    try {
      const session = manager.create(config(), owner, '127.0.0.1');
      await nextTurn();
      const snapshot = manager.get(session.sessionId, owner);
      assert.equal(snapshot.state, 'failed');
      assert.equal(snapshot.error.code, 'WORKER_START_TIMEOUT');
      assert.ok(!seen.includes('connected'));
      assert.equal(signal.aborted, true);
      assert.equal(manager.statistics().active, 0);
      assert.equal(worker.closed, 1);
    } finally {
      await manager.shutdown();
    }
  });

test('fake startup control: an ordinary prompt completion remains connected', async () => {
  const manager = new SessionManager({
    workerFactory: () => new FakeSessionWorker(),
    startupTimeoutMs: 1000,
  });
  try {
    const session = manager.create(config(), owner, '127.0.0.1');
    await nextTurn();
    assert.equal(manager.get(session.sessionId, owner).state, 'connected');
  } finally {
    await manager.shutdown();
  }
});

test('fake startup control: expired invocation staging cannot call backend start', async () => {
  const worker = new FakeSessionWorker();
  const manager = new SessionManager({
    workerFactory: () => worker,
    startupTimeoutMs: 5,
  });
  try {
    const blocked = Promise.resolve().then(() =>
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40),
    );
    const session = manager.create(config(), owner, '127.0.0.1');
    await blocked;
    await nextTurn();
    assert.equal(worker.started, 0);
    assert.equal(
      manager.get(session.sessionId, owner).error?.code,
      'WORKER_START_TIMEOUT',
    );
    assert.equal(manager.statistics().active, 0);
  } finally {
    await manager.shutdown();
  }
});

test('fake startup control: exact monotonic deadline refuses a late state', async (t) => {
  let now = 0n;
  t.mock.method(process.hrtime, 'bigint', () => now);
  const worker = new FakeSessionWorker();
  worker.start = async () => {
    worker.emit('state', 'connecting');
    now = 5_000_000n;
    worker.emit('state', 'connected');
  };
  const manager = new SessionManager({
    workerFactory: () => worker,
    startupTimeoutMs: 5,
  });
  try {
    const session = manager.create(config(), owner, '127.0.0.1');
    await nextTurn();
    assert.equal(
      manager.get(session.sessionId, owner).error?.code,
      'WORKER_START_TIMEOUT',
    );
  } finally {
    await manager.shutdown();
  }
});

test('fake startup control: completed startup does not time out later connection progress', async (t) => {
  let now = 0n;
  t.mock.method(process.hrtime, 'bigint', () => now);
  const worker = new FakeSessionWorker('starting');
  const manager = new SessionManager({
    workerFactory: () => worker,
    startupTimeoutMs: 5,
  });
  try {
    const session = manager.create(config(), owner, '127.0.0.1');
    await nextTurn();
    now = 6_000_000n;
    worker.emit('state', 'connected');
    assert.equal(manager.get(session.sessionId, owner).state, 'connected');
  } finally {
    await manager.shutdown();
  }
});

test('fake startup control: explicit close during a stalled start retains its closed outcome', async () => {
  const worker = new FakeSessionWorker();
  worker.start = async () => {
    worker.emit('state', 'connecting');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40);
    worker.emit('state', 'connected');
  };
  const manager = new SessionManager({
    workerFactory: () => worker,
    startupTimeoutMs: 5,
  });
  let closing;
  manager.on('event', (value) => {
    if (value.type === 'session.state' && value.session.state === 'connecting')
      closing = manager.close(value.session.sessionId, owner);
  });
  try {
    const session = manager.create(config(), owner, '127.0.0.1');
    await nextTurn();
    assert.equal((await closing).state, 'closed');
    assert.equal(manager.get(session.sessionId, owner).error, undefined);
    assert.equal(manager.statistics().active, 0);
  } finally {
    await manager.shutdown();
  }
});
