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
import { cursorState } from '../fixtures/cursor.mjs';
const { WebSocket } = createRequire(
  new URL('../../apps/bridge-api/package.json', import.meta.url),
)('ws');
const origin = 'https://media.example.test';

/** Explicit transport fixture, not an RDP desktop or valid JPEG decoder test. */
class MediaWorker extends FakeSessionWorker {
  revision = 1n;
  requests = 0;
  captureDelay = 10;
  width = 640;
  supportsCodec(codec) {
    return codec === 'jpeg' || Boolean(this.avcEnabled);
  }
  async captureFrame(since, options) {
    this.requests++;
    (this.captureStarts ??= []).push(performance.now());
    await delay(this.captureDelay);
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
async function setup(run, quality) {
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
        ...(quality ? { quality } : {}),
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
  'fake media transport: configured FPS is reported and limits pulls after immediate render ACK',
  { timeout: 10000 },
  async () => {
    for (const codec of ['jpeg', 'h264']) {
      await setup(
        async ({ ws, messages, worker }) => {
          worker.avcEnabled = true;
          hello(ws, [codec]);
          await eventually(() => binary(messages).length === 2);
          assert.equal(messages[0].data.maxFps, 2);
          worker.revision++;
          acknowledge(ws, 1);
          await delay(150);
          assert.equal(worker.requests, 1);
          await eventually(() => binary(messages).length === 3);
          assert.ok(worker.captureStarts[1] - worker.captureStarts[0] >= 475);
        },
        { profile: 'custom', maxFps: 2 },
      );
    }
  },
);

test(
  'fake cursor transport: shape stream is independent of video credit and cursor-only changes never capture video',
  { timeout: 10000 },
  async () => {
    await setup(async ({ ws, messages, worker }) => {
      ws.send(
        JSON.stringify({
          v: 1,
          type: 'media.hello',
          data: { codecs: ['jpeg'], cursor: true },
        }),
      );
      await eventually(() => binary(messages).length === 2);
      assert.equal(messages[0].data.cursor, true);
      worker.emit('cursor', cursorState());
      await eventually(() => binary(messages).length === 3);
      assert.equal(binary(messages)[2][5], 5);
      assert.equal(binary(messages)[2].readUInt32BE(8), 2);
      assert.equal(binary(messages)[2].readUInt32BE(12), 0);
      worker.emit('cursor', cursorState({ revision: 2n, x: 400 }));
      worker.emit(
        'cursor',
        cursorState({ revision: 3n, visible: false, x: 400 }),
      );
      await delay(100);
      assert.equal(binary(messages).length, 3);
      assert.equal(worker.requests, 1);
      worker.emit('cursor', cursorState({ revision: 4n, shapeId: 8n }));
      await eventually(() => binary(messages).length === 4);
      assert.equal(binary(messages)[3].readUInt32BE(12), 1);
      worker.revision = 100n;
      acknowledge(ws, 1); // Cursor messages never consume/replace the video ACK sequence.
      await eventually(() => binary(messages).length === 5);
      assert.equal(binary(messages)[4][5], 2);
      assert.equal(binary(messages)[4].readUInt32BE(12), 2);
    });
  },
);

test(
  'fake cursor transport: current shape and visibility replay on media/control attach with fresh sequences',
  { timeout: 10000 },
  async () => {
    await setup(async ({ ws, messages, worker, server, created }) => {
      worker.emit('cursor', cursorState({ visible: false }));
      ws.send(
        JSON.stringify({
          v: 1,
          type: 'media.hello',
          data: { codecs: ['jpeg'], cursor: true },
        }),
      );
      await eventually(() => binary(messages).length === 3);
      assert.equal(binary(messages)[0][5], 5);
      assert.equal(binary(messages)[0].readBigUInt64BE(32), 7n);
      const base = 'ws://127.0.0.1:' + server.server.address().port;
      const control = new WebSocket(
        base +
          '/v1/sessions/' +
          created.sessionId +
          '/control?token=' +
          created.attach.control.token,
        ['freerdp-bridge-v1'],
        { origin },
      );
      const events = [];
      control.on('error', () => {});
      control.on('message', (bytes) =>
        events.push(JSON.parse(bytes.toString())),
      );
      try {
        await once(control, 'open');
        await eventually(() =>
          events.some((e) => e.type === 'cursor.position'),
        );
        assert.deepEqual(
          events.find((e) => e.type === 'cursor.visibility').data,
          { visible: false, default: false, shapeId: '7' },
        );
        assert.deepEqual(
          events.find((e) => e.type === 'cursor.position').data,
          { x: 100, y: 200 },
        );
        const closed = once(ws, 'close');
        ws.close();
        await closed;
        await releasedCredit(server, 'jpeg');
        const response = await server.inject({
          method: 'POST',
          url: '/v1/sessions/' + created.sessionId + '/attach-token',
          payload: { channel: 'media' },
        });
        const next = new WebSocket(
          base +
            '/v1/sessions/' +
            created.sessionId +
            '/media?token=' +
            response.json().token,
          ['freerdp-bridge-v1'],
          { origin },
        );
        const records = [];
        next.on('error', () => {});
        next.on('message', (bytes, binary) => {
          if (binary) records.push(bytes);
        });
        try {
          await once(next, 'open');
          next.send(
            JSON.stringify({
              v: 1,
              type: 'media.hello',
              data: { codecs: ['jpeg'], cursor: true },
            }),
          );
          await eventually(() => records.length === 3);
          assert.equal(records[0][5], 5);
          assert.equal(records[0].readUInt32BE(12), 0);
        } finally {
          next.terminate();
        }
      } finally {
        control.terminate();
      }
    });
  },
);

test(
  'fake cursor transport: legacy media ignores shapes and invalid backend cursor is contained',
  { timeout: 10000 },
  async () => {
    for (const invalid of [
      { revision: 2n, width: 385 },
      { revision: 2n, hotX: 0 }, // A cached shape identity has immutable geometry.
      { revision: 1n }, // Replayed state revision.
    ])
      await setup(async ({ ws, messages, worker }) => {
        hello(ws);
        await eventually(() => binary(messages).length === 2);
        worker.emit('cursor', cursorState());
        await delay(100);
        assert.equal(binary(messages).length, 2);
        const closed = once(ws, 'close');
        worker.emit('cursor', cursorState(invalid));
        await closed;
        assert.equal(worker.closed, 1);
      });
  },
);

async function mediaMetrics(server) {
  const response = await server.inject({ method: 'GET', url: '/metrics' });
  assert.equal(response.statusCode, 200);
  return response.body;
}
function sample(body, name, labels) {
  const line = body
    .split('\n')
    .find(
      (entry) =>
        entry.startsWith(name + '{') &&
        Object.entries(labels).every(([key, value]) =>
          entry.includes(`${key}="${value}"`),
        ),
    );
  return line ? Number(line.slice(line.lastIndexOf(' ') + 1)) : 0;
}
async function releasedCredit(server, codec) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const body = await mediaMetrics(server);
    if (sample(body, 'bridge_media_frames_in_flight', { codec }) === 0)
      return body;
    await delay(5);
  }
  assert.fail('Server did not release media credit after socket close');
}

