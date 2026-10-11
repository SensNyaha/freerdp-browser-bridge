import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright-core';
import { createSessionServer } from '../../apps/bridge-api/dist/session-server.js';
import { FakeSessionWorker, eventually } from '../fixtures/session-worker.mjs';

class SyntheticMicrophoneWorker extends FakeSessionWorker {
  source = {
    enabled: true,
    availability: 'ready',
    revision: 1n,
    epoch: 1n,
    timestampUs: 0n,
  };
  samples = 0;
  resets = 0;
  signal = false;
  holdNext = false;
  held = false;
  release;
  onMicrophone(listener) {
    this.on('microphone', listener);
    return () => this.off('microphone', listener);
  }
  async start(config, abort) {
    await super.start(config, abort);
    if (!abort.aborted) this.emit('microphone', this.source);
  }
  async sendMicrophone(packet) {
    ++this.samples;
    assert.equal(packet.pcm.length, 3840);
    assert.equal(packet.epoch, this.source.epoch);
    for (let at = 0; at < packet.pcm.length; at += 2)
      if (packet.pcm.readInt16LE(at) === -16384) this.signal = true;
    if (this.holdNext) {
      this.holdNext = false;
      this.held = true;
      return new Promise((done) => {
        this.release = () => done('accepted');
      });
    }
    return 'accepted';
  }
  async resetMicrophone(epoch) {
    ++this.resets;
    assert.equal(epoch, this.source.epoch);
    this.source = {
      ...this.source,
      revision: this.source.revision + 1n,
      epoch: epoch + 1n,
      timestampUs: this.source.timestampUs + 1n,
    };
    this.emit('microphone', this.source);
    return 'scheduled';
  }
  supportsCodec(codec) {
    return codec === 'jpeg';
  }
  async captureFrame() {
    return undefined;
  } // No rendering or RDP graphics acceptance in this fixture.
}

