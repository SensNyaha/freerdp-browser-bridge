import test from 'node:test';
import assert from 'node:assert/strict';
import {
  imageLabDocument,
  imageLabPixels,
  parseImageLabReceipt,
} from '../../scripts/image-rdp-lab-fixture.mjs';
const id = '0'.repeat(32);
const receipt = () => ({
  v: 1,
  id,
  ready: true,
  source: 1,
  copies: 1,
  pastes: 1,
  pending: false,
  ok: true,
  png: true,
});
test('owned image fixture uses exact finite independent role/revision pixels', () => {
  const local = imageLabPixels(id, 'browser', 0),
    remote = imageLabPixels(id, 'remote', 1),
    next = imageLabPixels(id, 'remote', 2);
  assert.equal(local.length, 4096);
  assert.deepEqual(
    Array.from(local.subarray(0, 8)),
    [0, 0, 0, 255, 1, 3, 7, 255],
  );
  assert.deepEqual(Array.from(remote.subarray(0, 4)), [84, 166, 240, 255]);
  assert.notDeepEqual(next, remote);
  for (const args of [
    [id, 'wrong', 0],
    [id, 'remote', -1],
    [id, 'remote', 3],
    ['x'.repeat(32), 'remote', 1],
  ])
    assert.throws(() => imageLabPixels(...args));
  local.fill(0);
  remote.fill(0);
  next.fill(0);
});
test('owned image application document binds only an admitted nonce and static local code', async () => {
  const doc = await imageLabDocument(id);
  assert.ok(doc.html.includes('Owned image clipboard lab'));
  assert.ok(
    !doc.html.includes('__NONCE__') && !doc.html.includes('__PIXELS__'),
  );
  assert.ok(Buffer.byteLength(doc.html) < 20480);
  assert.match(doc.sha256, /^[0-9a-f]{64}$/);
  for (const nonce of ['', id + 'x', "';fetch('https://invalid.test')"])
    await assert.rejects(() => imageLabDocument(nonce));
});
test('owned image receipt accepts only finite content-free counters and exact identity', () => {
  assert.deepEqual(parseImageLabReceipt(JSON.stringify(receipt()), id), {
    ready: true,
    source: 1,
    copies: 1,
    pastes: 1,
    pending: false,
    ok: true,
    png: true,
  });
  for (const patch of [
    { id: '1'.repeat(32) },
    { private: 'do-not-echo' },
    { source: 3 },
    { copies: 2 },
    { pastes: -1 },
    { pending: 1 },
    { png: false },
    { pastes: 0 },
  ])
    assert.throws(() =>
      parseImageLabReceipt(JSON.stringify({ ...receipt(), ...patch }), id),
    );
  for (const text of ['x'.repeat(513), 'null', '[]', 'not-json'])
    assert.throws(() => parseImageLabReceipt(text, id));
});
