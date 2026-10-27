import test from 'node:test';
import assert from 'node:assert/strict';
import { ClipboardImageConversion } from '../../apps/reference-harness/clipboard-image-conversion.js';
const item = () => ({
  width: 2,
  height: 1,
  rgba: new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255]),
});
const blob = () => new Blob([new Uint8Array(45)], { type: 'image/png' });
function fixture() {
  const f = { created: 0, terminated: 0 };
  f.worker = {
    postMessage(message, transfer) {
      f.message = structuredClone(message, { transfer });
    },
    terminate() {
      ++f.terminated;
    },
  };
  f.codec = new ClipboardImageConversion(() => {
    ++f.created;
    return f.worker;
  });
  return f;
}
test('browser image conversion admission refuses invalid input before allocating a worker', async () => {
  const f = fixture();
  for (const [op, value, max] of [
    ['bad', blob(), 1024],
    ['decode', new Blob(['wrong']), 1024],
    ['decode', blob(), 0],
    ['encode', { ...item(), width: 0 }, 1024],
    ['encode', item(), 7],
  ])
    assert.equal((await f.codec.run(op, value, max)).status, 'invalid');
  assert.equal(f.created, 0);
  f.codec.dispose();
  assert.equal(
    (await f.codec.run('decode', blob(), 1024)).status,
    'unavailable',
  );
});
test('browser image conversion owns a synchronously copied transferable item and bounds one active job', async () => {
  const f = fixture(),
    value = item(),
    original = Array.from(value.rgba);
  const promise = f.codec.run('encode', value, 1024);
  value.rgba.fill(0);
  assert.deepEqual(Array.from(f.message.item.rgba), original);
  assert.equal((await f.codec.run('decode', blob(), 1024)).status, 'busy');
  const output = blob();
  f.worker.onmessage({ data: { v: 1, status: 'accepted', blob: output } });
  assert.deepEqual(await promise, { status: 'accepted', blob: output });
  assert.equal(f.terminated, 1);
  assert.equal(f.worker.onmessage, null);
  f.message.item.rgba.fill(0);
  f.codec.dispose();
});
test('browser image conversion cancels and wipes a late queued decoded item without reviving ownership', async () => {
  const f = fixture(),
    promise = f.codec.run('decode', blob(), 1024),
    queued = f.worker.onmessage;
  f.codec.cancel();
  assert.equal((await promise).status, 'cancelled');
  const value = item();
  queued({ data: { v: 1, status: 'accepted', item: value } });
  assert.ok(value.rgba.every((v) => !v));
  assert.equal(f.terminated, 1);
  assert.equal(f.codec.active, undefined);
  f.codec.dispose();
});
test('browser image conversion refuses negative content malformed geometry and wrong operation replies with wipe', async () => {
  for (const reply of [
    { v: 1, status: 'invalid', item: item() },
    { v: 2, status: 'accepted', item: item() },
    { v: 1, status: 'accepted', item: { ...item(), width: 3 } },
    { v: 1, status: 'accepted', blob: blob() },
  ]) {
    const f = fixture(),
      promise = f.codec.run('decode', blob(), 1024);
    f.worker.onmessage({ data: reply });
    assert.equal((await promise).status, 'invalid');
    if (reply.item) assert.ok(reply.item.rgba.every((v) => !v));
    assert.equal(f.terminated, 1);
    f.codec.dispose();
  }
});
test('browser image conversion transfers only known decoded fields after native write quota admission', async () => {
  const f = fixture(),
    promise = f.codec.run('decode', blob(), 132),
    value = { ...item(), private: 'ignored' };
  f.worker.onmessage({ data: { v: 1, status: 'accepted', item: value } });
  const result = await promise;
  assert.equal(result.status, 'accepted');
  assert.deepEqual(Object.keys(result.item).sort(), [
    'height',
    'rgba',
    'width',
  ]);
  assert.equal(result.item.rgba, value.rgba);
  result.item.rgba.fill(0);
  f.codec.dispose();
  const g = fixture(),
    refused = g.codec.run('decode', blob(), 131),
    over = item();
  g.worker.onmessage({ data: { v: 1, status: 'accepted', item: over } });
  assert.equal((await refused).status, 'invalid');
  assert.ok(over.rgba.every((v) => !v));
  g.codec.dispose();
});
test('browser image conversion deadline terminates the worker and releases its job without retry', async () => {
  const f = fixture(),
    promise = f.codec.run('decode', blob(), 1024);
  assert.equal((await promise).status, 'timeout');
  assert.equal(f.created, 1);
  assert.equal(f.terminated, 1);
  assert.equal(f.codec.active, undefined);
  f.codec.dispose();
});
