import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { createSessionServer } from '../../apps/bridge-api/dist/session-server.js';
import {
  encodeMicrophoneRecord,
  encodeMicrophoneOpusRecord,
} from '../../packages/protocol/dist/index.js';
import { FakeSessionWorker, eventually } from '../fixtures/session-worker.mjs';
import { MicrophoneMediaClient } from '../../apps/reference-harness/microphone-media.js';
const { WebSocket } = createRequire(
  new URL('../../apps/bridge-api/package.json', import.meta.url),
)('ws');
const origin = 'https://microphone.example.test';
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const packet = (sequence = 1, epoch = 1n) =>
  encodeMicrophoneRecord(
    {
      epoch,
      timestampUs: BigInt(sequence - 1) * 20000n,
      discontinuity: true,
      pcm: Buffer.alloc(3840, 8),
    },
    sequence,
  );
const request = (ws, action, requestSeq) =>
  ws.send(
    JSON.stringify({
      v: 1,
      type: 'microphone.' + action,
      data: { requestSeq },
    }),
  );
class MicrophoneMediaWorker extends FakeSessionWorker {
  source = {
    enabled: true,
    availability: 'ready',
    revision: 1n,
    epoch: 1n,
    timestampUs: 0n,
  };
  samples = 0;
  resets = 0;
  captures = 0;
  revision = 1n;
  onMicrophone(fn) {
    this.on('microphone', fn);
    return () => this.off('microphone', fn);
  }
  async start(config, signal) {
    await super.start(config, signal);
    if (['pcm', 'opus'].includes(config.media?.microphone) && !signal.aborted)
      this.emit('microphone', this.source);
  }
  publish(patch = {}) {
    this.source = {
      ...this.source,
      revision: this.source.revision + 1n,
      timestampUs: this.source.timestampUs + 1n,
      ...patch,
    };
    this.emit('microphone', this.source);
  }
  async sendMicrophone(value) {
    ++this.samples;
    assert.equal(value.pcm.length, 3840);
    assert.equal(value.pcm[0], 8);
    return 'accepted';
  }
  async resetMicrophone(epoch) {
    ++this.resets;
    assert.equal(epoch, this.source.epoch);
    this.publish({ epoch: epoch + 1n });
    return 'scheduled';
  }
  opusSamples = 0;
  async sendMicrophoneOpus(value) {
    ++this.opusSamples;
    assert.equal('pcm' in value, false);
    assert.equal(value.encoded.length, 3);
    assert.equal(value.lookaheadFrames, 312);
    return 'accepted';
  }
  supportsCodec(codec) {
    return codec === 'jpeg';
  }
  async captureFrame(since) {
    ++this.captures;
    return {
      width: 640,
      height: 480,
      revision: this.revision,
      timestampUs: 0n,
      ...(since !== this.revision
        ? { jpeg: Buffer.from('ffd8ffd9', 'hex') }
        : {}),
    };
  }
}
// Actual loopback sockets with an explicit fake RDP backend and synthetic PCM/JPEG.
async function setup(run, microphone = 'pcm', controller = true) {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'bridge-microphone-media-'));
  const worker = new MicrophoneMediaWorker(),
    sockets = [];
  const server = await createSessionServer({
    worker: {
      workerPath: resolve(
        process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
        'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
      ),
      runtimeRoot,
    },
    authenticate: () => ({ id: 'microphone-transport-fixture' }),
    allowedOrigins: [origin],
    sessions: { workerFactory: () => worker },
  });
  try {
    await server.listen({ host: '127.0.0.1', port: 0 });
    const response = await server.inject({
      method: 'POST',
      url: '/v1/sessions',
      payload: {
        target: { host: 'fixture.invalid' },
        auth: {},
        media: { microphone },
      },
    });
    assert.equal(response.statusCode, 202);
    const created = response.json();
    async function connect(channel, token = created.attach[channel].token) {
      const ws = new WebSocket(
        'ws://127.0.0.1:' +
          server.server.address().port +
          '/v1/sessions/' +
          created.sessionId +
          '/' +
          channel +
          '?token=' +
          token,
        ['freerdp-bridge-v1'],
        { origin },
      );
      sockets.push(ws);
      ws.on('error', () => {});
      const messages = [];
      ws.on('message', (bytes, binary) =>
        messages.push(binary ? bytes : JSON.parse(bytes.toString())),
      );
      await once(ws, 'open');
      return { ws, messages };
    }
    async function replace(channel) {
      const result = await server.inject({
        method: 'POST',
        url: '/v1/sessions/' + created.sessionId + '/attach-token',
        payload: { channel },
      });
      assert.equal(result.statusCode, 200);
      return connect(channel, result.json().token);
    }
    const control = controller ? await connect('control') : undefined;
    const media = await connect('media');
    const hello = (selected = true, codec = 'pcm') =>
      media.ws.send(
        JSON.stringify({
          v: 1,
          type: 'media.hello',
          data: {
            codecs: ['jpeg'],
            ...(selected ? { microphone: { codec, sourceStatus: true } } : {}),
          },
        }),
      );
    await run({
      worker,
      server,
      created,
      media,
      control,
      connect,
      replace,
      hello,
    });
  } finally {
    for (const ws of sockets) ws.terminate();
    await server.close();
    assert.equal(worker.listenerCount('microphone'), 0);
    await rm(runtimeRoot, { recursive: true, force: true, maxRetries: 3 });
  }
}
const message = (messages, type, predicate = () => true) =>
  messages.find((value) => value.type === type && predicate(value.data));
