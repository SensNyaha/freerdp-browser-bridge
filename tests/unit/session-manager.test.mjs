import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { SessionManager } from '../../packages/node-bridge/dist/index.js';
import { eventually, fakeFactory } from '../fixtures/session-worker.mjs';

const a = { id: 'principal-a' };
const b = { id: 'principal-b' };
test('control input is serialized, stale queued commands are discarded and reset precedes a new controller', async () => {
  const factory = fakeFactory();
  await withManager(factory, async (manager) => {
    const created = manager.create(config(), a, '127.0.0.1');
    await eventually(
      () => manager.get(created.sessionId, a).state === 'connected',
    );
    const sent = [];
    let unblock;
    factory.workers[0].sendInput = async (event) => {
      sent.push(event);
      if (sent.length === 1)
        await new Promise((done) => {
          unblock = done;
        });
    };
    const attach = (channel) =>
      manager.attach(
        created.sessionId,
        manager.mintToken(created.sessionId, a, channel).token,
        channel,
      );
    const media = attach('media');
    await assert.rejects(
      media.sendInput({ type: 'reset' }),
      expectCode('ATTACH_INVALID'),
    );
    const first = attach('control');
    const down = first.sendInput({
      type: 'key',
      scancode: 30,
      down: true,
      repeat: false,
    });
    await eventually(() => Boolean(unblock));
    const queued = first.sendInput({
      type: 'key',
      scancode: 31,
      down: true,
      repeat: false,
    });
    const stale = assert.rejects(queued, expectCode('ATTACH_INVALID'));
    first.release();
    first.release();
    await assert.rejects(
      first.sendInput({ type: 'reset' }),
      expectCode('ATTACH_INVALID'),
    );
    const next = attach('control');
    const nextEvent = {
      type: 'key',
      scancode: 32,
      down: true,
      repeat: false,
    };
    const nextInput = next.sendInput(nextEvent);
    nextEvent.scancode = 33; // Already queued input owns an immutable snapshot.
    unblock();
    await Promise.all([down, stale, nextInput]);
    assert.deepEqual(
      sent.map((e) => (e.type === 'key' ? e.scancode : e.type)),
      [30, 'reset', 32],
    );
    next.release();
    await eventually(() => sent.length === 4);
    assert.equal(sent[3].type, 'reset');
  });
});
test('input queue overflow reserves reset capacity and keeps queued input bounded', async () => {
  const factory = fakeFactory();
  await withManager(factory, async (manager) => {
    const created = manager.create(config(), a, '127.0.0.1');
    await eventually(
      () => manager.get(created.sessionId, a).state === 'connected',
    );
    let unblock;
    const sent = [];
    factory.workers[0].sendInput = async (event) => {
      sent.push(event);
      if (sent.length === 1)
        await new Promise((done) => {
          unblock = done;
        });
    };
    const lease = manager.attach(
      created.sessionId,
      manager.mintToken(created.sessionId, a, 'control').token,
      'control',
    );
    const first = lease.sendInput({ type: 'move', x: 1, y: 1 });
    await eventually(() => Boolean(unblock));
    const queued = Array.from({ length: 63 }, () =>
      lease.sendInput({ type: 'move', x: 2, y: 2 }).catch((e) => e.code),
    );
    await assert.rejects(
      lease.sendInput({ type: 'move', x: 3, y: 3 }),
      expectCode('INPUT_QUEUE_FULL'),
    );
    lease.release();
    unblock();
    await first;
    assert.deepEqual(
      await Promise.all(queued),
      Array(63).fill('ATTACH_INVALID'),
    );
    await eventually(() => sent.length === 2);
    assert.equal(sent[1].type, 'reset');
  });
});
test('fake-backend manager: released media lease cannot deliver a pending frame or reuse capture authority', async () => {
  const factory = fakeFactory();
  await withManager(factory, async (manager) => {
    const created = manager.create(config(), a, '127.0.0.1');
    await eventually(
      () => manager.get(created.sessionId, a).state === 'connected',
    );
    let done;
    factory.workers[0].captureFrame = () =>
      new Promise((resolve) => {
        done = resolve;
      });
    const lease = manager.attach(
      created.sessionId,
      manager.mintToken(created.sessionId, a, 'media').token,
      'media',
    );
    const pending = lease.captureFrame(0n);
    await assert.rejects(lease.captureFrame(0n), expectCode('MEDIA_FAILED'));
    lease.release();
    done({
      revision: 1n,
      timestampUs: 1n,
      width: 640,
      height: 480,
      jpeg: Buffer.from('ffd8ffd9', 'hex'),
    });
    await assert.rejects(pending, expectCode('ATTACH_INVALID'));
    await assert.rejects(lease.captureFrame(0n), expectCode('ATTACH_INVALID'));
    const controller = manager.attach(
      created.sessionId,
      manager.mintToken(created.sessionId, a, 'control').token,
      'control',
    );
    await assert.rejects(
      controller.captureFrame(0n),
      expectCode('ATTACH_INVALID'),
    );
  });
});
const config = () => ({
  target: { host: 'rdp.example.test' },
  auth: { username: 'example-user', password: randomBytes(24).toString('hex') },
});
const expectCode = (code) => (error) =>
  error.code === code && !error.message.includes('untrusted');
