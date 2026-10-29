import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { discardRejectedFileBody } from '../../apps/bridge-api/dist/file-refusal.js';

function request(headers) {
  const stream = new PassThrough();
  stream.headers = headers;
  stream.complete = false;
  return stream;
}
test('rejected declared bodies are discarded as a stream without retaining chunks or listeners', async () => {
  const body = request({ 'content-length': '2097153' });
  const discard = discardRejectedFileBody(body);
  for (let i = 0; i < 32; i++) body.write(Buffer.alloc(65536, 17));
  body.end(Buffer.from([17]));
  await discard;
  for (const event of ['data', 'end', 'close', 'error'])
    assert.equal(body.listenerCount(event), 0);
  assert.equal(body.readableLength, 0);
  assert.equal(body.isPaused(), true);
  body.destroy();
});
test('unknown, excessive, Expect and ambiguous framing does not start body consumption', async () => {
  for (const headers of [
    {},
    { 'content-length': '4194305' },
    { 'content-length': '01' },
    { 'content-length': '10', expect: '100-continue' },
    { 'content-length': '10', 'transfer-encoding': 'chunked' },
  ]) {
    const body = request(headers);
    body.write(Buffer.from('keep'));
    await discardRejectedFileBody(body);
    assert.equal(body.readableLength, 4);
    assert.equal(body.listenerCount('data'), 0);
    body.destroy();
  }
});
test('a stopped producer cannot prolong a rejected upload past the fixed drain budget', async () => {
  const body = request({ 'content-length': '100' });
  const started = performance.now();
  await discardRejectedFileBody(body);
  assert.ok(performance.now() - started >= 200);
  assert.ok(performance.now() - started < 2000);
  assert.equal(body.isPaused(), true);
  for (const event of ['data', 'end', 'close', 'error'])
    assert.equal(body.listenerCount(event), 0);
  body.destroy();
});
test('peer failure or disconnect releases the drain immediately', async () => {
  for (const failed of [false, true]) {
    const body = request({ 'content-length': '100' });
    const done = discardRejectedFileBody(body);
    if (failed) body.emit('error', new Error('synthetic'));
    else body.emit('close');
    await done;
    assert.equal(body.listenerCount('data'), 0);
    assert.equal(body.isPaused(), true);
    body.destroy();
  }
});
