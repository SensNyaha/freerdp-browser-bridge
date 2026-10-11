import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomInt } from 'node:crypto';
import { Writable } from 'node:stream';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright-core';
import { createSessionServer } from '../../apps/bridge-api/dist/session-server.js';
import { FakeSessionWorker, eventually } from '../fixtures/session-worker.mjs';

/** Actual harness/WebSocket/Worklet; synthetic media backend, no RDP/audio acceptance. */
class PcmViewerWorker extends FakeSessionWorker {
  captures = 0;
  supportsCodec(codec) {
    return codec === 'jpeg';
  }
  onAudio(listener) {
    this.on('audio', listener);
    return () => this.off('audio', listener);
  }
  async sendInput() {}
  async resetAudio() {
    return 'unavailable';
  }
  async captureFrame(since) {
    this.captures++;
    return {
      revision: 1n,
      timestampUs: 123n,
      width: 640,
      height: 480,
      jpeg: since === 1n ? undefined : this.jpeg,
    };
  }
}
const state = (revision, availability) => ({
  type: 'state',
  state: {
    enabled: true,
    revision,
    availability,
    epoch: 1n,
    timestampUs: 5000000n,
  },
});
const config = {
  type: 'config',
  config: {
    epoch: 1n,
    codec: 'pcm',
    sampleRate: 48000,
    channels: 2,
    sampleFormat: 's16le',
    packetFrames: 960,
  },
};
const packet = (index) => ({
  type: 'packet',
  packet: {
    epoch: 1n,
    timestampUs: BigInt(index) * 20000n,
    frames: 960,
    silenceFrames: 0,
    discontinuity: index === 0,
    pcm: Buffer.alloc(3840),
  },
});

