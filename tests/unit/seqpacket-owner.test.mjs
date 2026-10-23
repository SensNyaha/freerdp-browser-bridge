import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import {
  SeqpacketOwner,
  loadPacketAddon,
} from '../../packages/node-bridge/dist/seqpacket-owner.js';
import {
  Kind,
  encodePacket,
  helloPayload,
} from '../../packages/protocol/dist/index.js';

const wire = (id = 1n) =>
  encodePacket({
    kind: Kind.Heartbeat,
    requestId: id,
    payload: Buffer.alloc(0),
  });
function api() {
  return {
    schemaVersion: 1,
    writes: [],
    input: [],
    blocked: true,
    ended: false,
    closedValue: true,
    closeCalls: 0,
    creates: 0,
    mask: 0,
    create() {
      ++this.creates;
      return 1;
    },
    childFd() {
      return 9;
    },
    closeChild() {
      return true;
    },
    watch(_id, cb) {
      this.callback = cb;
      return true;
    },
    interest(_id, mask) {
      this.mask = mask;
      return true;
    },
    write(_id, bytes) {
      this.writes.push(Buffer.from(bytes));
      return !this.blocked;
    },
    flush() {
      return !this.blocked;
    },
    read() {
      return this.input.shift() ?? (this.ended ? undefined : null);
    },
    close() {
      ++this.closeCalls;
      return true;
    },
    closed() {
      return this.closedValue;
    },
    fire(events) {
      this.callback(0, events);
    },
  };
}
async function owner(model, options) {
  const value = await SeqpacketOwner.open(model, options);
  value.on('error', () => {});
  return value;
}
test('packet owner: invalid options and module profile fail before socket allocation without external error text', async () => {
  const model = api();
  for (const options of [
    { maxRecords: 0 },
    { maxBytes: -1 },
    { recordTimeoutMs: 19 },
    { recordTimeoutMs: 1001 },
    { closeTimeoutMs: 5001 },
  ])
    await assert.rejects(SeqpacketOwner.open(model, options), {
      code: 'IPC_INVALID_OPTIONS',
    });
  assert.equal(model.creates, 0);
  assert.throws(() => loadPacketAddon('/missing/private-adapter.node'), {
    code: 'IPC_ADAPTER_PROFILE',
  });
  model.create = () => {
    throw new Error('private fixture detail');
  };
  await assert.rejects(SeqpacketOwner.open(model), {
    code: 'IPC_CREATE_FAILED',
  });
});
test('packet owner: one native send plus bounded FIFO/bytes refuse excess before dispatch and preserve order', async () => {
  const model = api();
  const value = await owner(model, { maxRecords: 2, maxBytes: 48 });
  const replies = [];
  assert.equal(
    value.write(wire(1n), (error) => replies.push([1, error?.code])),
    true,
  );
  assert.equal(
    value.write(wire(2n), (error) => replies.push([2, error?.code])),
    true,
  );
  assert.equal(
    value.write(wire(3n), (error) => replies.push([3, error?.code])),
    false,
  );
  await delay(0);
  assert.deepEqual(replies, [[3, 'IPC_QUEUE_FULL']]);
  assert.equal(model.writes.length, 1);
  assert.equal(value.writableLength, 48);
  model.blocked = false;
  model.fire(2);
  assert.deepEqual(replies, [
    [3, 'IPC_QUEUE_FULL'],
    [1, undefined],
    [2, undefined],
  ]);
  assert.deepEqual(
    model.writes.map((bytes) => bytes.readBigUInt64BE(12)),
    [1n, 2n],
  );
  assert.equal(value.writableLength, 0);
  value.destroy();
  await value.retired;
});
test('packet owner: independent write timeout revokes and wipes active plus unsent private records without readiness', async () => {
  const model = api();
  const value = await owner(model, { recordTimeoutMs: 20 });
  const first = wire();
  const second = encodePacket({
    kind: Kind.Secret,
    requestId: 2n,
    payload: Buffer.from('synthetic-private-data'),
  });
  const results = [];
  value.write(first, (error) => results.push(error?.code));
  value.write(second, (error) => results.push(error?.code));
  await value.retired;
  assert.deepEqual(results, ['IPC_RECORD_TIMEOUT', 'IPC_RECORD_TIMEOUT']);
  assert.ok(first.every((byte) => byte === 0));
  assert.ok(second.every((byte) => byte === 0));
  assert.equal(model.closeCalls, 1);
  assert.equal(value.snapshot.bytes, 0);
  assert.equal(value.snapshot.records, 0);
});
test('packet owner: paused partial read keeps original independent deadline and accepts no later bytes', async () => {
  const model = api();
  const value = await owner(model, { recordTimeoutMs: 20 });
  const record = encodePacket({
    kind: Kind.Hello,
    requestId: 1n,
    payload: helloPayload(),
  });
  model.input.push(record.subarray(0, 24), record.subarray(24));
  let chunks = 0;
  value.on('data', () => {
    ++chunks;
    value.pause();
  });
  value.resume();
  model.fire(1);
  assert.equal(value.snapshot.readRemaining, 8);
  assert.equal(model.mask, 0);
  await value.retired;
  model.fire(1);
  assert.equal(chunks, 1);
  assert.equal(value.snapshot.readRemaining, 0);
});
test('packet owner: resume completes exact partial bytes; clean EOF differs from partial EOF', async () => {
  const model = api();
  const value = await owner(model);
  const chunks = [];
  const record = encodePacket({
    kind: Kind.Hello,
    requestId: 1n,
    payload: helloPayload(),
  });
  model.input.push(record.subarray(0, 24), record.subarray(24));
  value.on('data', (chunk) => {
    chunks.push(Buffer.from(chunk));
    if (chunks.length === 1) value.pause();
  });
  value.resume();
  model.fire(1);
  value.resume();
  model.fire(1);
  assert.deepEqual(Buffer.concat(chunks), record);
  let ended = 0;
  value.on('end', () => ++ended);
  model.ended = true;
  model.fire(1);
  await value.retired;
  assert.equal(ended, 1);
  const partial = api();
  const other = await owner(partial);
  partial.input.push(record.subarray(0, 24));
  partial.ended = true;
  let error;
  other.on('error', (value) => {
    error = value;
  });
  other.on('data', () => {});
  other.resume();
  partial.fire(1);
  await other.retired;
  await delay(0);
  assert.equal(error.code, 'IPC_READ_FAILED');
});
test('packet owner: consumer faults and reentrant write callbacks cannot widen ownership or reorder FIFO', async () => {
  const model = api();
  const value = await owner(model);
  const order = [];
  value.write(wire(1n), () => {
    order.push(1);
    value.write(wire(3n), () => order.push(3));
  });
  value.write(wire(2n), () => order.push(2));
  model.blocked = false;
  model.fire(2);
  assert.deepEqual(order, [1, 2, 3]);
  assert.deepEqual(
    model.writes.map((bytes) => bytes.readBigUInt64BE(12)),
    [1n, 2n, 3n],
  );
  value.on('data', () => {
    throw new Error('private callback detail');
  });
  let error;
  value.on('error', (value) => {
    error = value;
  });
  model.input.push(wire());
  value.resume();
  model.fire(1);
  await value.retired;
  await delay(0);
  assert.equal(error.code, 'IPC_READ_FAILED');
  assert.doesNotMatch(error.message, /private callback detail/);
});
test('packet owner: native closure remains owned until observation; duplicate destroy cannot close twice', async () => {
  const model = api();
  model.closedValue = false;
  const value = await owner(model, { closeTimeoutMs: 200 });
  model.ended = true;
  value.on('data', () => {});
  value.resume();
  model.fire(1);
  value.destroy();
  let joined = false;
  void value.retired.then(() => {
    joined = true;
  });
  await delay(25);
  assert.equal(joined, false);
  assert.equal(value.snapshot.retired, false);
  assert.equal(model.closeCalls, 1);
  model.closedValue = true;
  await value.retired;
  assert.equal(value.snapshot.retired, true);
});
test('packet owner: failed binding joins native cleanup and expired uncertain closure is never reported retired', async () => {
  const model = api();
  model.watch = () => {
    throw new Error('private bind fault');
  };
  await assert.rejects(SeqpacketOwner.open(model), { code: 'IPC_BIND_FAILED' });
  assert.equal(model.closeCalls, 1);
  const stuck = api();
  stuck.closedValue = false;
  const value = await owner(stuck, { closeTimeoutMs: 20 });
  value.destroy();
  await assert.rejects(value.retired, { code: 'IPC_CLOSE_TIMEOUT' });
  assert.equal(value.snapshot.retired, false);
});
