import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionManager } from '../../packages/node-bridge/dist/index.js';
import {
  ImageSessionWorker,
  imageItem,
} from '../fixtures/image-session-worker.mjs';
import { eventually } from '../fixtures/session-worker.mjs';
const principal = { id: 'image-owner' };
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { resolve, promise };
};
async function fixture(body) {
  const worker = new ImageSessionWorker();
  let limits;
  const manager = new SessionManager({
    workerFactory: (l) => {
      limits = l;
      return worker;
    },
  });
  try {
    const session = manager.create(
      {
        target: { host: 'synthetic' },
        auth: {},
        clipboard: { mode: 'bidirectional', images: true, maxItemBytes: 1024 },
      },
      principal,
      'image-fixture',
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
    await body({ worker, manager, session, attach, limits });
  } finally {
    await manager.shutdown();
  }
}
test('Image manager: frozen reservation copied metadata and current control-only image authority', async () => {
  await fixture(async ({ worker, attach, limits }) => {
    assert.deepEqual(limits, {
      clipboardItemBytes: 1024,
      clipboardImage: true,
    });
    assert.equal(Object.isFrozen(limits), true);
    const media = attach('media');
    await assert.rejects(media.readClipboardImage(1n), {
      code: 'ATTACH_INVALID',
    });
    const control = attach();
    assert.deepEqual(await control.readClipboardImage(1n), {
      status: 'unavailable',
    });
    assert.equal(control.startClipboard(), true);
    const source = control.clipboardSnapshot;
    source.state.remoteImage = false;
    assert.equal(control.clipboardSnapshot.state.remoteImage, true);
    worker.publish({ privateCanary: 'never metadata' });
    assert.equal(
      Object.hasOwn(control.clipboardSnapshot.state, 'privateCanary'),
      false,
    );
    const result = await control.readClipboardImage(1n);
    assert.deepEqual(result.item, imageItem());
    assert.equal(await control.writeClipboardImage(imageItem()), 'accepted');
    assert.equal(control.clipboardSnapshot.state.localImageAccepted, true);
    assert.equal(await control.stopClipboard(), true);
    assert.equal(worker.revokes, 1);
    assert.ok(worker.written.rgba.every((b) => b === 0));
    result.item.rgba.fill(0);
    control.release();
    media.release();
  });
});
test('Image manager: replacement controller waits for image write and actual revoke completion', async () => {
  await fixture(async ({ worker, attach }) => {
    const write = deferred(),
      revoke = deferred();
    worker.writeGate = write.promise;
    worker.revokeGate = revoke.promise;
    const first = attach();
    first.startClipboard();
    const pending = first.writeClipboardImage(imageItem());
    first.release();
    const second = attach();
    assert.equal(second.startClipboard(), false);
    write.resolve();
    assert.equal(await pending, 'disconnected');
    await eventually(() => worker.revokes === 1);
    assert.equal(second.startClipboard(), false);
    revoke.resolve();
    await eventually(() => !second.clipboardSnapshot.retiring);
    assert.equal(second.startClipboard(), true);
    assert.ok(worker.written.rgba.every((b) => b === 0));
    second.release();
  });
});
test('Image manager: late pixels after detach are wiped before a replacement grant', async () => {
  await fixture(async ({ worker, attach }) => {
    const read = deferred();
    worker.readGate = read.promise;
    const first = attach();
    first.startClipboard();
    const pending = first.readClipboardImage(1n);
    first.release();
    const second = attach();
    assert.equal(second.startClipboard(), false);
    read.resolve();
    assert.deepEqual(await pending, { status: 'disconnected' });
    await eventually(() => !second.clipboardSnapshot.retiring);
    assert.ok(worker.returned[0].rgba.every((b) => b === 0));
    assert.equal(second.startClipboard(), true);
    second.release();
  });
});
test('Image manager: image policy downgrade fails closed instead of dropping scalar selection', async () => {
  await fixture(async ({ worker, manager, session }) => {
    delete worker.source.image;
    delete worker.source.remoteImage;
    delete worker.source.localImageAccepted;
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
test('Image manager: missing image hooks refuse startup before backend invocation', async () => {
  const worker = new ImageSessionWorker();
  worker.readClipboardImage = undefined;
  let starts = 0;
  worker.start = async () => {
    ++starts;
  };
  const manager = new SessionManager({ workerFactory: () => worker });
  try {
    assert.throws(
      () =>
        manager.create(
          {
            target: { host: 'synthetic' },
            auth: {},
            clipboard: { mode: 'bidirectional', images: true },
          },
          principal,
          'image-missing',
        ),
      { code: 'RDP_SETTING_NOT_IMPLEMENTED' },
    );
    assert.equal(starts, 0);
  } finally {
    await manager.shutdown();
  }
});
