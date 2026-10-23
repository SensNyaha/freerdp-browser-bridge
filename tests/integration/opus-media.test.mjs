import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Writable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { createSessionServer } from '../../apps/bridge-api/dist/session-server.js';
import { FakeSessionWorker, eventually } from '../fixtures/session-worker.mjs';
const { WebSocket } = createRequire(
  new URL('../../apps/bridge-api/package.json', import.meta.url),
)('ws');
const origin = 'https://opus-fixture.test';
const state = (revision, availability, epoch) => ({
  type: 'state',
  state: {
    enabled: true,
    revision,
    availability,
    epoch,
    timestampUs: revision,
  },
});
const config = (epoch) => ({
  type: 'config',
  config: {
    codec: 'opus',
    epoch,
    sampleRate: 48000,
    channels: 2,
    packetFrames: 960,
    lookaheadFrames: 312,
  },
});
// Framing fixture; browser entropy/Worklet evidence is in pcm-viewer.test.mjs.
const packet = (epoch, timestampUs, discontinuity = true) => ({
  type: 'packet',
  packet: {
    epoch,
    timestampUs,
    frames: 960,
    silenceFrames: 0,
    discontinuity,
    encoded: Buffer.from([0xfc, 0xff, 0xfe]),
  },
});
class OpusMediaWorker extends FakeSessionWorker {
  epoch = 1n;
  audioRevision = 0n;
  timestamp = 0n;
  captures = 0;
  resets = [];
  onAudio(listener) {
    this.on('audio', listener);
    return () => this.off('audio', listener);
  }
  supportsCodec(codec) {
    return codec === 'jpeg';
  }
  status(availability) {
    this.emit('audio', state(++this.audioRevision, availability, this.epoch));
  }
  prepare() {
    this.status('ready');
    this.emit('audio', config(this.epoch));
    this.sample();
  }
  sample(discontinuity = true) {
    this.emit('audio', packet(this.epoch, this.timestamp, discontinuity));
    this.timestamp += 20000n;
  }
  async resetAudio(epoch) {
    this.resets.push(epoch);
    assert.equal(epoch, this.epoch);
    this.epoch++;
    this.status('waiting');
    this.prepare();
    return 'scheduled';
  }
  async captureFrame(since) {
    this.captures++;
    return {
      revision: 1n,
      timestampUs: 123n,
      width: 640,
      height: 480,
      jpeg: since === 1n ? undefined : Buffer.from('ffd8ffd9', 'hex'),
    };
  }
}
async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'bridge-opus-media-'));
  const worker = new OpusMediaWorker();
  const server = await createSessionServer({
    worker: {
      workerPath: resolve(
        process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
        'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
      ),
      runtimeRoot: root,
    },
    authenticate: () => ({ id: 'opus-media-owner' }),
    allowedOrigins: [origin],
    sessions: { workerFactory: () => worker },
    logDestination: new Writable({
      write(_chunk, _encoding, done) {
        done();
      },
    }),
  });
  const sockets = [];
  try {
    await server.listen({ host: '127.0.0.1', port: 0 });
    const result = await server.inject({
      method: 'POST',
      url: '/v1/sessions',
      payload: {
        target: { host: 'fake.test' },
        auth: {},
        media: { audioOutput: 'opus' },
      },
    });
    assert.equal(result.statusCode, 202);
    const created = result.json();
    await eventually(() => worker.started === 1);
    const open = async (token) => {
      const ws = new WebSocket(
        `ws://127.0.0.1:${server.server.address().port}/v1/sessions/${created.sessionId}/media?token=${token}`,
        ['freerdp-bridge-v1'],
        { origin },
      );
      sockets.push(ws);
      ws.on('error', () => {});
      const messages = [];
      ws.on('message', (bytes, binary) => {
        assert.ok(messages.length < 40);
        messages.push(binary ? bytes : JSON.parse(bytes.toString()));
      });
      await once(ws, 'open');
      return {
        ws,
        messages,
        audio: () =>
          messages.filter((m) => Buffer.isBuffer(m) && m.readUInt32BE(8) === 3),
      };
    };
    await run({ worker, server, created, open });
  } finally {
    for (const ws of sockets) ws.terminate();
    await server.close();
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
}
const hello = (ws, codec = 'opus') =>
  ws.send(
    JSON.stringify({
      v: 1,
      type: 'media.hello',
      data: { codecs: ['jpeg'], audio: { codec, sourceStatus: true } },
    }),
  );
const ack = (ws, sequence) =>
  ws.send(JSON.stringify({ v: 1, type: 'audio.ack', data: { sequence } }));
