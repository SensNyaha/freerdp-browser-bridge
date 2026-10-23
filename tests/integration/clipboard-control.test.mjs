import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { Writable } from 'node:stream';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createSessionServer } from '../../apps/bridge-api/dist/session-server.js';
import {
  encodeClipboardChunk,
  decodeClipboardChunk,
} from '../../packages/protocol/dist/index.js';
import { FakeSessionWorker, eventually } from '../fixtures/session-worker.mjs';
const { WebSocket } = createRequire(
  new URL('../../apps/bridge-api/package.json', import.meta.url),
)('ws');
const origin = 'https://clipboard.example.test';
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
class Backend extends FakeSessionWorker {
  source = {
    generation: 1n,
    revision: 1n,
    maximum: 1048576,
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
  inputs = [];
  readText = Buffer.from('synthetic remote Ж😀');
  returned = [];
  written;
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
    this.publish();
  }
  async readClipboardText() {
    ++this.reads;
    const text = Buffer.from(this.readText);
    this.returned.push(text);
    return { status: 'accepted', text };
  }
  async writeClipboardText(bytes) {
    ++this.writes;
    this.written = Buffer.from(bytes);
    this.publish({ localPending: true });
    if (this.writeGate) await this.writeGate;
    this.publish({ localPending: false, localAccepted: true });
    return 'accepted';
  }
  async revokeClipboardText() {
    ++this.revokes;
    this.publish({ localAccepted: false, localPending: true });
    if (this.revokeGate) await this.revokeGate;
    this.publish({ localPending: false });
    return 'accepted';
  }
  async sendInput(event) {
    this.inputs.push(event);
  }
}
async function fixture(run, mode = 'bidirectional') {
  const root = await mkdtemp(join(tmpdir(), 'rdp-clipboard-ws-')),
    worker = new Backend(),
    logs = [],
    sockets = [];
  const server = await createSessionServer({
    worker: {
      runtimeRoot: root,
      workerPath: resolve(
        process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
        'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
      ),
    },
    authenticate: () => ({ id: 'clipboard-fixture' }),
    allowedOrigins: [origin],
    sessions: { workerFactory: () => worker },
    logDestination: new Writable({
      write(bytes, _encoding, done) {
        logs.push(bytes.toString());
        done();
      },
    }),
  });
  try {
    await server.listen({ host: '127.0.0.1', port: 0 });
    const response = await server.inject({
      method: 'POST',
      url: '/v1/sessions',
      payload: {
        target: { host: 'synthetic' },
        auth: {},
        clipboard: { mode, text: true, maxItemBytes: 1048576 },
      },
    });
    assert.equal(response.statusCode, 202);
    const created = response.json();
    const open = async (fresh = false) => {
      const token = fresh
        ? (
            await server.inject({
              method: 'POST',
              url: '/v1/sessions/' + created.sessionId + '/attach-token',
              payload: { channel: 'control' },
            })
          ).json().token
        : created.attach.control.token;
      const ws = new WebSocket(
        'ws://127.0.0.1:' +
          server.server.address().port +
          '/v1/sessions/' +
          created.sessionId +
          '/control?token=' +
          token,
        ['freerdp-bridge-v1'],
        { origin },
      );
      sockets.push(ws);
      ws.on('error', () => {});
      const messages = [],
        binary = [];
      let sequence = 0;
      ws.on('message', (bytes, raw) => {
        if (messages.length + binary.length >= 1024)
          throw new Error('Fixture record bound');
        if (raw) binary.push(Buffer.from(bytes));
        else messages.push(JSON.parse(bytes.toString()));
      });
      await once(ws, 'open');
      await eventually(() =>
        messages.some(
          (m) => m.type === 'clipboard.offer' && m.data.state?.ready,
        ),
      );
      return {
        ws,
        messages,
        binary,
        send(type, data) {
          const seq = sequence++;
          ws.send(JSON.stringify({ v: 1, type, seq, ts: Date.now(), data }));
          return seq;
        },
        async event(type, requestSeq) {
          await eventually(() =>
            messages.some(
              (m) =>
                m.type === type &&
                (requestSeq === undefined || m.data.requestSeq === requestSeq),
            ),
          );
          return messages.find(
            (m) =>
              m.type === type &&
              (requestSeq === undefined || m.data.requestSeq === requestSeq),
          ).data;
        },
      };
    };
    const status = async () =>
      (
        await server.inject({
          method: 'GET',
          url: '/v1/sessions/' + created.sessionId,
        })
      ).json();
    await run({ worker, server, created, open, status, logs });
  } finally {
    for (const ws of sockets) ws.terminate();
    await server.close();
    worker.readText.fill(0);
    worker.written?.fill(0);
    assert.deepEqual(await readdir(root), []);
    const absolute = resolve(root);
    if (!absolute.startsWith(resolve(tmpdir()) + sep + 'rdp-clipboard-ws-'))
      throw new Error('Invalid owned fixture directory');
    await rm(absolute, { recursive: true, force: true, maxRetries: 3 });
  }
}
async function upload(client, bytes) {
  const seq = client.send('clipboard.set', {
    generation: '1',
    bytes: bytes.length,
  });
  let { creditEnd } = await client.event('clipboard.set.ready', seq);
  for (let offset = 0; offset < bytes.length; ) {
    while (offset < creditEnd) {
      const end = Math.min(bytes.length, offset + 4076);
      client.ws.send(
        encodeClipboardChunk({
          requestSeq: seq,
          offset,
          bytes: bytes.subarray(offset, end),
        }),
      );
      offset = end;
    }
    if (offset < bytes.length) {
      await eventually(() =>
        client.messages.some(
          (m) =>
            m.type === 'clipboard.set.ack' &&
            m.data.requestSeq === seq &&
            m.data.offset === offset,
        ),
      );
      creditEnd = client.messages.find(
        (m) =>
          m.type === 'clipboard.set.ack' &&
          m.data.requestSeq === seq &&
          m.data.offset === offset,
      ).data.creditEnd;
    }
  }
  return client.event('clipboard.set.result', seq);
}
async function download(client) {
  const seq = client.send('clipboard.request', {
    generation: '1',
    revision: '1',
  });
  const meta = await client.event('clipboard.data', seq);
  assert.equal(meta.status, 'accepted');
  const bytes = Buffer.alloc(meta.bytes);
  let offset = 0,
    creditEnd = meta.creditEnd;
  for (;;) {
    await eventually(
      () =>
        client.binary.reduce(
          (n, b) => n + decodeClipboardChunk(b).bytes.length,
          0,
        ) >=
        creditEnd - offset,
    );
    const window = client.binary.splice(0);
    assert.ok(window.length <= 8);
    for (const record of window) {
      const chunk = decodeClipboardChunk(record);
      assert.equal(chunk.requestSeq, seq);
      assert.equal(chunk.offset, offset);
      chunk.bytes.copy(bytes, offset);
      offset += chunk.bytes.length;
      record.fill(0);
    }
    client.send('clipboard.ack', { requestSeq: seq, offset });
    if (offset === meta.bytes) break;
    creditEnd = Math.min(meta.bytes, offset + 32608);
  }
  assert.equal(
    (await client.event('clipboard.data.complete', seq)).status,
    'accepted',
  );
  return bytes;
}
test('fake RDP / actual control WS: bounded Unicode upload/download, input interleave and content-free logs', async () => {
  await fixture(async ({ worker, open, status, logs }) => {
    const client = await open(),
      value = Buffer.alloc(65536 + 100, 65);
    value.fill(Buffer.from('界'), 0, value.length - (value.length % 3));
    client.send('input.key', { code: 'KeyA', down: true, repeat: false });
    assert.equal((await upload(client, value)).status, 'accepted');
    assert.equal(worker.written.equals(value), true);
    assert.equal(
      worker.inputs.some((e) => e.type === 'key' && e.down),
      true,
    );
    worker.readText = Buffer.from(value);
    const received = await download(client);
    assert.equal(received.equals(value), true);
    assert.ok(worker.returned[0].every((b) => b === 0));
    client.ws.close();
    await once(client.ws, 'close');
    await eventually(() => worker.revokes === 1);
    assert.equal((await status()).state, 'connected');
    assert.equal(logs.join('').includes('synthetic remote'), false);
    received.fill(0);
    value.fill(0);
  });
});
test('fake RDP / actual control WS: malformed body and wrong ACK close only control and wipe retained read', async () => {
  for (const mode of ['offset', 'header', 'ack', 'oversize'])
    await fixture(async ({ worker, open, status }) => {
      const client = await open(),
        closed = once(client.ws, 'close');
      if (mode === 'ack') {
        worker.readText = Buffer.alloc(40000, 65);
        const seq = client.send('clipboard.request', {
          generation: '1',
          revision: '1',
        });
        await client.event('clipboard.data', seq);
        await eventually(() => client.binary.length === 8);
        client.send('clipboard.ack', { requestSeq: seq, offset: 1 });
      } else {
        const seq = client.send('clipboard.set', {
          generation: '1',
          bytes: 5000,
        });
        await client.event('clipboard.set.ready', seq);
        const record = encodeClipboardChunk({
          requestSeq: seq,
          offset: mode === 'offset' ? 1 : 0,
          bytes: Buffer.alloc(4076, 65),
        });
        if (mode === 'header') record[0] = 0;
        client.ws.send(
          mode === 'oversize' ? Buffer.concat([record, Buffer.of(0)]) : record,
        );
      }
      const [code] = await closed;
      assert.equal(code, mode === 'oversize' ? 1009 : 1008);
      assert.equal((await status()).state, 'connected');
      assert.equal(worker.writes, 0);
      assert.ok(worker.returned.every((b) => b.every((n) => n === 0)));
    });
});
test(
  'fake RDP / actual control WS: stalled credit/upload expire independently without failing the RDP session',
  { timeout: 15000 },
  async () => {
    for (const read of [false, true])
      await fixture(async ({ worker, open, status }) => {
        const client = await open(),
          closed = once(client.ws, 'close');
        client.send(
          read ? 'clipboard.request' : 'clipboard.set',
          read
            ? { generation: '1', revision: '1' }
            : { generation: '1', bytes: 5000 },
        );
        assert.equal((await closed)[0], 1008);
        assert.equal((await status()).state, 'connected');
        assert.equal(worker.writes, 0);
        assert.ok(worker.returned.every((b) => b.every((n) => n === 0)));
      });
  },
);
test('fake RDP / actual control WS: directional refusal has no native operation and binary flooding is bounded', async () => {
  await fixture(async ({ worker, open }) => {
    const client = await open();
    const seq = client.send('clipboard.request', {
      generation: '1',
      revision: '1',
    });
    assert.equal((await client.event('clipboard.data', seq)).status, 'refused');
    assert.equal(worker.reads, 0);
  }, 'browser-to-server');
  await fixture(async ({ worker, open }) => {
    const client = await open();
    const seq = client.send('clipboard.set', { generation: '1', bytes: 0 });
    assert.equal(
      (await client.event('clipboard.set.result', seq)).status,
      'refused',
    );
    assert.equal(worker.writes, 0);
  }, 'server-to-browser');
  await fixture(async ({ worker, open, status }) => {
    const client = await open(),
      closed = once(client.ws, 'close');
    const seq = client.send('clipboard.set', {
      generation: '1',
      bytes: 1048576,
    });
    await client.event('clipboard.set.ready', seq);
    for (let n = 0; n < 129; ++n)
      client.ws.send(
        encodeClipboardChunk({
          requestSeq: seq,
          offset: n * 4076,
          bytes: Buffer.alloc(4076, 65),
        }),
        () => {},
      );
    assert.equal((await closed)[0], 1008);
    assert.equal(worker.writes, 0);
    assert.equal((await status()).state, 'connected');
  });
});
test('fake RDP / actual control WS: replacement clipboard waits for old write and revoke ACK', async () => {
  await fixture(async ({ worker, open }) => {
    const written = deferred(),
      revoked = deferred();
    worker.writeGate = written.promise;
    worker.revokeGate = revoked.promise;
    const first = await open();
    const seq = first.send('clipboard.set', { generation: '1', bytes: 1 });
    await first.event('clipboard.set.ready', seq);
    first.ws.send(
      encodeClipboardChunk({
        requestSeq: seq,
        offset: 0,
        bytes: Buffer.of(65),
      }),
    );
    await eventually(() => worker.writes === 1);
    first.ws.close();
    await once(first.ws, 'close');
    const next = await open(true);
    const refused = next.send('clipboard.request', {
      generation: '1',
      revision: '1',
    });
    assert.equal(
      (await next.event('clipboard.data', refused)).status,
      'unavailable',
    );
    assert.equal(worker.reads, 0);
    assert.equal(worker.revokes, 0);
    written.resolve();
    await eventually(() => worker.revokes === 1);
    assert.equal(worker.source.localPending, true);
    revoked.resolve();
    await eventually(() =>
      next.messages.some(
        (m) =>
          m.type === 'clipboard.offer' &&
          !m.data.retiring &&
          !m.data.state.localPending,
      ),
    );
    const bytes = await download(next);
    bytes.fill(0);
    assert.equal(worker.reads, 1);
    assert.equal(worker.revokes, 1);
    await delay(1);
  });
});