for (const codec of ['pcm', 'opus'])
  test(
    `Edge reference ${codec} viewer: gesture precedes sockets, cancelled preparation cannot attach, actual socket/Worklet ACK and stop preserve video`,
    {
      skip:
        process.platform !== 'win32' ||
        (codec === 'opus' &&
          (process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/bundled').includes(
            'foundation',
          )),
      timeout: 45000,
    },
    async () => {
      let tone;
      if (codec === 'opus') {
        const { stdout } = await promisify(execFile)(
          resolve(
            process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/bundled',
            'fixture-opus-tone.exe',
          ),
          [],
          { timeout: 5000, maxBuffer: 100000, windowsHide: true },
        );
        tone = JSON.parse(stdout);
      }
      const audioConfig =
        codec === 'pcm'
          ? config
          : {
              type: 'config',
              config: {
                codec: 'opus',
                epoch: 1n,
                sampleRate: 48000,
                channels: 2,
                packetFrames: 960,
                lookaheadFrames: tone.lookaheadFrames,
              },
            };
      const audioPacket = (index) =>
        codec === 'pcm'
          ? packet(index)
          : {
              type: 'packet',
              packet: {
                epoch: 1n,
                timestampUs: BigInt(index) * 20000n,
                frames: 960,
                silenceFrames: 0,
                discontinuity: index === 0,
                encoded: Buffer.from(tone.packets[index]),
              },
            };
      const ports = Array.from({ length: 16 }, () => randomInt(20000, 60000));
      const worker = new PcmViewerWorker();
      const server = await createSessionServer({
        worker: {
          workerPath: resolve(
            process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/bundled',
            'rdp-worker.exe',
          ),
          runtimeRoot: resolve('.runtime/pcm-viewer-fixture'),
        },
        authenticate: () => ({ id: 'pcm-viewer-fixture' }),
        allowedOrigins: ports.map((port) => 'http://127.0.0.1:' + port),
        sessions: { workerFactory: () => worker },
        logDestination: new Writable({
          write(_chunk, _encoding, done) {
            done();
          },
        }),
      });
      let releaseModule,
        blockModule = true;
      const moduleGate = new Promise((resolve) => {
        releaseModule = resolve;
      });
      for (const name of await readdir('apps/reference-harness')) {
        if (!name.endsWith('.js') && name !== 'index.html') continue;
        const bytes = await readFile('apps/reference-harness/' + name);
        server.get(
          name === 'index.html' ? '/harness/' : '/harness/' + name,
          async (_request, reply) => {
            if (name === 'pcm-playback.js' && blockModule) await moduleGate;
            return reply
              .type(name.endsWith('.js') ? 'text/javascript' : 'text/html')
              .send(bytes);
          },
        );
      }
      let browser, page;
      try {
        for (let attempt = 0; ; attempt++) {
          try {
            await server.listen({ host: '127.0.0.1', port: ports[attempt] });
            break;
          } catch (error) {
            if (error.code !== 'EADDRINUSE' || attempt === 15) throw error;
          }
        }
        browser = await chromium.launch({
          channel: 'msedge',
          headless: true,
          timeout: 5000,
        });
        page = await browser.newPage();
        page.setDefaultTimeout(3000);
        await page.addInitScript(() => {
          const Original = window.AudioContext;
          window.ownedContexts = [];
          window.AudioContext = class extends Original {
            constructor(options) {
              super(options);
              window.ownedContexts.push(this);
            }
          };
        });
        await page.goto(
          'http://127.0.0.1:' + server.server.address().port + '/harness/',
        );
        await page.waitForFunction(() => Boolean(window.bridgeViewer));
        worker.jpeg = Buffer.from(
          await page.evaluate(() => {
            const canvas = document.createElement('canvas');
            canvas.width = 640;
            canvas.height = 480;
            canvas.getContext('2d').fillRect(0, 0, 640, 480);
            return canvas.toDataURL('image/jpeg').split(',')[1];
          }),
          'base64',
        );
        const response = await server.inject({
          method: 'POST',
          url: '/v1/sessions',
          payload: {
            target: { host: 'fake.test' },
            auth: {},
            media: { audioOutput: codec },
          },
        });
        assert.equal(response.statusCode, 202);
        const created = response.json();
        await eventually(() => worker.started === 1);
        worker.emit('audio', state(1n, 'waiting'));
        const attach = () =>
          page.evaluate(
            ({ created, codec }) =>
              window.bridgeViewer.attach(created, {
                codecs: ['jpeg'],
                audioOutput: codec,
              }),
            { created, codec },
          );
        await attach();
        assert.deepEqual(
          await page.evaluate(() => ({
            stage: window.bridgeViewer.stats.stage,
            contexts: window.ownedContexts.length,
          })),
          { stage: 'audio-gesture', contexts: 0 },
        );
        assert.equal(worker.captures, 0);
        await page.click('#audio-start');
        await page.waitForFunction(() => window.ownedContexts.length === 1);
        await page.evaluate(() => window.bridgeViewer.detach());
        await page.waitForFunction(
          () => window.ownedContexts[0].state === 'closed',
        );
        blockModule = false;
        releaseModule();
        await page.waitForTimeout(100);
        assert.equal(worker.captures, 0);
        assert.equal(worker.closed, 0);
        await attach();
        await page.click('#audio-start');
        await page.waitForFunction(
          () =>
            window.bridgeViewer.stats.frames >= 1 &&
            window.bridgeViewer.stats.audio?.source?.availability ===
              'waiting' &&
            !window.bridgeViewer.stats.audio.recordInFlight,
        );
        assert.equal(worker.closed, 0);
        worker.emit('audio', state(2n, 'ready'));
        worker.emit('audio', audioConfig);
        worker.emit('audio', audioPacket(0));
        await page.waitForFunction(
          () =>
            window.bridgeViewer.stats.audio.records === 4 &&
            !window.bridgeViewer.stats.audio.recordInFlight,
        );
        worker.emit('audio', audioPacket(1));
        await page.waitForFunction(
          () =>
            window.bridgeViewer.stats.audio.records === 5 &&
            !window.bridgeViewer.stats.audio.recordInFlight,
        );
        worker.emit('audio', state(3n, 'closed'));
        await page.waitForFunction(
          () =>
            window.bridgeViewer.stats.audio.source.availability === 'closed' &&
            !window.bridgeViewer.stats.audio.recordInFlight,
        );
        await page.evaluate(() => window.bridgeViewer.requestAudioStats());
        await page.waitForFunction(
          () =>
            Boolean(window.bridgeViewer.stats.audio.remote) &&
            !window.bridgeViewer.stats.audio.inFlight,
        );
        const stopped = await page.evaluate(() => window.bridgeViewer.stats);
        assert.equal(stopped.error, undefined);
        assert.equal(stopped.closed, false);
        assert.equal(stopped.frames, 1);
        assert.equal(stopped.audio.records, 6);
        assert.equal(stopped.audio.remote.packets, 2);
        assert.equal(stopped.audio.remote.queuedFrames, 0);
        assert.equal(stopped.audio.remote.invalidCalls, 0);
        assert.equal(stopped.audio.pendingPacketBytes, 0);
        await page.evaluate(() => window.bridgeViewer.detach());
        await page.waitForFunction(() =>
          window.ownedContexts.every((context) => context.state === 'closed'),
        );
        assert.equal(
          (await page.evaluate(() => window.bridgeViewer.stats)).audio.closed,
          true,
        );
        assert.equal(worker.closed, 0);
      } finally {
        blockModule = false;
        releaseModule();
        await page?.close();
        await browser?.close();
        await server.close();
      }
    },
  );