test(
  'fake media metrics: stalled render credit bounds capture and tracks valid ACK separately from writes',
  { timeout: 10000 },
  async () => {
    for (const codec of ['jpeg', 'h264'])
      await setup(async ({ ws, messages, worker, server, created }) => {
        worker.avcEnabled = true;
        hello(ws, [codec]);
        await eventually(() => binary(messages).length === 2);
        await delay(100);
        assert.equal(worker.requests, 1);
        let body = await mediaMetrics(server);
        assert.equal(
          sample(body, 'bridge_media_frames_in_flight', { codec }),
          1,
        );
        assert.equal(
          sample(body, 'bridge_media_frames_queued_total', { codec }),
          1,
        );
        assert.equal(
          sample(body, 'bridge_media_bytes_queued_total', { codec }),
          binary(messages).reduce((sum, bytes) => sum + bytes.length, 0),
        );
        assert.equal(
          sample(body, 'bridge_media_stage_duration_seconds_count', {
            codec,
            stage: 'capture_changed',
          }),
          1,
        );
        assert.equal(
          sample(body, 'bridge_media_stage_duration_seconds_count', {
            codec,
            stage: 'forward',
          }),
          1,
        );
        assert.equal(
          sample(body, 'bridge_media_stage_duration_seconds_count', {
            codec,
            stage: 'render_credit',
          }),
          0,
        );
        assert.ok(
          sample(body, 'bridge_media_stage_duration_seconds_sum', {
            codec,
            stage: 'capture_changed',
          }) >= 0.008,
        );
        for (const secret of [
          created.sessionId,
          created.attach.media.token,
          'fixture-owner',
          'fake.example.test',
        ])
          assert.ok(!body.includes(secret));

        worker.revision = 100n;
        acknowledge(ws, 1);
        await eventually(() => binary(messages).length === 3);
        body = await mediaMetrics(server);
        assert.equal(
          sample(body, 'bridge_media_frames_in_flight', { codec }),
          1,
        );
        assert.equal(
          sample(body, 'bridge_media_frames_queued_total', { codec }),
          2,
        );
        assert.equal(
          sample(body, 'bridge_media_stage_duration_seconds_count', {
            codec,
            stage: 'render_credit',
          }),
          1,
        );
        assert.ok(
          sample(body, 'bridge_media_stage_duration_seconds_sum', {
            codec,
            stage: 'render_credit',
          }) >= 0.09,
        );
        const closed = once(ws, 'close');
        ws.close();
        await closed;
        body = await releasedCredit(server, codec);
        assert.equal(
          sample(body, 'bridge_media_frames_in_flight', { codec }),
          0,
        );
        assert.equal(
          sample(body, 'bridge_media_stage_duration_seconds_count', {
            codec,
            stage: 'render_credit',
          }),
          1,
        );
        assert.equal(worker.closed, 0);
      });
  },
);