async function withManager(options, run) {
  const manager = new SessionManager(options);
  try {
    await run(manager);
  } finally {
    await manager.shutdown();
  }
}

test('fake-backend manager: opaque IDs, ownership, state transitions and short credential lifetime', async () => {
  const factory = fakeFactory();
  await withManager({ ...factory }, async (manager) => {
    const input = config();
    const session = manager.create(input, a, '127.0.0.1');
    assert.match(session.sessionId, /^[a-f0-9]{32}$/);
    await eventually(
      () => manager.get(session.sessionId, a).state === 'connected',
    );
    await eventually(
      () => factory.workers[0].received.auth.password === undefined,
    );
    assert.ok(input.auth.password);
    const snapshot = manager.get(session.sessionId, a);
    assert.ok(!JSON.stringify(snapshot).includes(input.auth.password));
    assert.ok(!JSON.stringify(snapshot).includes(input.target.host));
    assert.throws(
      () => manager.get(session.sessionId, b),
      expectCode('SESSION_NOT_FOUND'),
    );
    assert.throws(
      () => manager.mintToken(session.sessionId, b, 'control'),
      expectCode('SESSION_NOT_FOUND'),
    );
    await assert.rejects(
      manager.close(session.sessionId, b),
      expectCode('SESSION_NOT_FOUND'),
    );
    factory.workers[0].emit('state', 'reconnecting');
    assert.equal(manager.get(session.sessionId, a).state, 'reconnecting');
    factory.workers[0].emit('state', 'connected');
    assert.equal((await manager.close(session.sessionId, a)).state, 'closed');
    assert.equal((await manager.close(session.sessionId, a)).state, 'closed');
    assert.equal(factory.workers[0].closed, 1);
    assert.equal(manager.statistics().active, 0);
  });
});

