import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { installMedia } from '../../apps/bridge-api/dist/media.js';
import { eventually } from '../fixtures/session-worker.mjs';

const { WebSocket } = createRequire(
  new URL('../../apps/bridge-api/package.json', import.meta.url),
)('ws');

/** Synthetic write completions; actual HTTP/WS coverage lives in media.test.mjs. */
async function fixture(codec, run) {
  class Socket extends EventEmitter {
    readyState = WebSocket.OPEN;
    bufferedAmount = 0;
    callbacks = [];
    send(_bytes, _options, callback) {
      this.callbacks.push(callback);
    }
    close() {
      if (this.readyState === WebSocket.CLOSED) return;
      this.readyState = WebSocket.CLOSED;
      this.emit('close');
    }
    terminate() {
      this.close();
    }
  }
  const ws = new Socket();
  const observations = [];
  let credit = 0;
  const lease = {
    supportsCodec: () => true,
    maxFps: () => 30,
    captureFrame: async () => ({
      revision: 1n,
      timestampUs: 123n,
      width: 640,
      height: 480,
      ...(codec === 'jpeg'
        ? { jpeg: Buffer.from('ffd8ffd9', 'hex') }
        : {
            avc: {
              config: Buffer.from(
                '0142c01effe100046742c01e01000468ce3c80',
                'hex',
              ),
              bytes: Buffer.from('000000026588', 'hex'),
              keyframe: true,
            },
          }),
    }),
  };
  installMedia(ws, lease, () => {}, {
    audio: {},
    queued() {},
    credit(_codec, delta) {
      credit += delta;
    },
    observe(codec, stage, duration) {
      observations.push({ codec, stage, duration });
    },
  });
  try {
    ws.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          v: 1,
          type: 'media.hello',
          data: { codecs: [codec] },
        }),
      ),
      false,
    );
    await eventually(() => ws.callbacks.length === 2);
    await run({
      ws,
      forward: () => observations.filter((item) => item.stage === 'forward'),
    });
  } finally {
    ws.close();
    assert.equal(credit, 0);
  }
}

test('media forward timing waits for successful completion of every configuration/frame record', async () => {
  for (const codec of ['jpeg', 'h264'])
    for (const order of [
      [0, 1],
      [1, 0],
    ])
      await fixture(codec, async ({ ws, forward }) => {
        ws.callbacks[order[0]]();
        assert.equal(forward().length, 0);
        ws.callbacks[order[1]]();
        assert.equal(forward().length, 1);
        assert.equal(forward()[0].codec, codec);
        assert.ok(forward()[0].duration >= 0);
      });
});

test('media forward timing never counts a partially failed record group as a successful local write', async () => {
  for (const codec of ['jpeg', 'h264'])
    for (const order of [
      [0, 1],
      [1, 0],
    ])
      await fixture(codec, async ({ ws, forward }) => {
        ws.callbacks[order[0]](new Error('synthetic write failure'));
        ws.callbacks[order[1]]();
        assert.equal(ws.readyState, WebSocket.CLOSED);
        assert.equal(forward().length, 0);
      });
});