test(
  'fake media metrics: decoder reset and invalid ACK release credit without counting successful rendering',
  { timeout: 10000 },
  async () => {
    await setup(async ({ ws, messages, worker, server }) => {
      worker.avcEnabled = true;
      hello(ws, ['h264']);
      await eventually(() => binary(messages).length === 2);
      reset(ws, 1);
      await eventually(() => binary(messages).length === 4);
      let body = await mediaMetrics(server);
      assert.equal(
        sample(body, 'bridge_media_frames_in_flight', { codec: 'h264' }),
        1,
      );
      assert.equal(
        sample(body, 'bridge_media_stage_duration_seconds_count', {
          codec: 'h264',
          stage: 'render_credit',
        }),
        0,
      );
      const closed = once(ws, 'close');
      acknowledge(ws, 1); // Stale acknowledgement of the frame whose credit reset consumed.
      assert.equal((await closed)[0], 1008);
      body = await releasedCredit(server, 'h264');
      assert.equal(
        sample(body, 'bridge_media_frames_in_flight', { codec: 'h264' }),
        0,
      );
      assert.equal(
        sample(body, 'bridge_media_stage_duration_seconds_count', {
          codec: 'h264',
          stage: 'render_credit',
        }),
        0,
      );
      assert.equal(worker.closed, 0);
    });
  },
);

test(
  'fake media metrics: detaching during capture cannot enqueue a late frame or leak credit',
  { timeout: 10000 },
  async () => {
    await setup(async ({ ws, worker, server }) => {
      worker.captureDelay = 150;
      hello(ws);
      await eventually(() => worker.requests === 1);
      const closed = once(ws, 'close');
      ws.close();
      await closed;
      await delay(200);
      const body = await mediaMetrics(server);
      assert.equal(
        sample(body, 'bridge_media_frames_in_flight', { codec: 'jpeg' }),
        0,
      );
      assert.equal(
        sample(body, 'bridge_media_frames_queued_total', { codec: 'jpeg' }),
        0,
      );
      assert.equal(
        sample(body, 'bridge_media_bytes_queued_total', { codec: 'jpeg' }),
        0,
      );
    });
  },
);

test(
  'fake media metrics: unchanged polls do not mix with changed-frame capture timings',
  { timeout: 10000 },
  async () => {
    await setup(async ({ ws, messages, worker, server }) => {
      hello(ws);
      await eventually(() => binary(messages).length === 2);
      acknowledge(ws, 1);
      await eventually(() => worker.requests >= 3);
      const body = await mediaMetrics(server);
      assert.equal(
        sample(body, 'bridge_media_stage_duration_seconds_count', {
          codec: 'jpeg',
          stage: 'capture_changed',
        }),
        1,
      );
      assert.ok(
        sample(body, 'bridge_media_stage_duration_seconds_count', {
          codec: 'jpeg',
          stage: 'capture_unchanged',
        }) >= 1,
      );
      assert.equal(
        sample(body, 'bridge_media_frames_in_flight', { codec: 'jpeg' }),
        0,
      );
      assert.equal(
        sample(body, 'bridge_media_frames_queued_total', { codec: 'jpeg' }),
        1,
      );
      assert.equal(binary(messages).length, 2);
    });
  },
);

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