const metric = (body, name, labels) => {
  const line = body
    .split('\n')
    .find(
      (line) =>
        line.startsWith(name + '{') &&
        Object.entries(labels).every(([key, value]) =>
          line.includes(`${key}="${value}"`),
        ),
    );
  assert.ok(line, name);
  return Number(line.slice(line.lastIndexOf(' ') + 1));
};

test('fake Opus WebSocket: ready attachment and replacement reset prediction, preserve ACK and use separate fixed metrics', async () => {
  await fixture(async ({ worker, server, created, open }) => {
    worker.prepare();
    worker.sample(false); // Detached predictive samples are validated, never replayed.
    const first = await open(created.attach.media.token);
    hello(first.ws);
    await eventually(
      () => first.audio().length === 1 && worker.resets.length === 1,
    );
    assert.deepEqual(
      first.messages.find((m) => m.type === 'media.ready').data.audio,
      {
        codec: 'opus',
        sourceStatus: true,
        streamId: 3,
        maxInFlight: 1,
        ackTimeoutMs: 2000,
      },
    );
    await delay(40);
    assert.equal(first.audio().length, 1); // New source cannot consume old receiver credit.
    for (let seq = 0; seq < 3; seq++) {
      ack(first.ws, seq);
      await eventually(() => first.audio().length === seq + 2);
    }
    assert.deepEqual(
      first.audio().map((r) => r[5]),
      [9, 9, 3, 4],
    );
    assert.equal(first.audio()[3].readBigUInt64BE(16), 40000n);
    assert.deepEqual(
      first.audio()[3].subarray(28),
      Buffer.from([0xfc, 0xff, 0xfe]),
    );
    ack(first.ws, 3);
    await delay(30);
    assert.equal(worker.captures, 1); // Audio ACK grants no video credit.
    const metrics = (await server.inject({ method: 'GET', url: '/metrics' }))
      .body;
    assert.equal(
      metric(metrics, 'bridge_audio_records_queued_total', {
        codec: 'opus',
        record: 'packet',
      }),
      1,
    );
    assert.equal(
      metric(metrics, 'bridge_audio_bytes_queued_total', {
        codec: 'opus',
        record: 'packet',
      }),
      31,
    );
    assert.equal(
      metric(metrics, 'bridge_audio_records_queued_total', {
        codec: 'pcm',
        record: 'packet',
      }),
      0,
    );
    assert.equal(
      metric(metrics, 'bridge_audio_records_in_flight', { codec: 'opus' }),
      0,
    );
    const closed = once(first.ws, 'close');
    first.ws.close();
    await closed;
    const token = await server.inject({
      method: 'POST',
      url: `/v1/sessions/${created.sessionId}/attach-token`,
      payload: { channel: 'media' },
    });
    assert.equal(token.statusCode, 200);
    const second = await open(token.json().token);
    hello(second.ws);
    await eventually(
      () => worker.resets.length === 2 && second.audio().length === 1,
    );
    for (let seq = 0; seq < 3; seq++) {
      ack(second.ws, seq);
      await eventually(() => second.audio().length === seq + 2);
    }
    assert.deepEqual(worker.resets, [1n, 2n]);
    assert.equal(second.audio()[3].readBigUInt64BE(16), 60000n);
    assert.equal(second.audio()[3].readUInt16BE(6), 2);
    const secondClosed = once(second.ws, 'close');
    second.ws.close();
    await secondClosed;
    await delay(30);
    const retired = (await server.inject({ method: 'GET', url: '/metrics' }))
      .body;
    for (const name of [
      'bridge_audio_records_in_flight',
      'bridge_audio_pending_sample_bytes',
      'bridge_audio_record_bytes_in_flight',
    ])
      assert.equal(metric(retired, name, { codec: 'opus' }), 0);
    assert.equal(worker.closed, 0);
    assert.equal(
      (
        await server.inject({
          method: 'GET',
          url: `/v1/sessions/${created.sessionId}`,
        })
      ).json().state,
      'connected',
    );
  });
});

test('fake Opus WebSocket: profile mismatch and wrong ACK retire media while source/session remain connected', async () => {
  for (const mode of ['mismatch', 'ack'])
    await fixture(async ({ worker, created, open }) => {
      worker.status('waiting');
      const current = await open(created.attach.media.token);
      const closed = once(current.ws, 'close');
      hello(current.ws, mode === 'mismatch' ? 'pcm' : 'opus');
      if (mode === 'ack') {
        await eventually(() => current.audio().length === 1);
        ack(current.ws, 7);
      }
      assert.equal((await closed)[0], 1008);
      assert.equal(
        current.messages.find((m) => m.type === 'media.error').data.code,
        mode === 'mismatch' ? 'MEDIA_NOT_IMPLEMENTED' : 'MEDIA_PROTOCOL_ERROR',
      );
      assert.equal(worker.closed, 0);
      assert.deepEqual(worker.resets, []);
    });
});
