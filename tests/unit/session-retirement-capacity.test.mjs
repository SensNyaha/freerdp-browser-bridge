import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { SessionManager } from '../../packages/node-bridge/dist/index.js';
import { FakeSessionWorker } from '../fixtures/session-worker.mjs';

const owner = { id: 'cleanup-completion' };
const config = () => ({
  target: { host: 'rdp.example.test' },
  auth: { username: 'fixture', password: 'synthetic-only' },
});
for (const mode of ['pending', 'rejected', 'void', 'throw', 'nonpromise'])
  test(`fake cleanup ${mode}: uncertain retirement keeps capacity until a confirmed completion`, async () => {
    const graceful = Promise.withResolvers();
    const forced = Promise.withResolvers();
    const worker = new FakeSessionWorker();
    worker.close = () => {
      ++worker.closed;
      return graceful.promise;
    };
    worker.terminate = () => {
      ++worker.terminated;
      if (mode === 'throw')
        throw new Error('synthetic-private-termination-throw');
      if (mode === 'nonpromise') return 1;
      return mode === 'void'
        ? undefined
        : mode === 'rejected'
          ? Promise.reject(new Error('synthetic-private-termination-failure'))
          : forced.promise;
    };
    let factories = 0;
    let now = 100;
    const manager = new SessionManager({
      maxSessions: 1,
      maxPerPrincipal: 1,
      shutdownTimeoutMs: 5,
      terminationTimeoutMs: 5,
      retentionMs: 1,
      maxRetained: 1,
      now: () => now,
      workerFactory: () => {
        ++factories;
        return factories === 1 ? worker : new FakeSessionWorker();
      },
    });
    try {
      const session = manager.create(config(), owner, '127.0.0.1');
      await nextTurn();
      const closed = await manager.close(session.sessionId, owner);
      assert.equal(closed.state, 'closed');
      assert.equal(manager.statistics().active, 1);
      now = 200;
      assert.equal(manager.get(session.sessionId, owner).state, 'closed');
      assert.equal(manager.statistics().retained, 0);
      assert.throws(() => manager.create(config(), owner, '127.0.0.1'), {
        code: 'SESSION_LIMIT',
      });
      assert.equal(factories, 1);
      if (mode === 'pending') forced.resolve();
      else graceful.resolve();
      await nextTurn();
      assert.equal(manager.statistics().active, 0);
      const replacement = manager.create(config(), owner, '127.0.0.1');
      await nextTurn();
      assert.equal(
        manager.get(replacement.sessionId, owner).state,
        'connected',
      );
      assert.equal(factories, 2);
      await manager.close(replacement.sessionId, owner);
      assert.equal(manager.statistics().active, 0);
    } finally {
      graceful.resolve();
      forced.resolve();
      await manager.shutdown();
    }
  });

test('fake cleanup: two rejected completions keep the bounded reservation without forwarding diagnostics', async () => {
  const worker = new FakeSessionWorker();
  worker.close = async () => {
    throw new Error('synthetic-private-close');
  };
  worker.terminate = () =>
    Promise.reject(new Error('synthetic-private-termination'));
  const manager = new SessionManager({
    maxSessions: 1,
    maxPerPrincipal: 1,
    shutdownTimeoutMs: 5,
    terminationTimeoutMs: 5,
    workerFactory: () => worker,
  });
  try {
    const session = manager.create(config(), owner, '127.0.0.1');
    await nextTurn();
    const closed = await manager.close(session.sessionId, owner);
    await nextTurn();
    assert.equal(closed.state, 'closed');
    assert.equal(manager.statistics().active, 1);
    assert.equal(manager.statistics().retained, 0);
    assert.ok(!JSON.stringify(closed).includes('private'));
    assert.throws(() => manager.create(config(), owner, '127.0.0.1'), {
      code: 'SESSION_LIMIT',
    });
  } finally {
    await manager.shutdown();
  }
});

test('fake cleanup: uncertain retirement keeps its principal reservation while a healthy sibling closes normally', async () => {
  const first = new FakeSessionWorker();
  const forced = Promise.withResolvers();
  first.close = () => new Promise(() => {});
  first.terminate = () => forced.promise;
  let factories = 0;
  const manager = new SessionManager({
    maxSessions: 2,
    maxPerPrincipal: 1,
    shutdownTimeoutMs: 5,
    terminationTimeoutMs: 5,
    workerFactory: () => (++factories === 1 ? first : new FakeSessionWorker()),
  });
  try {
    const a = manager.create(config(), owner, '127.0.0.1');
    await nextTurn();
    await manager.close(a.sessionId, owner);
    assert.equal(manager.statistics().active, 1);
    assert.throws(() => manager.create(config(), owner, '127.0.0.1'), {
      code: 'SESSION_LIMIT',
    });
    const other = { id: 'healthy-sibling' };
    const b = manager.create(config(), other, '127.0.0.2');
    await nextTurn();
    assert.equal(manager.get(b.sessionId, other).state, 'connected');
    assert.equal(manager.statistics().active, 2);
    await manager.close(b.sessionId, other);
    assert.equal(manager.statistics().active, 1);
    forced.resolve();
    await nextTurn();
    assert.equal(manager.statistics().active, 0);
  } finally {
    forced.resolve();
    await manager.shutdown();
  }
});