const binary = (messages) => messages.filter(Buffer.isBuffer);
async function microphoneMetricText(server) {
  const response = await server.inject({ method: 'GET', url: '/metrics' });
  assert.equal(response.statusCode, 200);
  return response.body;
}
function microphoneMetric(text, suffix, labels) {
  const name = 'bridge_microphone_' + suffix;
  const row = text
    .split('\n')
    .find(
      (line) =>
        line.startsWith(name + '{') &&
        Object.entries(labels).every(([key, value]) =>
          line.includes(key + '="' + value + '"'),
        ),
    );
  assert.ok(row, 'Expected fixed microphone metric series: ' + name);
  return Number(row.slice(row.lastIndexOf(' ') + 1));
}
const opusPacket = (sequence = 1, epoch = 1n, discontinuity = true) =>
  encodeMicrophoneOpusRecord(
    {
      epoch,
      timestampUs: BigInt(sequence - 1) * 20000n,
      discontinuity,
      lookaheadFrames: 312,
      encoded: Buffer.from([0xfc, 0xff, 0xfe]),
    },
    sequence,
  );

for (const codec of ['pcm', 'opus']) {
  const selectedPacket = (sequence) =>
    codec === 'opus' ? opusPacket(sequence) : packet(sequence);
  test(`fake RDP / actual WS ${codec} microphone metrics: exact bytes/decisions and joined packet/stop ownership`, async () => {
    await setup(async (f) => {
      f.hello(true, codec);
      await eventually(() => message(f.media.messages, 'microphone.state'));
      let text = await microphoneMetricText(f.server);
      assert.equal(
        microphoneMetric(text, 'packets_received_total', { codec }),
        0,
      );
      f.media.ws.send(selectedPacket(1));
      await eventually(() =>
        message(
          f.media.messages,
          'microphone.ack',
          (value) => value.sequence === 1,
        ),
      );
      request(f.media.ws, 'start', 1);
      await eventually(() =>
        message(
          f.media.messages,
          'microphone.result',
          (value) => value.status === 'started',
        ),
      );
      const held = deferred(),
        method = codec === 'opus' ? 'sendMicrophoneOpus' : 'sendMicrophone';
      const submit = f.worker[method].bind(f.worker);
      f.worker[method] = async (value) => {
        await submit(value);
        return held.promise;
      };
      try {
        f.media.ws.send(selectedPacket(2));
        await eventually(() =>
          codec === 'opus'
            ? f.worker.opusSamples === 1
            : f.worker.samples === 1,
        );
        f.media.ws.send(selectedPacket(3));
        await eventually(() =>
          message(
            f.media.messages,
            'microphone.ack',
            (value) => value.sequence === 3 && value.status === 'busy',
          ),
        );
        request(f.media.ws, 'stop', 2);
        await eventually(() =>
          message(
            f.media.messages,
            'microphone.state',
            (value) => value.retiring,
          ),
        );
        text = await microphoneMetricText(f.server);
        const length = selectedPacket(2).length;
        assert.equal(
          microphoneMetric(text, 'packets_received_total', { codec }),
          3,
        );
        assert.equal(
          microphoneMetric(text, 'bytes_received_total', { codec }),
          3 * length,
        );
        assert.equal(
          microphoneMetric(text, 'packet_operations_in_flight', { codec }),
          1,
        );
        assert.equal(
          microphoneMetric(text, 'packet_bytes_in_flight', { codec }),
          length,
        );
        assert.equal(
          microphoneMetric(text, 'retirements_in_flight', { codec }),
          1,
        );
        assert.equal(f.worker.resets, 0);
        held.resolve('accepted');
        await eventually(() =>
          message(
            f.media.messages,
            'microphone.result',
            (value) => value.status === 'stopped',
          ),
        );
        text = await microphoneMetricText(f.server);
        assert.equal(
          microphoneMetric(text, 'packet_operations_in_flight', { codec }),
          0,
        );
        assert.equal(
          microphoneMetric(text, 'packet_bytes_in_flight', { codec }),
          0,
        );
        assert.equal(
          microphoneMetric(text, 'retirements_in_flight', { codec }),
          0,
        );
        assert.equal(
          microphoneMetric(text, 'decisions_total', {
            codec,
            operation: 'start',
            result: 'started',
          }),
          1,
        );
        assert.equal(
          microphoneMetric(text, 'decisions_total', {
            codec,
            operation: 'stop',
            result: 'stopped',
          }),
          1,
        );
        assert.equal(
          microphoneMetric(text, 'decisions_total', {
            codec,
            operation: 'packet',
            result: 'unavailable',
          }),
          2,
        );
        assert.equal(
          microphoneMetric(text, 'decisions_total', {
            codec,
            operation: 'packet',
            result: 'busy',
          }),
          1,
        );
        assert.equal(
          microphoneMetric(text, 'decisions_total', {
            codec,
            operation: 'packet',
            result: 'accepted',
          }),
          0,
        );
        assert.equal(
          microphoneMetric(text, 'stage_duration_seconds_count', {
            codec,
            operation: 'packet_admission',
          }),
          1,
        );
        assert.equal(
          microphoneMetric(text, 'stage_duration_seconds_count', {
            codec,
            operation: 'retirement',
          }),
          1,
        );
        assert.equal(
          microphoneMetric(text, 'packets_received_total', {
            codec: codec === 'pcm' ? 'opus' : 'pcm',
          }),
          0,
        );
        for (const secret of [
          f.created.sessionId,
          f.created.attach.control.token,
          f.created.attach.media.token,
          'fixture.invalid',
          'microphone-transport-fixture',
        ])
          assert.equal(text.includes(secret), false);
        for (const row of text
          .split('\n')
          .filter(
            (line) =>
              line.startsWith('bridge_microphone_') && line.includes('{'),
          ))
          for (const match of row
            .slice(row.indexOf('{') + 1, row.indexOf('}'))
            .matchAll(/([a-z_]+)="/g))
            assert.ok(
              ['codec', 'operation', 'result', 'reason', 'le'].includes(
                match[1],
              ),
            );
      } finally {
        held.resolve('accepted');
      }
    }, codec);
  });
  test(`fake RDP / actual WS ${codec} microphone metrics: detach preserves unfinished private operation until settlement`, async () => {
    await setup(async (f) => {
      f.hello(true, codec);
      await eventually(() => message(f.media.messages, 'microphone.state'));
      request(f.media.ws, 'start', 1);
      await eventually(() =>
        message(
          f.media.messages,
          'microphone.result',
          (value) => value.status === 'started',
        ),
      );
      const held = deferred(),
        method = codec === 'opus' ? 'sendMicrophoneOpus' : 'sendMicrophone';
      const submit = f.worker[method].bind(f.worker);
      f.worker[method] = async (value) => {
        await submit(value);
        return held.promise;
      };
      try {
        f.media.ws.send(selectedPacket(1));
        await eventually(() =>
          codec === 'opus'
            ? f.worker.opusSamples === 1
            : f.worker.samples === 1,
        );
        const closed = once(f.media.ws, 'close');
        f.media.ws.close();
        await closed;
        let text = await microphoneMetricText(f.server);
        const detachedDeadline = Date.now() + 3000;
        // Client close can precede the server close event and lease revocation.
        while (!/^bridge_attachments 1$/m.test(text)) {
          assert.ok(
            Date.now() < detachedDeadline,
            'Server media detach deadline',
          );
          await delay(5);
          text = await microphoneMetricText(f.server);
        }
        assert.equal(
          microphoneMetric(text, 'packet_operations_in_flight', { codec }),
          1,
        );
        assert.equal(
          microphoneMetric(text, 'packet_bytes_in_flight', { codec }),
          selectedPacket(1).length,
        );
        assert.equal(f.worker.resets, 0);
        held.resolve('accepted');
        await eventually(() => f.worker.resets === 1);
        text = await microphoneMetricText(f.server);
        assert.equal(
          microphoneMetric(text, 'packet_operations_in_flight', { codec }),
          0,
        );
        assert.equal(
          microphoneMetric(text, 'packet_bytes_in_flight', { codec }),
          0,
        );
        assert.equal(
          microphoneMetric(text, 'decisions_total', {
            codec,
            operation: 'packet',
            result: 'accepted',
          }),
          0,
        );
      } finally {
        held.resolve('accepted');
      }
    }, codec);
  });
  test(`fake RDP / actual WS ${codec} microphone metrics: malformed records fail once without new series or accepted packet counts`, async () => {
    await setup(async (f) => {
      f.hello(true, codec);
      await eventually(() => message(f.media.messages, 'microphone.state'));
      const bad = selectedPacket(1);
      bad.writeUInt16BE(8, 6);
      const closed = once(f.media.ws, 'close');
      f.media.ws.send(bad);
      await closed;
      const text = await microphoneMetricText(f.server);
      assert.equal(
        microphoneMetric(text, 'packets_received_total', { codec }),
        0,
      );
      assert.equal(
        microphoneMetric(text, 'consumers_failed_total', {
          codec,
          reason: 'protocol',
        }),
        1,
      );
      assert.equal(
        microphoneMetric(text, 'packet_operations_in_flight', { codec }),
        0,
      );
      assert.equal(f.worker.samples + f.worker.opusSamples, 0);
    }, codec);
  });
}

test('fake RDP / actual WS Opus microphone: exact profile, explicit grant, independent video credit and fresh reset epoch', async () => {
  await setup(async ({ media, hello, worker }) => {
    hello(true, 'opus');
    await eventually(
      () =>
        message(media.messages, 'media.ready') &&
        message(media.messages, 'microphone.state'),
    );
    assert.deepEqual(message(media.messages, 'media.ready').data.microphone, {
      codec: 'opus',
      sourceStatus: true,
      streamId: 4,
      sampleRate: 48000,
      channels: 2,
      frames: 960,
      maxPayloadBytes: 1315,
      maxInFlight: 1,
      packetTimeoutMs: 2000,
      stopTimeoutMs: 4000,
    });
    assert.equal(
      message(media.messages, 'microphone.state').data.granted,
      false,
    );
    media.ws.send(opusPacket());
    await eventually(() => message(media.messages, 'microphone.ack'));
    assert.equal(
      message(media.messages, 'microphone.ack').data.status,
      'unavailable',
    );
    assert.equal(worker.opusSamples, 0);
    request(media.ws, 'start', 1);
    await eventually(() =>
      message(media.messages, 'microphone.result', (v) => v.requestSeq === 1),
    );
    assert.equal(
      message(media.messages, 'microphone.result', (v) => v.requestSeq === 1)
        .data.status,
      'started',
    );
    const captures = worker.captures;
    media.ws.send(opusPacket(2));
    await eventually(() =>
      message(media.messages, 'microphone.ack', (v) => v.sequence === 2),
    );
    assert.equal(
      message(media.messages, 'microphone.ack', (v) => v.sequence === 2).data
        .status,
      'accepted',
    );
    assert.equal(worker.samples, 0);
    assert.equal(worker.opusSamples, 1);
    await delay(60);
    assert.equal(worker.captures, captures);
    request(media.ws, 'stop', 2);
    await eventually(() =>
      message(media.messages, 'microphone.result', (v) => v.requestSeq === 2),
    );
    assert.equal(
      message(media.messages, 'microphone.result', (v) => v.requestSeq === 2)
        .data.status,
      'stopped',
    );
    assert.equal(worker.source.epoch, 2n);
    request(media.ws, 'start', 3);
    await eventually(() =>
      message(media.messages, 'microphone.result', (v) => v.requestSeq === 3),
    );
    media.ws.send(opusPacket(3, 2n, false));
    await eventually(() =>
      message(media.messages, 'microphone.ack', (v) => v.sequence === 3),
    );
    assert.equal(
      message(media.messages, 'microphone.ack', (v) => v.sequence === 3).data
        .status,
      'invalid',
    );
    media.ws.send(opusPacket(4, 2n));
    await eventually(() =>
      message(media.messages, 'microphone.ack', (v) => v.sequence === 4),
    );
    assert.equal(
      message(media.messages, 'microphone.ack', (v) => v.sequence === 4).data
        .status,
      'accepted',
    );
    assert.equal(worker.opusSamples, 2);
    request(media.ws, 'stop', 4);
    await eventually(() =>
      message(media.messages, 'microphone.result', (v) => v.requestSeq === 4),
    );
    assert.equal(worker.source.epoch, 3n);
    assert.equal(media.ws.readyState, WebSocket.OPEN);
  }, 'opus');
});

test('fake RDP / actual WS microphone: explicit PCM/Opus mismatch refuses negotiation without fallback or capture', async () => {
  for (const codec of ['pcm', 'opus'])
    await setup(async ({ media, hello, worker, control }) => {
      hello(true, codec === 'pcm' ? 'opus' : 'pcm');
      await once(media.ws, 'close');
      assert.equal(
        message(media.messages, 'media.error').data.code,
        'MEDIA_NOT_IMPLEMENTED',
      );
      assert.equal(worker.samples + worker.opusSamples, 0);
      assert.equal(worker.resets, 0);
      assert.equal(control.ws.readyState, WebSocket.OPEN);
      assert.equal(message(media.messages, 'media.ready'), undefined);
    }, codec);
});

test('fake RDP / actual WS Opus microphone: mixed PCM and bounded malformed records retire only media before backend dispatch', async () => {
  for (const bytes of [
    packet(),
    opusPacket().subarray(0, 41),
    Buffer.alloc(1316),
  ])
    await setup(async ({ media, hello, worker, control }) => {
      hello(true, 'opus');
      await eventually(() => message(media.messages, 'media.ready'));
      request(media.ws, 'start', 1);
      await eventually(() => message(media.messages, 'microphone.result'));
      media.ws.send(bytes);
      await once(media.ws, 'close');
      assert.equal(
        message(media.messages, 'media.error').data.code,
        'MICROPHONE_PROTOCOL_ERROR',
      );
      assert.equal(worker.samples + worker.opusSamples, 0);
      assert.equal(control.ws.readyState, WebSocket.OPEN);
    }, 'opus');
});

test('fake RDP / actual WS Opus microphone: controller loss revokes pending encoded input and replacement waits for reset', async () => {
  await setup(async ({ media, control, replace, hello, worker }) => {
    const held = deferred();
    let borrowed;
    worker.sendMicrophoneOpus = (value) => {
      ++worker.opusSamples;
      borrowed = value.encoded;
      return held.promise;
    };
    hello(true, 'opus');
    await eventually(() => message(media.messages, 'media.ready'));
    request(media.ws, 'start', 1);
    await eventually(() => message(media.messages, 'microphone.result'));
    media.ws.send(opusPacket());
    await eventually(() => worker.opusSamples === 1);
    control.ws.close();
    await once(control.ws, 'close');
    await eventually(
      () =>
        media.messages.filter((v) => v.type === 'microphone.state').at(-1)?.data
          .retiring === true,
    );
    assert.equal(worker.resets, 0);
    assert.equal(borrowed[0], 0xfc);
    await replace('control');
    request(media.ws, 'start', 2);
    await eventually(() =>
      message(media.messages, 'microphone.result', (v) => v.requestSeq === 2),
    );
    assert.equal(
      message(media.messages, 'microphone.result', (v) => v.requestSeq === 2)
        .data.status,
      'busy',
    );
    held.resolve('accepted');
    await eventually(() => message(media.messages, 'microphone.ack'));
    assert.equal(
      message(media.messages, 'microphone.ack').data.status,
      'unavailable',
    );
    await eventually(() => worker.source.epoch === 2n);
    assert.equal(
      borrowed.every((v) => v === 0),
      true,
    );
    worker.sendMicrophoneOpus =
      MicrophoneMediaWorker.prototype.sendMicrophoneOpus;
    request(media.ws, 'start', 3);
    await eventually(() =>
      message(media.messages, 'microphone.result', (v) => v.requestSeq === 3),
    );
    assert.equal(
      message(media.messages, 'microphone.result', (v) => v.requestSeq === 3)
        .data.status,
      'started',
    );
    media.ws.send(opusPacket(2, 2n));
    await eventually(() =>
      message(media.messages, 'microphone.ack', (v) => v.sequence === 2),
    );
    assert.equal(
      message(media.messages, 'microphone.ack', (v) => v.sequence === 2).data
        .status,
      'accepted',
    );
    assert.equal(worker.samples, 0);
    request(media.ws, 'stop', 4);
    await eventually(() =>
      message(media.messages, 'microphone.result', (v) => v.requestSeq === 4),
    );
    assert.equal(worker.source.epoch, 3n);
  }, 'opus');
});

test('fake RDP / actual WS microphone browser client: correlated commands, latest synthetic PCM, preserved ACK and observed restart epoch', async () => {
  await setup(async ({ worker, media, hello }) => {
    hello();
    await eventually(
      () =>
        message(media.messages, 'media.ready') &&
        message(media.messages, 'microphone.state'),
    );
    let failed = 0;
    const admitted = [],
      held = deferred();
    worker.sendMicrophone = async (value) => {
      ++worker.samples;
      assert.equal(value.pcm.length, 3840);
      assert.equal(value.pcm[0], 8);
      assert.ok(admitted.length < 4);
      admitted.push({
        epoch: value.epoch,
        timestampUs: value.timestampUs,
        discontinuity: value.discontinuity,
      });
      return admitted.length === 1 ? held.promise : 'accepted';
    };
    const client = new MicrophoneMediaClient(
      {
        write(value) {
          if (
            media.ws.readyState !== WebSocket.OPEN ||
            media.ws.bufferedAmount +
              (typeof value === 'string'
                ? Buffer.byteLength(value)
                : value.byteLength) >
              65536
          )
            return false;
          media.ws.send(
            value instanceof ArrayBuffer ? Buffer.from(value) : value,
          );
          return true;
        },
        changed() {},
        failed() {
          ++failed;
          media.ws.terminate();
        },
      },
      message(media.messages, 'media.ready').data.microphone,
    );
    const receive = (bytes, isBinary) => {
      if (!isBinary) client.message(JSON.parse(bytes.toString()));
    };
    media.ws.on('message', receive);
    for (const value of media.messages)
      if (!Buffer.isBuffer(value)) client.message(value);
    const samples = (timestampUs, epoch = 1n) => ({
      timestampUs,
      epoch,
      pcm: new Uint8Array(3840).fill(8),
    });
    try {
      assert.equal(await client.start(1n), true);
      const token = client.authorize(1n);
      client.sender.offer(token, samples(0n), performance.now());
      await eventually(() => worker.samples === 1);
      client.sender.offer(token, samples(20000n), performance.now());
      client.sender.offer(token, samples(40000n), performance.now());
      assert.equal(client.stats.pendingBytes, 3840);
      held.resolve('accepted');
      await eventually(() => client.stats.accepted === 2);
      assert.deepEqual(admitted, [
        { epoch: 1n, timestampUs: 0n, discontinuity: true },
        { epoch: 1n, timestampUs: 40000n, discontinuity: true },
      ]);
      await client.stop();
      assert.equal(worker.resets, 1);
      assert.equal(client.source.source.epoch, 2n);
      assert.equal(client.authorized(token, 1n), false);
      assert.equal(await client.start(2n), true);
      const fresh = client.authorize(2n);
      assert.notEqual(fresh, token);
      client.sender.offer(fresh, samples(0n, 2n), performance.now());
      await eventually(() => client.stats.accepted === 3);
      assert.equal(admitted[2].epoch, 2n);
      await client.stop();
      assert.equal(worker.resets, 2);
      assert.equal(media.ws.readyState, WebSocket.OPEN);
      assert.equal(failed, 0);
    } finally {
      held.resolve('accepted');
      media.ws.off('message', receive);
      client.close();
    }
  });
});

test('fake RDP / actual WS microphone: explicit profile/grant, private admission, independent video credit and observed stop epoch', async () => {
  await setup(async ({ worker, media, hello }) => {
    hello();
    await eventually(() => message(media.messages, 'media.ready'));
    assert.equal(
      message(media.messages, 'media.ready').data.microphone.maxPayloadBytes,
      3876,
    );
    assert.equal(
      message(media.messages, 'microphone.state').data.granted,
      false,
    );
    await eventually(() => binary(media.messages).length === 2);
    const captures = worker.captures;
    request(media.ws, 'start', 1);
    await eventually(() =>
      message(
        media.messages,
        'microphone.result',
        (value) => value.requestSeq === 1,
      ),
    );
    media.ws.send(packet());
    await eventually(() => message(media.messages, 'microphone.ack'));
    assert.equal(
      message(media.messages, 'microphone.ack').data.status,
      'accepted',
    );
    await delay(80);
    assert.equal(worker.captures, captures);
    worker.revision = 2n;
    media.ws.send(
      JSON.stringify({ v: 1, type: 'media.ack', data: { sequence: 1 } }),
    );
    await eventually(() => binary(media.messages).length > 2);
    request(media.ws, 'stop', 2);
    await eventually(() =>
      message(
        media.messages,
        'microphone.result',
        (value) => value.requestSeq === 2,
      ),
    );
    assert.equal(
      message(
        media.messages,
        'microphone.result',
        (value) => value.requestSeq === 2,
      ).data.status,
      'stopped',
    );
    assert.equal(worker.source.epoch, 2n);
    assert.equal(worker.resets, 1);
    assert.equal(media.ws.readyState, WebSocket.OPEN);
  });
});

test('fake RDP / actual WS microphone: absent controller cannot grant; current controller enables explicit retry only', async () => {
  await setup(
    async ({ media, connect, hello, worker }) => {
      hello();
      await eventually(() => message(media.messages, 'media.ready'));
      request(media.ws, 'start', 1);
      await eventually(() => message(media.messages, 'microphone.result'));
      assert.equal(
        message(media.messages, 'microphone.result').data.status,
        'busy',
      );
      media.ws.send(packet());
      await eventually(() => message(media.messages, 'microphone.ack'));
      assert.equal(worker.samples, 0);
      await connect('control');
      request(media.ws, 'start', 2);
      await eventually(() =>
        message(
          media.messages,
          'microphone.result',
          (value) => value.requestSeq === 2,
        ),
      );
      media.ws.send(packet(2));
      await eventually(() =>
        message(
          media.messages,
          'microphone.ack',
          (value) => value.sequence === 2,
        ),
      );
      assert.equal(
        message(
          media.messages,
          'microphone.ack',
          (value) => value.sequence === 2,
        ).data.status,
        'accepted',
      );
      request(media.ws, 'stop', 3);
      await eventually(() => worker.resets === 1);
    },
    'pcm',
    false,
  );
});

test('fake RDP / actual WS microphone: controller loss immediately notifies, late ACK is unavailable and fresh ownership waits for reset', async () => {
  await setup(async ({ worker, media, control, replace, hello }) => {
    const pending = deferred(),
      reset = deferred();
    worker.sendMicrophone = () => {
      ++worker.samples;
      return pending.promise;
    };
    worker.resetMicrophone = () => {
      ++worker.resets;
      return reset.promise;
    };
    hello();
    await eventually(() => message(media.messages, 'media.ready'));
    request(media.ws, 'start', 1);
    await eventually(() => message(media.messages, 'microphone.result'));
    media.ws.send(packet());
    await eventually(() => worker.samples === 1);
    control.ws.close();
    await once(control.ws, 'close');
    await eventually(() =>
      message(
        media.messages,
        'microphone.state',
        (value) => !value.granted && value.retiring,
      ),
    );
    await replace('control');
    request(media.ws, 'start', 2);
    await eventually(() =>
      message(
        media.messages,
        'microphone.result',
        (value) => value.requestSeq === 2,
      ),
    );
    assert.equal(
      message(
        media.messages,
        'microphone.result',
        (value) => value.requestSeq === 2,
      ).data.status,
      'busy',
    );
    pending.resolve('accepted');
    await eventually(() => message(media.messages, 'microphone.ack'));
    assert.equal(
      message(media.messages, 'microphone.ack').data.status,
      'unavailable',
    );
    await eventually(() => worker.resets === 1);
    worker.publish({ epoch: 2n });
    reset.resolve('scheduled');
    await eventually(() =>
      message(
        media.messages,
        'microphone.state',
        (value) => !value.retiring && value.source.epoch === '2',
      ),
    );
    request(media.ws, 'start', 3);
    await eventually(() =>
      message(
        media.messages,
        'microphone.result',
        (value) => value.requestSeq === 3,
      ),
    );
    assert.equal(
      message(
        media.messages,
        'microphone.result',
        (value) => value.requestSeq === 3,
      ).data.status,
      'started',
    );
    worker.resetMicrophone = MicrophoneMediaWorker.prototype.resetMicrophone;
    request(media.ws, 'stop', 4);
    await eventually(() =>
      message(
        media.messages,
        'microphone.result',
        (value) => value.requestSeq === 4,
      ),
    );
  });
});

test('fake RDP / actual WS microphone: selection mismatch and legacy binary refusal leave control/session healthy', async () => {
  for (const selected of [true, false])
    await setup(async ({ media, control, hello, worker }) => {
      hello(selected);
      if (!selected) {
        await eventually(() => message(media.messages, 'media.ready'));
        assert.equal(
          message(media.messages, 'media.ready').data.microphone,
          undefined,
        );
        assert.equal(message(media.messages, 'microphone.state'), undefined);
        media.ws.send(packet());
      }
      await once(media.ws, 'close');
      assert.equal(worker.samples, 0);
      assert.equal(control.ws.readyState, WebSocket.OPEN);
      assert.equal(
        message(media.messages, 'media.error').data.code,
        selected ? 'MEDIA_NOT_IMPLEMENTED' : 'MEDIA_PROTOCOL_ERROR',
      );
    }, 'off');
});

test('fake RDP / actual WS microphone: existing 4 KiB preallocation refuses oversized input before private dispatch', async () => {
  await setup(async ({ media, hello, worker, control }) => {
    hello();
    await eventually(() => message(media.messages, 'media.ready'));
    media.ws.send(Buffer.alloc(4097));
    const [code] = await once(media.ws, 'close');
    assert.equal(code, 1009);
    assert.equal(worker.samples, 0);
    assert.equal(control.ws.readyState, WebSocket.OPEN);
  });
});

test('fake RDP / actual WS microphone: negotiated 160-message budget permits combined-rate headroom and bounds flooding', async () => {
  await setup(async ({ media, hello }) => {
    hello();
    await eventually(() => message(media.messages, 'media.ready'));
    request(media.ws, 'start', 1);
    await eventually(() => message(media.messages, 'microphone.result'));
    for (let sequence = 1; sequence <= 135; ++sequence)
      media.ws.send(packet(sequence));
    await eventually(() =>
      message(
        media.messages,
        'microphone.ack',
        (value) => value.sequence === 135,
      ),
    );
    assert.equal(media.ws.readyState, WebSocket.OPEN);
    const closed = once(media.ws, 'close');
    for (let sequence = 136; sequence <= 220; ++sequence)
      media.ws.send(packet(sequence));
    await closed;
    assert.equal(
      message(media.messages, 'media.error').data.code,
      'MEDIA_RATE_LIMIT',
    );
  });
});