for (const mode of ['stop', 'controller-loss', 'permission-denied'])
  test(
    `Edge / actual WS / fake RDP microphone: synthetic capture and ${mode} complete the observed retirement barrier`,
    { skip: process.platform !== 'win32', timeout: 45000 },
    async () => {
      const names = [
        'microphone-media.js',
        'microphone-owner.js',
        'microphone-graph.js',
        'microphone-permission.js',
        'microphone-sender.js',
        'microphone-wire.js',
        'microphone-worklet.js',
        'microphone-capture.js',
      ];
      const files = new Map(
        await Promise.all(
          names.map(async (name) => [
            '/' + name,
            await readFile('apps/reference-harness/' + name),
          ]),
        ),
      );
      const staticServer = createServer((request, response) => {
        response.setHeader(
          'Content-Type',
          files.has(request.url) ? 'text/javascript' : 'text/html',
        );
        response.end(
          files.get(request.url) ??
            '<button id="start">Synthetic microphone</button>',
        );
      });
      await new Promise((done) => staticServer.listen(0, '127.0.0.1', done));
      const origin = 'http://127.0.0.1:' + staticServer.address().port;
      const runtimeRoot = await mkdtemp(
        join(tmpdir(), 'bridge-microphone-edge-'),
      );
      const worker = new SyntheticMicrophoneWorker();
      let server, browser, page;
      try {
        server = await createSessionServer({
          worker: {
            workerPath: resolve(
              process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
              'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
            ),
            runtimeRoot,
          },
          authenticate: () => ({ id: 'synthetic-edge-microphone-owner' }),
          allowedOrigins: [origin],
          sessions: { workerFactory: () => worker },
        });
        await server.listen({ host: '127.0.0.1', port: 0 });
        const created = await server.inject({
          method: 'POST',
          url: '/v1/sessions',
          payload: {
            target: { host: 'fixture.invalid' },
            auth: {},
            media: { microphone: 'pcm' },
          },
        });
        assert.equal(created.statusCode, 202);
        const session = created.json();
        browser = await chromium.launch({
          channel: 'msedge',
          headless: true,
          timeout: 5000,
        });
        page = await browser.newPage();
        page.setDefaultTimeout(5000);
        await page.goto(origin);
        await page.evaluate(
          async ({ base, session, mode }) => {
            const [
              { MicrophoneMediaClient },
              { MicrophoneGraph },
              { MicrophoneOwner },
            ] = await Promise.all([
              import('/microphone-media.js'),
              import('/microphone-graph.js'),
              import('/microphone-owner.js'),
            ]);
            let client,
              graph,
              owner,
              context,
              stream,
              tone,
              destination,
              failed = 0,
              requests = 0;
            const socket = (channel) =>
              new WebSocket(
                base +
                  '/v1/sessions/' +
                  session.sessionId +
                  '/' +
                  channel +
                  '?token=' +
                  session.attach[channel].token,
                ['freerdp-bridge-v1'],
              );
            const control = socket('control');
            await new Promise((done, reject) => {
              control.onopen = done;
              control.onerror = () =>
                reject(new Error('Synthetic control connection failed'));
            });
            const media = socket('media');
            media.binaryType = 'arraybuffer';
            const fail = () => {
              ++failed;
              void owner?.close();
              client?.close();
              media.close();
              control.close();
            };
            media.onopen = () =>
              media.send(
                JSON.stringify({
                  v: 1,
                  type: 'media.hello',
                  data: {
                    codecs: ['jpeg'],
                    microphone: { codec: 'pcm', sourceStatus: true },
                  },
                }),
              );
            media.onmessage = ({ data }) => {
              if (typeof data !== 'string') return;
              const value = JSON.parse(data);
              if (value.type === 'media.ready')
                client = new MicrophoneMediaClient(
                  {
                    write(record) {
                      if (
                        media.readyState !== WebSocket.OPEN ||
                        media.bufferedAmount +
                          (typeof record === 'string'
                            ? record.length
                            : record.byteLength) >
                          65536
                      )
                        return false;
                      media.send(record);
                      return true;
                    },
                    changed() {
                      owner?.changed();
                    },
                    failed: fail,
                  },
                  value.data.microphone,
                );
              else if (
                value.type === 'media.error' ||
                value.type === 'session.error'
              )
                fail();
              else client?.message(value);
            };
            media.onerror = fail;
            window.fixture = {
              eligible: () => client?.source?.source?.availability === 'ready',
              client: () => client,
              graph: () => graph,
              owner: () => owner,
              result: () => ({
                failed,
                requests,
                context: context?.state,
                track: stream?.getAudioTracks()[0]?.readyState,
              }),
              control,
              media,
              stop: async () => {
                await owner?.stop();
              },
              cleanup: async () => {
                await owner?.close();
                client?.close();
                media.close();
                control.close();
                tone?.disconnect();
                destination?.disconnect();
                for (const track of stream?.getTracks() ?? []) track.stop();
                if (context && context.state !== 'closed')
                  await context.close();
              },
            };
            document.querySelector('#start').onclick = () => {
              navigator.mediaDevices.getUserMedia = () => {
                ++requests;
                if (mode === 'permission-denied')
                  return Promise.reject(
                    new Error('Synthetic permission denied'),
                  );
                return Promise.resolve(stream);
              }; // Never calls the physical-device API.
              owner = new MicrophoneOwner(
                client,
                {
                  controller: () => control.readyState === WebSocket.OPEN,
                  changed() {},
                  failed: fail,
                },
                {
                  gesture: () => navigator.userActivation.isActive,
                  request: () =>
                    navigator.mediaDevices.getUserMedia({
                      audio: true,
                      video: false,
                    }),
                  context() {
                    context = new AudioContext({ sampleRate: 48000 });
                    destination = context.createMediaStreamDestination();
                    tone = context.createConstantSource();
                    tone.offset.value = -0.5;
                    tone.connect(destination);
                    tone.start();
                    stream = destination.stream;
                    return context;
                  },
                  graph(...args) {
                    graph = new MicrophoneGraph(...args);
                    return graph;
                  },
                },
              );
              window.started = owner.start();
            };
          },
          {
            base: 'ws://127.0.0.1:' + server.server.address().port,
            session,
            mode,
          },
        );
        await page.waitForFunction(() => window.fixture.eligible());
        assert.equal(worker.samples, 0);
        await page.click('#start');
        await page.waitForFunction(() => Boolean(window.started));
        if (mode === 'permission-denied') {
          assert.equal(await page.evaluate(() => window.started), false);
          const denied = await page.evaluate(() => ({
            ...window.fixture.result(),
            active: window.fixture.client().stats.active,
            preparing: window.fixture.owner().stats.preparing,
            ownerFailed: window.fixture.owner().stats.failed,
            mediaOpen: window.fixture.media.readyState === WebSocket.OPEN,
          }));
          assert.equal(denied.failed, 0);
          assert.equal(denied.requests, 1);
          assert.equal(denied.context, 'closed');
          assert.equal(denied.active, false);
          assert.equal(denied.preparing, false);
          assert.equal(denied.ownerFailed, false);
          assert.equal(denied.mediaOpen, true);
          assert.equal(worker.samples, 0);
          assert.equal(worker.resets, 0);
          await page.evaluate(() => window.fixture.cleanup());
          return;
        }
        assert.equal(await page.evaluate(() => window.started), true);
        await eventually(() => worker.samples >= 3 && worker.signal);
        if (mode === 'stop') await page.evaluate(() => window.fixture.stop());
        else {
          worker.holdNext = true;
          await eventually(() => worker.held);
          await page.evaluate(() => {
            window.fixture.control.close();
            window.fixture.graph().poll(); // Graph observes lost authority before the owner's next poll.
          });
          await page.waitForFunction(
            () =>
              window.fixture.result().track === 'ended' &&
              window.fixture.result().context === 'closed',
          );
          assert.equal(worker.resets, 0); // Worker reset cannot precede the borrowed PCM completion.
          worker.release();
          await page.evaluate(() => window.fixture.stop());
        }
        await eventually(() => worker.resets === 1);
        const count = worker.samples;
        const result = await page.evaluate(async () => {
          const f = window.fixture;
          await new Promise((done) => setTimeout(done, 60));
          return {
            ...f.result(),
            sourceEpoch: f.client().source.source.epoch.toString(),
            graphClosed: f.graph().stats.closed,
            pendingBytes: f.client().stats.pendingBytes,
            active: f.client().stats.active,
            mediaOpen: f.media.readyState === WebSocket.OPEN,
          };
        });
        assert.deepEqual(result, {
          failed: 0,
          requests: 1,
          context: 'closed',
          track: 'ended',
          sourceEpoch: '2',
          graphClosed: true,
          pendingBytes: 0,
          active: false,
          mediaOpen: true,
        });
        assert.equal(worker.samples, count);
        await page.evaluate(() => window.fixture.cleanup());
      } finally {
        worker.release?.();
        await page?.close();
        await browser?.close();
        staticServer.closeAllConnections();
        await new Promise((done) => staticServer.close(done));
        await server?.close();
        assert.equal(worker.listenerCount('microphone'), 0);
        await rm(runtimeRoot, { recursive: true, force: true, maxRetries: 3 });
      }
    },
  );
