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

for (const mode of ['stop', 'controller-loss'])
  test(
    `Edge / actual WS / fake RDP microphone: synthetic capture and ${mode} complete the observed retirement barrier`,
    { skip: process.platform !== 'win32', timeout: 45000 },
    async () => {
      const names = [
        'microphone-media.js',
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
          async ({ base, session }) => {
            const [
              { MicrophoneMediaClient },
              { MicrophoneGraph },
              { MicrophonePermission },
            ] = await Promise.all([
              import('/microphone-media.js'),
              import('/microphone-graph.js'),
              import('/microphone-permission.js'),
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
                      if (owner && !owner.poll() && graph) void owner.stop();
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
                if (context && context.state !== 'closed')
                  await context.close();
              },
            };
            document.querySelector('#start').onclick = async () => {
              context = new AudioContext({ sampleRate: 48000 });
              const resumed = context.resume();
              destination = context.createMediaStreamDestination();
              tone = context.createConstantSource();
              tone.offset.value = -0.5;
              tone.connect(destination);
              tone.start();
              stream = destination.stream;
              navigator.mediaDevices.getUserMedia = () => {
                ++requests;
                return Promise.resolve(stream);
              }; // Never calls the physical-device API.
              await resumed;
              owner = new MicrophonePermission(
                {
                  eligible: (epoch) =>
                    control.readyState === WebSocket.OPEN &&
                    client.source?.source?.epoch === epoch,
                  begin(value, epoch) {
                    let cancelled = false,
                      token;
                    const activation = (async () => {
                      if (!(await client.start(epoch)) || cancelled)
                        return false;
                      token = client.authorize(epoch);
                      if (!token) return false;
                      graph = new MicrophoneGraph(
                        context,
                        value,
                        epoch,
                        token,
                        client.sender,
                        {
                          authorized: (key, current) =>
                            !cancelled && client.authorized(key, current),
                          retire: () => client.stop(),
                          failed: () => {
                            void owner.stop();
                          },
                        },
                        { retirementMs: 4500 },
                      );
                      return graph.ready;
                    })();
                    return {
                      ready: activation,
                      current: () =>
                        !cancelled &&
                        control.readyState === WebSocket.OPEN &&
                        (token
                          ? client.authorized(token, epoch)
                          : client.source?.source?.epoch === epoch),
                      close: async () => {
                        cancelled = true;
                        await Promise.all([
                          client.stop(),
                          graph ? graph.close() : context.close(),
                          activation,
                        ]);
                      },
                    };
                  },
                },
                undefined,
                30000,
                5000,
              );
              window.started = owner.start(client.source.source.epoch);
            };
          },
          { base: 'ws://127.0.0.1:' + server.server.address().port, session },
        );
        await page.waitForFunction(() => window.fixture.eligible());
        assert.equal(worker.samples, 0);
        await page.click('#start');
        await page.waitForFunction(() => Boolean(window.started));
        assert.equal(await page.evaluate(() => window.started), true);
        await eventually(() => worker.samples >= 3 && worker.signal);
        if (mode === 'stop') await page.evaluate(() => window.fixture.stop());
        else {
          worker.holdNext = true;
          await eventually(() => worker.held);
          await page.evaluate(() => window.fixture.control.close());
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