test('fake-backend manager: attach credentials are session/channel scoped, single-use, expiring and bounded', async () => {
  let clock = 1000;
  await withManager(
    {
      ...fakeFactory(),
      now: () => clock,
      tokenTtlMs: 100,
      maxTokensPerSession: 2,
    },
    async (manager) => {
      const one = manager.create(config(), a, '127.0.0.1');
      const two = manager.create(config(), a, '127.0.0.1');
      const token = manager.mintToken(one.sessionId, a, 'control');
      assert.match(token.token, /^[A-Za-z0-9_-]{43}$/);
      assert.equal(token.role, 'controller');
      assert.throws(
        () => manager.attach(two.sessionId, token.token, 'control'),
        expectCode('ATTACH_INVALID'),
      );
      assert.throws(
        () => manager.attach(one.sessionId, token.token, 'media'),
        expectCode('ATTACH_INVALID'),
      );
      const attached = manager.attach(one.sessionId, token.token, 'control');
      assert.throws(
        () => manager.attach(one.sessionId, token.token, 'control'),
        expectCode('ATTACH_INVALID'),
      );
      const replacement = manager.mintToken(one.sessionId, a, 'control');
      assert.throws(
        () => manager.attach(one.sessionId, replacement.token, 'control'),
        expectCode('ATTACHMENT_CONFLICT'),
      );
      attached.release();
      const next = manager.attach(one.sessionId, replacement.token, 'control');
      attached.release(); // A stale close must not release the replacement's authority.
      assert.equal(manager.statistics().attachments, 1);
      next.release();
      const expiring = manager.mintToken(one.sessionId, a, 'media');
      manager.mintToken(one.sessionId, a, 'control');
      assert.throws(
        () => manager.mintToken(one.sessionId, a, 'control'),
        expectCode('TOKEN_LIMIT'),
      );
      clock += 100;
      assert.throws(
        () => manager.attach(one.sessionId, expiring.token, 'media'),
        expectCode('ATTACH_INVALID'),
      );
      assert.equal(manager.statistics().tokens, 0);
      const closing = manager.mintToken(one.sessionId, a, 'control');
      await manager.close(one.sessionId, a);
      assert.throws(
        () => manager.attach(one.sessionId, closing.token, 'control'),
        expectCode('ATTACH_INVALID'),
      );
    },
  );
});

test('fake-backend manager: admission includes starting workers and releases capacity after cleanup', async () => {
  await withManager(
    {
      ...fakeFactory('starting'),
      maxSessions: 2,
      maxPerPrincipal: 1,
      createBurst: 20,
    },
    async (manager) => {
      const one = manager.create(config(), a, '127.0.0.1');
      assert.throws(
        () => manager.create(config(), a, '127.0.0.1'),
        expectCode('SESSION_LIMIT'),
      );
      manager.create(config(), b, '127.0.0.1');
      assert.throws(
        () => manager.create(config(), { id: 'third' }, '127.0.0.1'),
        expectCode('SESSION_LIMIT'),
      );
      await manager.close(one.sessionId, a);
      const next = manager.create(config(), a, '127.0.0.1');
      assert.notEqual(next.sessionId, one.sessionId);
      assert.equal(manager.statistics().active, 2);
    },
  );
});

test('fake-backend manager: principal/IP creation budgets, rate-key bounds and terminal retention', async () => {
  let clock = 0;
  await withManager(
    {
      ...fakeFactory(),
      now: () => clock,
      createBurst: 2,
      rateWindowMs: 100,
      maxRateKeys: 3,
      maxRetained: 1,
      retentionMs: 50,
    },
    async (manager) => {
      const one = manager.create(config(), a, 'one-ip');
      await manager.close(one.sessionId, a);
      const two = manager.create(config(), b, 'one-ip');
      await manager.close(two.sessionId, b);
      assert.equal(manager.statistics().retained, 1);
      assert.throws(
        () => manager.create(config(), a, 'one-ip'),
        expectCode('CREATE_RATE_LIMIT'),
      );
      assert.throws(
        () => manager.create(config(), { id: 'third' }, 'other-ip'),
        expectCode('CREATE_RATE_LIMIT'),
      );
      assert.ok(manager.statistics().rateKeys <= 3);
      clock += 100;
      assert.equal(manager.statistics().retained, 0);
      assert.equal(manager.statistics().rateKeys, 0);
      manager.create(config(), a, 'one-ip');
    },
  );
});

