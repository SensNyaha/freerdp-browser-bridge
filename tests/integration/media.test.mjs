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
import { display } from '../fixtures/display.mjs';
const { WebSocket } = createRequire(
  new URL('../../apps/bridge-api/package.json', import.meta.url),
)('ws');
const origin = 'https://media.example.test';

/** Explicit transport fixture, not an RDP desktop or valid JPEG decoder test. */
class MediaWorker extends FakeSessionWorker {
  onAudio(listener) {
    this.on('audio', listener);
    return () => this.off('audio', listener);
  }
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
async function setup(
  run,
  quality,
  dynamicResolution = false,
  audioOutput = 'off',
) {
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
        media: { audioOutput },
        ...(dynamicResolution ? { display: { dynamicResolution: true } } : {}),
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
const hello = (ws, codecs = ['jpeg'], display = false) =>
  ws.send(
    JSON.stringify({
      v: 1,
      type: 'media.hello',
      data: { codecs, ...(display ? { display: true } : {}) },
    }),
  );
const acknowledge = (ws, sequence) =>
  ws.send(JSON.stringify({ v: 1, type: 'media.ack', data: { sequence } }));
const binary = (messages) => messages.filter(Buffer.isBuffer);
const reset = (ws, sequence) =>
  ws.send(JSON.stringify({ v: 1, type: 'media.reset', data: { sequence } }));

test('fake display/media: a new epoch keeps the transmitted ACK and forces config/IDR, including same-size reset', async () => {
  for (const codec of ['jpeg', 'h264'])
    for (const width of [640, 800]) {
      await setup(async ({ ws, messages, worker }) => {
        worker.avcEnabled = true;
        worker.emit('display', display({ dynamicResolution: false }));
        hello(ws, [codec], true);
        await eventually(() => binary(messages).length === 2);
        const captures = worker.requests;
        worker.width = width;
        worker.revision = 2n;
        worker.emit(
          'display',
          display({
            dynamicResolution: false,
            generation: 2n,
            framebufferRevision: 2n,
            width,
          }),
        );
        await eventually(() =>
          messages.some((m) => m.type === 'display.resize'),
        );
        await delay(100);
        assert.equal(worker.requests, captures);
        assert.equal(binary(messages).length, 2);
        acknowledge(ws, 1); // Previous epoch still owns its transmitted unit.
        await eventually(() => binary(messages).length === 4);
        const records = binary(messages);
        assert.equal(records[2][5], 1);
        assert.equal(records[2].readUInt16BE(6), 2);
        assert.equal(records[2].readUInt16BE(30), width);
        assert.equal(records[3].readUInt16BE(6), 3);
        assert.equal(records[3].readUInt32BE(12), 3);
        if (codec === 'h264') assert.equal(worker.forces.at(-1), true);
        acknowledge(ws, 3);
        await delay(100);
        assert.equal(ws.readyState, WebSocket.OPEN);
      });
    }
});
test('fake display/media: a captured but unsent old-epoch frame is discarded without consuming sequence or render credit', async () => {
  for (const codec of ['jpeg', 'h264']) {
    await setup(async ({ ws, messages, worker }) => {
      worker.avcEnabled = true;
      worker.emit('display', display({ dynamicResolution: false }));
      const capture = worker.captureFrame.bind(worker);
      let unblock,
        started = false;
      worker.captureFrame = async (...args) => {
        const frame = await capture(...args);
        if (!started) {
          started = true;
          await new Promise((resolve) => {
            unblock = resolve;
          });
        }
        return frame;
      };
      hello(ws, [codec], true);
      await eventually(() => Boolean(unblock));
      worker.width = 800;
      worker.revision = 2n;
      worker.emit(
        'display',
        display({
          dynamicResolution: false,
          generation: 2n,
          framebufferRevision: 2n,
          width: 800,
        }),
      );
      unblock();
      await eventually(() => binary(messages).length === 2);
      assert.equal(binary(messages)[0].readUInt32BE(12), 0);
      assert.equal(binary(messages)[0].readUInt16BE(30), 800);
      assert.equal(binary(messages)[1].readUInt32BE(12), 1);
      assert.equal(binary(messages)[1].readUInt16BE(6), 3);
      assert.ok(worker.requests >= 2);
      acknowledge(ws, 1);
      await delay(100);
      assert.equal(ws.readyState, WebSocket.OPEN);
    });
  }
});
test('fake legacy media: no display negotiation keeps binary-only video updates while preserving resize config and old ACK', async () => {
  await setup(async ({ ws, messages, worker }) => {
    worker.emit('display', display({ dynamicResolution: false }));
    hello(ws);
    await eventually(() => binary(messages).length === 2);
    assert.equal(messages[0].type, 'media.ready');
    assert.equal(messages[0].data.display, false);
    worker.width = 800;
    worker.revision = 2n;
    worker.emit(
      'display',
      display({
        dynamicResolution: false,
        generation: 2n,
        framebufferRevision: 2n,
        width: 800,
      }),
    );
    acknowledge(ws, 1);
    await eventually(() => binary(messages).length === 4);
    assert.equal(binary(messages)[2].readUInt16BE(30), 800);
    assert.deepEqual(
      messages.filter((m) => !Buffer.isBuffer(m)).map((m) => m.type),
      ['media.ready'],
    );
    acknowledge(ws, 3);
  });
});
test('fake display/control WS: state replay, correlated typed results, opt-in and nonfatal input pause', async () => {
  await setup(
    async ({ server, created, worker }) => {
      const messages = [];
      const control = new WebSocket(
        'ws://127.0.0.1:' +
          server.server.address().port +
          '/v1/sessions/' +
          created.sessionId +
          '/control?token=' +
          created.attach.control.token,
        ['freerdp-bridge-v1'],
        { origin },
      );
      control.on('error', () => {});
      control.on('message', (bytes) =>
        messages.push(JSON.parse(bytes.toString())),
      );
      let complete,
        layouts = 0;
      worker.sendInput = async () => {};
      worker.resizeDisplay = async () => {
        layouts++;
        await new Promise((resolve) => {
          complete = resolve;
        });
        worker.emit(
          'display',
          display({
            generation: 2n,
            framebufferRevision: 2n,
            width: 1280,
            height: 720,
          }),
        );
        return 'applied';
      };
      worker.emit('display', display());
      try {
        await once(control, 'open');
        await eventually(() => messages.some((m) => m.type === 'display.info'));
        assert.equal(
          messages.find((m) => m.type === 'display.info').data.generation,
          '1',
        );
        const command = (seq, type, data) =>
          control.send(
            JSON.stringify({ v: 1, seq, ts: Date.now(), type, data }),
          );
        command(0, 'display.resize.request', {
          width: 1280,
          height: 720,
          deviceScale: 1,
        });
        await eventually(() => Boolean(complete));
        command(1, 'display.resize.request', {
          width: 1280,
          height: 720,
          deviceScale: 1,
        });
        command(2, 'input.pointer', {
          action: 'move',
          x: 20,
          y: 20,
        });
        command(3, 'display.resize.request', {
          width: 1280,
          height: 720,
          deviceScale: 1.25,
        });
        await eventually(() =>
          messages.some(
            (m) =>
              m.type === 'display.resize.result' && m.data.requestSeq === 3,
          ),
        );
        assert.equal(
          messages.find((m) => m.data?.requestSeq === 1).data.status,
          'busy',
        );
        assert.equal(
          messages.find((m) => m.data?.requestSeq === 3).data.status,
          'invalid',
        );
        await eventually(() => messages.some((m) => m.type === 'input.paused'));
        complete();
        await eventually(() => messages.some((m) => m.data?.requestSeq === 0));
        assert.equal(
          messages.find((m) => m.data?.requestSeq === 0).data.status,
          'applied',
        );
        assert.equal(layouts, 1);
        assert.equal(control.readyState, WebSocket.OPEN);
        const actual = messages.find((m) => m.type === 'display.resize');
        assert.equal(actual.data.width, 1280);
        assert.equal(actual.data.deviceScale, 100);
        assert.equal(actual.data.framebufferRevision, '2');
      } finally {
        complete?.();
        control.terminate();
      }
    },
    undefined,
    true,
  );
});

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

const pcmState = (revision = 1n, availability = 'ready', epoch = 1n) => ({
  type: 'state',
  state: {
    enabled: true,
    revision,
    availability,
    epoch,
    timestampUs: 5000000n,
  },
});
const pcmConfig = (epoch = 1n) => ({
  type: 'config',
  config: {
    epoch,
    codec: 'pcm',
    sampleRate: 48000,
    channels: 2,
    sampleFormat: 's16le',
    packetFrames: 960,
  },
});
const pcmPacket = (index = 0, epoch = 1n) => ({
  type: 'packet',
  packet: {
    epoch,
    timestampUs: BigInt(index) * 20000n,
    frames: 960,
    silenceFrames: 0,
    discontinuity: index === 0,
    pcm: Buffer.alloc(3840, index & 0xff),
  },
});
const pcmHello = (ws, audio = { codec: 'pcm', sourceStatus: true }) =>
  ws.send(
    JSON.stringify({
      v: 1,
      type: 'media.hello',
      data: { codecs: ['jpeg'], audio },
    }),
  );
const pcmRecords = (messages) =>
  binary(messages).filter((b) => b.readUInt32BE(8) === 3);
const pcmAck = (ws, sequence) =>
  ws.send(JSON.stringify({ v: 1, type: 'audio.ack', data: { sequence } }));

test('fake PCM WS: negotiated ordered source/config/sample credit is independent of video; snapshot replays no old samples', async () => {
  await setup(
    async ({ ws, messages, worker }) => {
      worker.emit('audio', pcmState());
      worker.emit('audio', pcmConfig());
      for (let i = 0; i < 20; i++) worker.emit('audio', pcmPacket(i));
      pcmHello(ws);
      await eventually(
        () =>
          pcmRecords(messages).length === 1 &&
          binary(messages).some((b) => b[5] === 2),
      );
      assert.deepEqual(messages[0].data.audio, {
        codec: 'pcm',
        sourceStatus: true,
        streamId: 3,
        maxInFlight: 1,
        ackTimeoutMs: 2000,
      });
      assert.equal(pcmRecords(messages)[0][5], 9);
      assert.equal(pcmRecords(messages)[0].readUInt32BE(12), 0);
      worker.emit('audio', pcmPacket(20));
      await delay(40);
      assert.equal(pcmRecords(messages).length, 1);
      pcmAck(ws, 0);
      await eventually(() => pcmRecords(messages).length === 2);
      assert.equal(pcmRecords(messages)[1][5], 3);
      assert.equal(pcmRecords(messages)[1].readBigUInt64BE(16), 400000n);
      await delay(40);
      assert.equal(pcmRecords(messages).length, 2);
      pcmAck(ws, 1);
      await eventually(() => pcmRecords(messages).length === 3);
      const sample = pcmRecords(messages)[2];
      assert.equal(sample[5], 4);
      assert.equal(sample.readUInt16BE(6), 2);
      assert.equal(sample[28], 20);
      pcmAck(ws, 2);
      await delay(60);
      assert.equal(pcmRecords(messages).length, 3);
      assert.equal(worker.requests, 1); // Video ACK was never released by audio ACK.
      acknowledge(ws, 1);
      await eventually(() => worker.requests > 1);
      assert.equal(ws.readyState, WebSocket.OPEN);
    },
    undefined,
    false,
    'pcm',
  );
});

test('fake PCM metrics: exact admitted records/bytes, latest/reset discards and independent credit return to zero on detach', async () => {
  await setup(
    async ({ ws, messages, worker, server }) => {
      worker.emit('audio', pcmState());
      worker.emit('audio', pcmConfig());
      pcmHello(ws);
      await eventually(() => pcmRecords(messages).length === 1);
      worker.emit('audio', pcmPacket());
      worker.emit('audio', pcmPacket(1));
      let body = await mediaMetrics(server);
      const value = (name, extra = {}) =>
        sample(body, name, { codec: 'pcm', ...extra });
      assert.equal(value('bridge_audio_records_in_flight'), 1);
      assert.equal(value('bridge_audio_record_bytes_in_flight'), 68);
      assert.equal(value('bridge_audio_pending_sample_bytes'), 3840);
      assert.equal(
        value('bridge_audio_packets_discarded_total', {
          reason: 'replacement',
        }),
        1,
      );
      pcmAck(ws, 0);
      await eventually(() => pcmRecords(messages).length === 2);
      pcmAck(ws, 1);
      await eventually(() => pcmRecords(messages).length === 3);
      body = await mediaMetrics(server);
      assert.equal(value('bridge_audio_record_bytes_in_flight'), 3868);
      assert.equal(value('bridge_audio_pending_sample_bytes'), 0);
      assert.equal(
        value('bridge_audio_records_queued_total', { record: 'state' }),
        1,
      );
      assert.equal(
        value('bridge_audio_records_queued_total', { record: 'config' }),
        1,
      );
      assert.equal(
        value('bridge_audio_records_queued_total', { record: 'packet' }),
        1,
      );
      for (const [record, bytes] of [
        ['state', 68],
        ['config', 48],
        ['packet', 3868],
      ])
        assert.equal(
          value('bridge_audio_bytes_queued_total', { record }),
          bytes,
        );
      assert.equal(
        value('bridge_audio_stage_duration_seconds_count', {
          stage: 'receiver_credit',
        }),
        2,
      );
      worker.emit('audio', pcmPacket(2));
      worker.emit('audio', pcmState(2n, 'closed'));
      body = await mediaMetrics(server);
      assert.equal(
        value('bridge_audio_packets_discarded_total', {
          reason: 'source_reset',
        }),
        1,
      );
      assert.equal(value('bridge_audio_pending_sample_bytes'), 0);
      assert.equal(value('bridge_audio_records_in_flight'), 1);
      pcmAck(ws, 2);
      await eventually(() => pcmRecords(messages).length === 4);
      const closed = once(ws, 'close');
      ws.close();
      await closed;
      await releasedCredit(server, 'jpeg');
      body = await mediaMetrics(server);
      assert.equal(value('bridge_audio_records_in_flight'), 0);
      assert.equal(value('bridge_audio_record_bytes_in_flight'), 0);
      assert.equal(value('bridge_audio_pending_sample_bytes'), 0);
      assert.equal(
        value('bridge_audio_stage_duration_seconds_count', {
          stage: 'receiver_credit',
        }),
        3,
      );
      assert.ok(
        value('bridge_audio_stage_duration_seconds_count', {
          stage: 'forward',
        }) >= 3,
      );
      assert.ok(
        !/fake\.example|fixture-owner|sessionId|epoch=|revision=/.test(body),
      );
    },
    undefined,
    false,
    'pcm',
  );
});

test('fake PCM metrics: wrong ACK and receiver deadline retire credit/pending bytes without successful credit observation', async () => {
  for (const reason of ['ack', 'receiver_deadline'])
    await setup(
      async ({ ws, messages, worker, server }) => {
        worker.emit('audio', pcmState());
        worker.emit('audio', pcmConfig());
        pcmHello(ws);
        await eventually(() => pcmRecords(messages).length === 1);
        worker.emit('audio', pcmPacket());
        const closed = once(ws, 'close');
        if (reason === 'ack') pcmAck(ws, 123);
        await closed;
        await releasedCredit(server, 'jpeg');
        const body = await mediaMetrics(server),
          labels = { codec: 'pcm' };
        for (const name of [
          'bridge_audio_records_in_flight',
          'bridge_audio_record_bytes_in_flight',
          'bridge_audio_pending_sample_bytes',
        ])
          assert.equal(sample(body, name, labels), 0);
        assert.equal(
          sample(body, 'bridge_audio_consumers_failed_total', {
            ...labels,
            reason,
          }),
          1,
        );
        assert.equal(
          sample(body, 'bridge_audio_packets_discarded_total', {
            ...labels,
            reason: 'retirement',
          }),
          1,
        );
        assert.equal(
          sample(body, 'bridge_audio_stage_duration_seconds_count', {
            ...labels,
            stage: 'receiver_credit',
          }),
          0,
        );
        assert.equal(worker.closed, 0);
      },
      undefined,
      false,
      'pcm',
    );
});

test('fake PCM WS: latest samples coalesce under old credit; Close clears unsent data and recovery uses fresh epoch', async () => {
  await setup(
    async ({ ws, messages, worker }) => {
      worker.emit('audio', pcmState());
      worker.emit('audio', pcmConfig());
      pcmHello(ws);
      await eventually(() => pcmRecords(messages).length === 1);
      worker.emit('audio', pcmPacket());
      pcmAck(ws, 0);
      await eventually(() => pcmRecords(messages).length === 2);
      pcmAck(ws, 1);
      await eventually(() => pcmRecords(messages).length === 3);
      for (let i = 1; i <= 100; i++) worker.emit('audio', pcmPacket(i));
      pcmAck(ws, 2);
      await eventually(() => pcmRecords(messages).length === 4);
      const latest = pcmRecords(messages)[3];
      assert.equal(latest.readBigUInt64BE(16), 2000000n);
      assert.equal(latest.readUInt16BE(6), 2);
      assert.equal(latest[28], 100);
      worker.emit('audio', pcmPacket(101));
      worker.emit('audio', pcmState(2n, 'closed'));
      await delay(40);
      assert.equal(pcmRecords(messages).length, 4);
      pcmAck(ws, 3);
      await eventually(() => pcmRecords(messages).length === 5);
      assert.equal(pcmRecords(messages)[4][5], 9);
      assert.equal(pcmRecords(messages)[4][31], 4);
      pcmAck(ws, 4);
      await delay(40);
      assert.equal(pcmRecords(messages).length, 5);
      worker.emit('audio', pcmState(3n, 'ready', 2n));
      worker.emit('audio', pcmConfig(2n));
      const resumed = pcmPacket(102, 2n);
      resumed.packet.discontinuity = true;
      worker.emit('audio', resumed);
      await eventually(() => pcmRecords(messages).length === 6);
      pcmAck(ws, 5);
      await eventually(() => pcmRecords(messages).length === 7);
      assert.equal(pcmRecords(messages)[6].readBigUInt64BE(40), 2n);
      pcmAck(ws, 6);
      await eventually(() => pcmRecords(messages).length === 8);
      assert.equal(pcmRecords(messages)[7].readUInt16BE(6), 2);
      pcmAck(ws, 7);
      assert.equal(worker.closed, 0);
    },
    undefined,
    false,
    'pcm',
  );
});

test('fake PCM WS: optional negotiation refuses missing backend and incomplete/unknown profile; legacy viewers receive no audio', async () => {
  for (const offer of [
    { codec: 'pcm' },
    { codec: 'opus', sourceStatus: true },
    { codec: 'pcm', sourceStatus: false },
    { codec: 'pcm', sourceStatus: true, arbitrary: true },
  ])
    await setup(
      async ({ ws }) => {
        const closed = once(ws, 'close');
        pcmHello(ws, offer);
        assert.equal((await closed)[0], 1008);
      },
      undefined,
      false,
      'pcm',
    );
  await setup(async ({ ws, messages, worker }) => {
    const closed = once(ws, 'close');
    pcmHello(ws);
    assert.equal((await closed)[0], 1008);
    assert.equal(messages[0].data.code, 'MEDIA_NOT_IMPLEMENTED');
    assert.equal(worker.closed, 0);
  });
  await setup(
    async ({ ws, messages, worker }) => {
      hello(ws);
      worker.emit('audio', pcmState());
      worker.emit('audio', pcmConfig());
      worker.emit('audio', pcmPacket());
      await eventually(() => binary(messages).length === 2);
      assert.equal(messages[0].data.audio, undefined);
      assert.equal(pcmRecords(messages).length, 0);
      assert.equal(worker.listenerCount('audio'), 1); // Manager only, no media subscriber.
    },
    undefined,
    false,
    'pcm',
  );
});

test('fake PCM WS: wrong/duplicate ACK and missing receiver progress close only media, retiring its listener', async () => {
  for (const mode of ['wrong', 'duplicate', 'deadline', 'video-ack'])
    await setup(
      async ({ ws, messages, worker }) => {
        worker.emit('audio', pcmState(1n, 'waiting'));
        pcmHello(ws);
        await eventually(() => pcmRecords(messages).length === 1);
        const closed = once(ws, 'close');
        if (mode === 'wrong') pcmAck(ws, 1);
        if (mode === 'duplicate') {
          pcmAck(ws, 0);
          pcmAck(ws, 0);
        }
        if (mode === 'video-ack') acknowledge(ws, 0);
        assert.equal((await closed)[0], 1008);
        assert.equal(worker.closed, 0);
        assert.equal(worker.listenerCount('audio'), 1);
        assert.ok(
          !JSON.stringify(messages.filter((m) => !Buffer.isBuffer(m))).includes(
            'sensitive',
          ),
        );
      },
      undefined,
      false,
      'pcm',
    );
});

test('fake PCM WS: bounded negotiated command budget supports 50 PCM ACKs/sec without granting video credit', async () => {
  await setup(
    async ({ ws, messages, worker }) => {
      worker.emit('audio', pcmState());
      worker.emit('audio', pcmConfig());
      pcmHello(ws);
      await eventually(() => pcmRecords(messages).length === 1);
      worker.emit('audio', pcmPacket());
      pcmAck(ws, 0);
      await eventually(() => pcmRecords(messages).length === 2);
      pcmAck(ws, 1);
      await eventually(() => pcmRecords(messages).length === 3);
      pcmAck(ws, 2);
      for (let i = 1; i <= 50; i++) {
        worker.emit('audio', pcmPacket(i));
        await eventually(() => pcmRecords(messages).length === i + 3);
        pcmAck(ws, i + 2);
      }
      await delay(30);
      assert.equal(ws.readyState, WebSocket.OPEN);
      assert.equal(worker.requests, 1);
      const closed = once(ws, 'close');
      let next = 52;
      ws.on('message', (bytes, isBinary) => {
        if (!isBinary || bytes.readUInt32BE(8) !== 3 || bytes[5] !== 4) return;
        pcmAck(ws, bytes.readUInt32BE(12));
        if (next <= 250) worker.emit('audio', pcmPacket(next++));
      });
      worker.emit('audio', pcmPacket(51));
      assert.equal((await closed)[0], 1008);
      assert.ok(
        messages.some(
          (m) => m.type === 'media.error' && m.data.code === 'MEDIA_RATE_LIMIT',
        ),
      );
      assert.equal(worker.closed, 0);
    },
    undefined,
    false,
    'pcm',
  );
});
