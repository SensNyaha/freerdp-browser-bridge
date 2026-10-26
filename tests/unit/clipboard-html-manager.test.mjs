import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionManager } from '../../packages/node-bridge/dist/index.js';
import { HtmlSessionWorker } from '../fixtures/html-session-worker.mjs';
import { eventually } from '../fixtures/session-worker.mjs';
const principal = { id: 'html-owner' };
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const value = () => ({
  body: Buffer.from('<b>X</b>'),
  fragmentOffset: 0,
  fragmentBytes: 8,
  selectionOffset: 0,
  selectionBytes: 0,
  selection: false,
  context: false,
  text: Buffer.from('X'),
});
async function fixture(body) {
  const worker = new HtmlSessionWorker();
  let reservation;
  const manager = new SessionManager({
    workerFactory: (limits) => {
      reservation = limits;
      return worker;
    },
  });
  try {
    const session = manager.create(
      {
        target: { host: 'synthetic' },
        auth: {},
        clipboard: { mode: 'bidirectional', html: true, maxItemBytes: 1024 },
      },
      principal,
      'html-fixture',
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
    await body({ worker, manager, session, attach, reservation });
  } finally {
    await manager.shutdown();
  }
}
test('HTML manager: frozen format reservation, copied scalar state and current control-only operations', async () => {
  await fixture(async ({ worker, attach, reservation }) => {
    assert.deepEqual(reservation, {
      clipboardItemBytes: 1024,
      clipboardHtml: true,
    });
    assert.equal(Object.isFrozen(reservation), true);
    const media = attach('media');
    await assert.rejects(media.readClipboardHtml(1n), {
      code: 'ATTACH_INVALID',
    });
    const control = attach();
    assert.deepEqual(await control.readClipboardHtml(1n), {
      status: 'unavailable',
    });
    assert.equal(control.startClipboard(), true);
    const source = control.clipboardSnapshot;
    assert.equal(source.state.html, true);
    source.state.remoteHtml = false;
    assert.equal(control.clipboardSnapshot.state.remoteHtml, true);
    worker.publish({ privateCanary: 'never expose content in metadata' });
    assert.equal(
      Object.hasOwn(control.clipboardSnapshot.state, 'privateCanary'),
      false,
    );
    const result = await control.readClipboardHtml(1n);
    assert.equal(result.status, 'accepted');
    assert.equal(result.item.body.toString(), worker.htmlBody.toString());
    assert.equal(await control.writeClipboardHtml(value()), 'accepted');
    assert.equal(control.clipboardSnapshot.state.localHtmlAccepted, true);
    assert.equal(await control.stopClipboard(), true);
    assert.equal(worker.revokes, 1);
    result.item.body.fill(0);
    result.item.text.fill(0);
    control.release();
    media.release();
  });
});
test('HTML manager: a new controller waits for old HTML write and actual no-format ACK', async () => {
  await fixture(async ({ worker, attach }) => {
    const write = deferred(),
      revoke = deferred();
    worker.writeGate = write.promise;
    worker.revokeGate = revoke.promise;
    const first = attach();
    assert.equal(first.startClipboard(), true);
    const writing = first.writeClipboardHtml(value());
    first.release();
    const second = attach();
    assert.equal(second.startClipboard(), false);
    write.resolve();
    assert.equal(await writing, 'disconnected');
    await eventually(() => worker.revokes === 1);
    assert.equal(second.startClipboard(), false);
    assert.ok(worker.written.body.every((byte) => byte === 0));
    revoke.resolve();
    await eventually(() => !second.clipboardSnapshot.retiring);
    assert.equal(second.startClipboard(), true);
    await assert.rejects(first.readClipboardHtml(1n), {
      code: 'ATTACH_INVALID',
    });
    second.release();
  });
});
test('HTML manager: detached rich read wipes both content views before another controller can receive it', async () => {
  await fixture(async ({ worker, attach }) => {
    const read = deferred();
    worker.readGate = read.promise;
    const first = attach();
    first.startClipboard();
    const reading = first.readClipboardHtml(1n);
    first.release();
    const second = attach();
    assert.equal(second.startClipboard(), false);
    read.resolve();
    assert.deepEqual(await reading, { status: 'disconnected' });
    await eventually(() => !second.clipboardSnapshot.retiring);
    assert.ok(worker.returned[0].body.every((byte) => byte === 0));
    assert.ok(worker.returned[0].text.every((byte) => byte === 0));
    assert.equal(second.startClipboard(), true);
    second.release();
  });
});
test('HTML manager: changing selected format policy fails closed instead of downgrading to text', async () => {
  await fixture(async ({ worker, manager, session }) => {
    delete worker.source.html;
    delete worker.source.remoteHtml;
    delete worker.source.localHtmlAccepted;
    worker.publish();
    await eventually(
      () => manager.get(session.sessionId, principal).state === 'failed',
    );
    assert.equal(
      manager.get(session.sessionId, principal).error.code,
      'WORKER_INVALID_STATE',
    );
  });
});