test('fake-backend manager: startup/close deadlines, invalid worker state and sanitized failure', async () => {
  const hung = fakeFactory('start-hang');
  await withManager(
    { ...hung, startupTimeoutMs: 20, shutdownTimeoutMs: 20 },
    async (manager) => {
      const one = manager.create(config(), a, 'one-ip');
      await eventually(() => manager.statistics().active === 0);
      assert.equal(
        manager.get(one.sessionId, a).error.code,
        'WORKER_START_TIMEOUT',
      );
      assert.equal(hung.workers[0].received.auth.password, undefined);
      hung.workers[0].emit('state', 'connected');
      assert.equal(manager.get(one.sessionId, a).state, 'failed');
    },
  );
  const slowClose = fakeFactory('close-hang');
  await withManager(
    { ...slowClose, shutdownTimeoutMs: 20 },
    async (manager) => {
      const one = manager.create(config(), a, 'one-ip');
      assert.equal((await manager.close(one.sessionId, a)).state, 'closed');
      assert.equal(slowClose.workers[0].terminated, 1);
    },
  );
  const invalid = fakeFactory();
  await withManager({ ...invalid }, async (manager) => {
    const one = manager.create(config(), a, 'one-ip');
    await eventually(() => manager.get(one.sessionId, a).state === 'connected');
    invalid.workers[0].emit('state', 'created');
    await eventually(() => manager.statistics().active === 0);
    assert.equal(
      manager.get(one.sessionId, a).error.code,
      'WORKER_INVALID_STATE',
    );
  });
});

test('fake-backend manager: close before start prevents a late worker, shutdown closes all and clears bounded state', async () => {
  const factory = fakeFactory();
  const manager = new SessionManager({ ...factory });
  const one = manager.create(config(), a, 'one-ip');
  await manager.close(one.sessionId, a);
  assert.equal(factory.workers[0].started, 0);
  manager.create(config(), a, 'one-ip');
  await manager.shutdown();
  await manager.shutdown();
  assert.deepEqual(manager.statistics(), {
    active: 0,
    retained: 0,
    tokens: 0,
    attachments: 0,
    rateKeys: 0,
    states: {},
  });
  assert.throws(
    () => manager.create(config(), a, 'one-ip'),
    expectCode('SERVER_CLOSING'),
  );
});

test('production manager: no connection backend means no simulated RDP sessions', async () => {
  await withManager({}, async (manager) => {
    assert.throws(
      () => manager.create(config(), a, 'one-ip'),
      expectCode('RDP_NOT_IMPLEMENTED'),
    );
    assert.equal(manager.statistics().active, 0);
    assert.throws(
      () => manager.create({ ...config(), arbitraryArgv: true }, a, 'one-ip'),
      expectCode('INVALID_SESSION_CONFIG'),
    );
  });
});

test('fake-backend manager: worker reuse and subscription failure cannot share or leak a session worker', async () => {
  const factory = fakeFactory();
  const shared = factory.workerFactory();
  await withManager({ workerFactory: () => shared }, async (manager) => {
    const one = manager.create(config(), a, 'one-ip');
    await eventually(() => manager.get(one.sessionId, a).state === 'connected');
    assert.throws(
      () => manager.create(config(), b, 'one-ip'),
      expectCode('WORKER_START_FAILED'),
    );
    assert.equal(manager.get(one.sessionId, a).state, 'connected');
    assert.equal(shared.closed, 0);
    assert.equal(manager.statistics().active, 1);
  });
  const broken = factory.workerFactory();
  broken.onFailure = () => {
    throw new Error('untrusted worker diagnostic');
  };
  await withManager({ workerFactory: () => broken }, async (manager) => {
    assert.throws(
      () => manager.create(config(), a, 'one-ip'),
      expectCode('WORKER_START_FAILED'),
    );
    await eventually(() => manager.statistics().active === 0);
    assert.equal(manager.statistics().states.failed, 1);
    assert.equal(broken.closed, 1);
    assert.equal(broken.started, 0);
  });
});
