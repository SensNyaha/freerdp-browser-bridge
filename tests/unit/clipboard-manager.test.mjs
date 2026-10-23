import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionManager } from '../../packages/node-bridge/dist/index.js';
import { FakeSessionWorker, eventually } from '../fixtures/session-worker.mjs';
const principal = { id: 'clipboard-fixture' };
const config = (
  clipboard = { mode: 'bidirectional', text: true, maxItemBytes: 1024 },
) => ({
  target: { host: 'synthetic' },
  auth: {},
  clipboard,
});
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
class ClipboardWorker extends FakeSessionWorker {
  source = {
    generation: 1n,
    revision: 1n,
    maximum: 1024,
    ready: true,
    toServer: true,
    fromServer: true,
    remoteText: true,
    localAccepted: false,
    localPending: false,
    remotePending: false,
  };
  reads = 0;
  writes = 0;
  revokes = 0;
  onClipboard(listener) {
    this.on('clipboard', listener);
    return () => this.off('clipboard', listener);
  }
  publish(patch = {}) {
    Object.assign(this.source, patch);
    this.emit('clipboard', this.source);
  }
  async start(config, signal) {
    await super.start(config, signal);
    this.source.toServer = config.clipboard.mode !== 'server-to-browser';
    this.source.fromServer = config.clipboard.mode !== 'browser-to-server';
    this.source.remoteText = this.source.fromServer;
    this.source.maximum = config.clipboard.maxItemBytes ?? 1048576;
    this.publish();
  }
  async readClipboardText() {
    ++this.reads;
    return { status: 'accepted', text: Buffer.from('Ж😀') };
  }
  async writeClipboardText() {
    ++this.writes;
    this.publish({ localAccepted: true });
    return 'accepted';
  }
  async revokeClipboardText() {
    ++this.revokes;
    this.publish({ localAccepted: false, localPending: false });
    return 'accepted';
  }
}
async function run(body, options = {}) {
  const worker = new ClipboardWorker();
  const manager = new SessionManager({ workerFactory: () => worker });
  try {
    const session = manager.create(
      config(options.clipboard),
      principal,
      'local-fixture',
    );
    await eventually(
      () => manager.get(session.sessionId, principal).state === 'connected',
    );
    const attach = (channel = 'control') =>
      manager.attach(
        session.sessionId,
        manager.mintToken(session.sessionId, principal, channel).token,
        channel,
      );
    await body({ manager, worker, session, attach });
  } finally {
    await manager.shutdown();
  }
}
test('clipboard manager: selected current control lease owns copied metadata and explicit operations', async () => {
  await run(async ({ worker, attach }) => {
    const media = attach('media');
    assert.throws(() => media.startClipboard(), { code: 'ATTACH_INVALID' });
    const control = attach();
    assert.equal(control.clipboardSnapshot.granted, false);
    assert.equal((await control.readClipboardText(1n)).status, 'unavailable');
    assert.equal(worker.reads, 0);
    const events = [];
    const remove = control.onClipboard((snapshot) => events.push(snapshot));
    assert.equal(control.startClipboard(), true);
    assert.equal(control.startClipboard(), false);
    assert.equal(control.clipboardSnapshot.granted, true);
    const copied = control.clipboardSnapshot;
    copied.state.maximum = 1;
    assert.equal(control.clipboardSnapshot.state.maximum, 1024);
    worker.publish({
      unexpectedContent: Buffer.from('synthetic private metadata canary'),
    });
    assert.equal(
      Object.hasOwn(control.clipboardSnapshot.state, 'unexpectedContent'),
      false,
    );
    assert.equal(
      events.some((snapshot) =>
        Object.hasOwn(snapshot.state ?? {}, 'unexpectedContent'),
      ),
      false,
    );
    const read = await control.readClipboardText(1n);
    assert.equal(read.status, 'accepted');
    assert.equal(read.text.toString(), 'Ж😀');
    read.text.fill(0);
    assert.equal(
      await control.writeClipboardText(Buffer.from('A')),
      'accepted',
    );
    assert.equal(await control.stopClipboard(), true);
    assert.equal(worker.revokes, 1);
    assert.equal(control.clipboardSnapshot.granted, false);
    assert.ok(events.some((s) => s.retiring && !s.granted));
    assert.equal(control.startClipboard(), true);
    remove();
    await eventually(() => !control.clipboardSnapshot.retiring);
    assert.equal(control.clipboardSnapshot.granted, false);
    control.release();
    assert.throws(() => control.startClipboard(), { code: 'ATTACH_INVALID' });
    media.release();
  });
});
test('clipboard manager: control loss drains an uncertain write and native revoke before replacement', async () => {
  await run(async ({ worker, attach }) => {
    const write = deferred(),
      revoke = deferred();
    worker.writeClipboardText = async () => {
      ++worker.writes;
      worker.publish({ localPending: true });
      const status = await write.promise;
      worker.publish({ localPending: false, localAccepted: true });
      return status;
    };
    worker.revokeClipboardText = async () => {
      ++worker.revokes;
      worker.publish({ localAccepted: false, localPending: true });
      const status = await revoke.promise;
      worker.publish({ localPending: false });
      return status;
    };
    const first = attach();
    assert.equal(first.startClipboard(), true);
    const operation = first.writeClipboardText(Buffer.from('A'));
    assert.equal(await first.writeClipboardText(Buffer.from('B')), 'busy');
    first.release();
    const next = attach();
    assert.equal(next.startClipboard(), false);
    assert.equal(next.clipboardSnapshot.retiring, true);
    assert.equal(worker.revokes, 0);
    write.resolve('accepted');
    assert.equal(await operation, 'disconnected');
    await eventually(() => worker.revokes === 1);
    assert.equal(next.startClipboard(), false);
    revoke.resolve('accepted');
    await eventually(() => !next.clipboardSnapshot.retiring);
    assert.equal(next.startClipboard(), true);
    assert.equal(worker.writes, 1);
    assert.equal(worker.revokes, 1);
    assert.equal(await next.stopClipboard(), true);
    next.release();
  });
});
test('clipboard manager: late data is wiped after stop or detach, and cannot reach a new controller', async () => {
  for (const action of ['stop', 'detach'])
    await run(async ({ worker, attach }) => {
      const data = deferred(),
        text = Buffer.from('private synthetic');
      worker.readClipboardText = () => {
        ++worker.reads;
        return data.promise;
      };
      const first = attach();
      first.startClipboard();
      const read = first.readClipboardText(1n);
      let stopped;
      if (action === 'stop') stopped = first.stopClipboard();
      else first.release();
      data.resolve({ status: 'accepted', text });
      assert.deepEqual(await read, {
        status: 'disconnected',
        text: Buffer.alloc(0),
      });
      assert.ok(text.every((b) => b === 0));
      if (stopped) assert.equal(await stopped, true);
      const next = action === 'stop' ? first : attach();
      await eventually(() => !next.clipboardSnapshot.retiring);
      assert.equal(next.startClipboard(), true);
      assert.equal(worker.reads, 1);
      assert.equal(worker.revokes, 0);
      next.release();
    });
});
test('clipboard manager: callback loss retires only clipboard authority and old listener cannot restart it', async () => {
  await run(async ({ worker, session, manager, attach }) => {
    const first = attach();
    first.startClipboard();
    await first.writeClipboardText(Buffer.from('A'));
    first.onClipboard(() => {
      throw new Error('synthetic host diagnostic');
    });
    worker.publish({ revision: 2n });
    await eventually(
      () => worker.revokes === 1 && !first.clipboardSnapshot.retiring,
    );
    assert.throws(() => first.startClipboard(), { code: 'CLIPBOARD_FAILED' });
    assert.equal(manager.get(session.sessionId, principal).state, 'connected');
    first.release();
    const next = attach();
    assert.equal(next.startClipboard(), true);
    next.release();
  });
});
test('clipboard manager: failed native retirement fails the session and never grants replacement', async () => {
  await run(async ({ worker, session, manager, attach }) => {
    const first = attach();
    first.startClipboard();
    await first.writeClipboardText(Buffer.from('A'));
    worker.revokeClipboardText = async () => 'refused';
    assert.equal(await first.stopClipboard(), false);
    await eventually(
      () => manager.get(session.sessionId, principal).state === 'failed',
    );
    assert.equal(
      manager.get(session.sessionId, principal).error.code,
      'CLIPBOARD_FAILED',
    );
    assert.throws(() => first.startClipboard(), { code: 'ATTACH_INVALID' });
  });
});
test('clipboard manager: invalid source, policy, generation or revision fails closed', async () => {
  for (const patch of [
    { maximum: 1025 },
    { generation: 2n },
    { revision: 0n, remoteText: false },
    { toServer: false },
    { ready: false, remoteText: false },
  ])
    await run(async ({ worker, session, manager, attach }) => {
      const control = attach();
      control.startClipboard();
      worker.publish(patch);
      await eventually(
        () => manager.get(session.sessionId, principal).state === 'failed',
      );
      assert.equal(
        manager.get(session.sessionId, principal).error.code,
        'WORKER_INVALID_STATE',
      );
      assert.equal(worker.reads, 0);
    });
});
test('clipboard manager: unsupported or ambiguous selection refuses before backend start', async () => {
  const disabled = new FakeSessionWorker(),
    disabledManager = new SessionManager({ workerFactory: () => disabled });
  try {
    const created = disabledManager.create(
      config({ mode: 'off' }),
      principal,
      'local-fixture',
    );
    await eventually(
      () =>
        disabledManager.get(created.sessionId, principal).state === 'connected',
    );
    const control = disabledManager.attach(
      created.sessionId,
      disabledManager.mintToken(created.sessionId, principal, 'control').token,
      'control',
    );
    assert.throws(() => control.startClipboard(), {
      code: 'CLIPBOARD_NOT_IMPLEMENTED',
    });
    control.release();
  } finally {
    await disabledManager.shutdown();
  }
  for (const clipboard of [
    {},
    { text: true },
    { mode: 'bidirectional', html: true },
    { mode: 'bidirectional', text: false },
    { mode: 'bidirectional', files: true },
  ]) {
    const worker = new ClipboardWorker(),
      manager = new SessionManager({ workerFactory: () => worker });
    try {
      assert.throws(
        () => manager.create(config(clipboard), principal, 'local-fixture'),
        {
          code: 'RDP_SETTING_NOT_IMPLEMENTED',
        },
      );
      assert.equal(worker.started, 0);
    } finally {
      await manager.shutdown();
    }
  }
  const worker = new FakeSessionWorker(),
    manager = new SessionManager({ workerFactory: () => worker });
  try {
    assert.throws(() => manager.create(config(), principal, 'local-fixture'), {
      code: 'RDP_SETTING_NOT_IMPLEMENTED',
    });
    assert.equal(worker.started, 0);
  } finally {
    await manager.shutdown();
  }
});
