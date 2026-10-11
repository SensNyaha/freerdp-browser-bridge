import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { createSessionServer } from '../../apps/bridge-api/dist/session-server.js';
import { encodeMicrophoneRecord } from '../../packages/protocol/dist/index.js';
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
    if (config.media?.microphone === 'pcm' && !signal.aborted)
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
    const hello = (selected = true) =>
      media.ws.send(
        JSON.stringify({
          v: 1,
          type: 'media.hello',
          data: {
            codecs: ['jpeg'],
            ...(selected
              ? { microphone: { codec: 'pcm', sourceStatus: true } }
              : {}),
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
