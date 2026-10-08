import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createSessionServer } from '../../apps/bridge-api/dist/session-server.js';
import { FakeSessionWorker, eventually } from '../fixtures/session-worker.mjs';
const { WebSocket } = createRequire(
  new URL('../../apps/bridge-api/package.json', import.meta.url),
)('ws');
const origin = 'https://media.example.test';

/** Explicit transport fixture, not an RDP desktop or valid JPEG decoder test. */
class MediaWorker extends FakeSessionWorker {
  revision = 1n;
  requests = 0;
  width = 640;
  supportsCodec(codec) {
    return codec === 'jpeg' || Boolean(this.avcEnabled);
  }
  async captureFrame(since, options) {
    this.requests++;
    await delay(10);
    if (this.failedMedia)
      throw new Error('sensitive diagnostic must not be forwarded');
    const frame = {
      revision: this.revision,
      timestampUs: 123n,
      width: this.width,
      height: 480,
      jpeg:
        since === this.revision ? undefined : Buffer.from('ffd8ffd9', 'hex'),
    };
    if (options?.codec === 'h264') {
      this.forces ??= [];
      this.forces.push(options.forceKeyframe);
      frame.jpeg = undefined;
      if (since !== this.revision || options.forceKeyframe) {
        const keyframe =
          !this.ignoreForce &&
          (options.forceKeyframe || this.lastWidth !== this.width);
        this.lastWidth = this.width;
        frame.avc = {
          config: Buffer.from('0142c01effe100046742c01e01000468ce3c80', 'hex'),
          bytes: Buffer.from(keyframe ? '000000026588' : '00000002419a', 'hex'),
          keyframe: Boolean(keyframe),
        };
      }
    }
    return frame;
  }
}
async function setup(run) {
  const root = await mkdtemp(join(tmpdir(), 'bridge-media-'));
  const worker = new MediaWorker();
  const server = await createSessionServer({
    worker: {
      workerPath: resolve(
        process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
        'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
      ),
      runtimeRoot: root,
    },
    authenticate: () => ({ id: 'fixture-owner' }),
    allowedOrigins: [origin],
    sessions: { workerFactory: () => worker },
  });
  let ws;
  try {
    await server.listen({ host: '127.0.0.1', port: 0 });
    const response = await server.inject({
      method: 'POST',
      url: '/v1/sessions',
      payload: {
        target: { host: 'fake.example.test' },
        auth: { username: 'fixture' },
      },
    });
    assert.equal(response.statusCode, 202);
    const created = response.json();
    ws = new WebSocket(
      'ws://127.0.0.1:' +
        server.server.address().port +
        '/v1/sessions/' +
        created.sessionId +
        '/media?token=' +
        created.attach.media.token,
      ['freerdp-bridge-v1'],
      { origin },
    );
    ws.on('error', () => {});
    const messages = [];
    ws.on('message', (bytes, binary) =>
      messages.push(binary ? bytes : JSON.parse(bytes.toString())),
    );
    await once(ws, 'open');
    await run({ ws, messages, worker, server, created });
  } finally {
    ws?.terminate();
    await server.close();
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
}
const hello = (ws, codecs = ['jpeg']) =>
  ws.send(JSON.stringify({ v: 1, type: 'media.hello', data: { codecs } }));
const acknowledge = (ws, sequence) =>
  ws.send(JSON.stringify({ v: 1, type: 'media.ack', data: { sequence } }));
const binary = (messages) => messages.filter(Buffer.isBuffer);
const reset = (ws, sequence) =>
  ws.send(JSON.stringify({ v: 1, type: 'media.reset', data: { sequence } }));

test(
  'fake AVC transport: negotiation, delta credit, reset on static revision and resize IDR/config',
  { timeout: 10000 },
  async () => {
    await setup(async ({ ws, messages, worker }) => {
      worker.avcEnabled = true;
      hello(ws, ['h264', 'jpeg']);
      await eventually(() => binary(messages).length === 2);
      assert.equal(messages[0].data.codec, 'h264');
      assert.equal(binary(messages)[0][29], 1);
      assert.equal(binary(messages)[1].readUInt16BE(6), 3);
      assert.deepEqual(worker.forces, [true]);
      const requests = worker.requests;
      worker.revision = 10n;
      await delay(150);
      assert.equal(worker.requests, requests);
      acknowledge(ws, 1);
      await eventually(() => binary(messages).length === 3);
      assert.equal(binary(messages)[2].readUInt16BE(6), 0);
      assert.equal(worker.forces.at(-1), false);
      reset(ws, 2);
      await eventually(() => binary(messages).length === 5);
      assert.equal(worker.forces.at(-1), true);
      assert.equal(binary(messages)[3][5], 1);
      assert.equal(binary(messages)[4].readUInt16BE(6), 3);
      acknowledge(ws, 4);
      await delay(150);
      assert.equal(binary(messages).length, 5);
      worker.width = 800;
      worker.revision++;
      await eventually(() => binary(messages).length === 7);
      assert.equal(binary(messages)[5].readUInt16BE(30), 800);
      assert.equal(binary(messages)[6].readUInt16BE(6), 3);
      assert.equal(worker.closed, 0);
    });
  },
);
test(
  'fake AVC transport: bounded resets, stale reset rejected and missing forced IDR isolated',
  { timeout: 10000 },
  async () => {
    await setup(async ({ ws, messages, worker }) => {
      worker.avcEnabled = true;
      hello(ws, ['h264']);
      await eventually(() => binary(messages).length === 2);
      for (let count = 1; count <= 3; count++) {
        reset(ws, binary(messages).at(-1).readUInt32BE(12));
        await eventually(() => binary(messages).length === (count + 1) * 2);
      }
      const closed = once(ws, 'close');
      reset(ws, binary(messages).at(-1).readUInt32BE(12));
      assert.equal((await closed)[0], 1008);
      assert.equal(worker.closed, 0);
    });
    await setup(async ({ ws, messages, worker }) => {
      worker.avcEnabled = true;
      hello(ws, ['h264']);
      await eventually(() => binary(messages).length === 2);
      const closed = once(ws, 'close');
      reset(ws, 0);
      assert.equal((await closed)[0], 1008);
      assert.equal(worker.closed, 0);
    });
    await setup(async ({ ws, worker }) => {
      worker.avcEnabled = true;
      worker.ignoreForce = true;
      const closed = once(ws, 'close');
      hello(ws, ['h264']);
      assert.equal((await closed)[0], 1008);
      assert.equal(worker.closed, 0);
    });
  },
);
test(
  'fake codec negotiation: JPEG fallback, unavailable AVC and duplicate offers',
  { timeout: 10000 },
  async () => {
    await setup(async ({ ws, messages }) => {
      hello(ws, ['h264', 'jpeg']);
      await eventually(() => binary(messages).length === 2);
      assert.equal(messages[0].data.codec, 'jpeg');
    });
    for (const codecs of [['h264'], ['h264', 'h264']])
      await setup(async ({ ws, worker }) => {
        const closed = once(ws, 'close');
        hello(ws, codecs);
        assert.equal((await closed)[0], 1008);
        assert.equal(worker.requests, 0);
      });
  },
);

test(
  'fake media transport: one render credit, static suppression, latest revision and resize config',
  { timeout: 10000 },
  async () => {
    await setup(async ({ ws, messages, worker }) => {
      hello(ws);
      await eventually(() => binary(messages).length === 2);
      assert.equal(messages[0].type, 'media.ready');
      assert.equal(binary(messages)[0].readUInt8(5), 1);
      assert.equal(binary(messages)[1].readUInt8(5), 2);
      const requests = worker.requests;
      worker.revision = 100n; // Coalesced while the previous image is awaiting rendering.
      await delay(200);
      assert.equal(worker.requests, requests);
      acknowledge(ws, 1);
      await eventually(() => binary(messages).length === 3);
      assert.equal(binary(messages)[2].readUInt32BE(12), 2);
      acknowledge(ws, 2);
      await delay(200);
      assert.equal(binary(messages).length, 3);
      worker.width = 800;
      worker.revision++;
      await eventually(() => binary(messages).length === 5);
      assert.equal(binary(messages)[3].readUInt8(5), 1);
      assert.equal(binary(messages)[3].readUInt16BE(30), 800);
      assert.equal(binary(messages)[4].readUInt16BE(6), 3);
    });
  },
);
test(
  'fake media transport: stale ACK and released media lease cannot pull another frame',
  { timeout: 10000 },
  async () => {
    await setup(async ({ ws, messages, worker }) => {
      hello(ws);
      await eventually(() => binary(messages).length === 2);
      const closed = once(ws, 'close');
      acknowledge(ws, 0);
      assert.equal((await closed)[0], 1008);
      const requests = worker.requests;
      await delay(150);
      assert.equal(worker.requests, requests);
      assert.equal(worker.closed, 0); // Bad viewer does not close the RDP session.
    });
  },
);
test(
  'fake media transport: provider failure stays isolated and diagnostics are sanitized',
  { timeout: 10000 },
  async () => {
    await setup(async ({ ws, messages, worker }) => {
      worker.failedMedia = true;
      const closed = once(ws, 'close');
      hello(ws);
      assert.equal((await closed)[0], 1008);
      assert.ok(messages.some((m) => m.type === 'media.error'));
      assert.ok(!JSON.stringify(messages).includes('sensitive diagnostic'));
      assert.equal(worker.closed, 0);
    });
  },
);
test(
  'fake media transport: missing render ACK closes attachment after bounded deadline',
  { timeout: 10000 },
  async () => {
    await setup(async ({ ws, worker }) => {
      const closed = once(ws, 'close');
      hello(ws);
      assert.equal((await closed)[0], 1008);
      assert.equal(worker.requests, 1);
      assert.equal(worker.closed, 0);
    });
  },
);
