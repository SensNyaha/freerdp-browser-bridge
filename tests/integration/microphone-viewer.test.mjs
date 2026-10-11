import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Writable } from 'node:stream';
import { randomInt } from 'node:crypto';
import { chromium } from 'playwright-core';
import { createSessionServer } from '../../apps/bridge-api/dist/session-server.js';
import { FakeSessionWorker, eventually } from '../fixtures/session-worker.mjs';

/** Actual reference viewer/WS/Worklet; synthetic capture and fake RDP only. */
class MicrophoneViewerWorker extends FakeSessionWorker {
  source = {
    enabled: true,
    availability: 'waiting',
    revision: 1n,
    epoch: 0n,
    timestampUs: 0n,
  };
  samples = 0;
  resets = 0;
  signal = false;
  onMicrophone(listener) {
    this.on('microphone', listener);
    return () => this.off('microphone', listener);
  }
  async start(config, abort) {
    await super.start(config, abort);
    if (!abort.aborted) this.emit('microphone', this.source);
  }
  ready() {
    this.source = {
      ...this.source,
      availability: 'ready',
      revision: this.source.revision + 1n,
      epoch: this.source.epoch + 1n,
      timestampUs: this.source.timestampUs + 1n,
    };
    this.emit('microphone', this.source);
  }
  async sendMicrophone(packet) {
    ++this.samples;
    assert.equal(packet.pcm.length, 3840);
    assert.equal(packet.epoch, this.source.epoch);
    if (packet.pcm.readInt16LE(0) === -16384) this.signal = true;
    return 'accepted';
  }
  async resetMicrophone(epoch) {
    assert.equal(epoch, this.source.epoch);
    ++this.resets;
    this.ready();
    return 'scheduled';
  }
  supportsCodec(codec) {
    return codec === 'jpeg';
  }
  async sendInput() {}
  async resetInput() {}
  async captureFrame(since) {
    return {
      revision: 1n,
      timestampUs: 123n,
      width: 640,
      height: 480,
      jpeg: since === 1n ? undefined : this.jpeg,
    };
  }
}

for (const mode of [
  'stop-restart-detach',
  'source-loss',
  'denied',
  'pending-detach',
])
  test(
    `Edge reference microphone viewer: waiting readiness, gesture and ${mode} preserve bounded ownership`,
    { skip: process.platform !== 'win32', timeout: 45000 },
    async () => {
      const worker = new MicrophoneViewerWorker();
      const ports = Array.from({ length: 16 }, () => randomInt(50000, 60000));
      const server = await createSessionServer({
        worker: {
          workerPath: resolve(
            process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/bundled',
            'rdp-worker.exe',
          ),
          runtimeRoot: resolve('.runtime/microphone-viewer-fixture'),
        },
        authenticate: () => ({ id: 'synthetic-microphone-viewer' }),
        allowedOrigins: ports.map((port) => 'http://127.0.0.1:' + port),
        sessions: { workerFactory: () => worker },
        logDestination: new Writable({
          write(_chunk, _encoding, done) {
            done();
          },
        }),
      });
      for (const name of await readdir('apps/reference-harness')) {
        if (!name.endsWith('.js') && name !== 'index.html') continue;
        const bytes = await readFile('apps/reference-harness/' + name);
        server.get(
          name === 'index.html' ? '/harness/' : '/harness/' + name,
          (_request, reply) =>
            reply
              .type(name.endsWith('.js') ? 'text/javascript' : 'text/html')
              .send(bytes),
        );
      }
      let browser, page, sessionId;
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
        page.setDefaultTimeout(5000);
        await page.addInitScript(
          ({ mode }) => {
            const Original = window.AudioContext;
            window.ownedContexts = [];
            window.ownedStreams = [];
            window.permissionRequests = 0;
            window.AudioContext = class extends Original {
              constructor(options) {
                super(options);
                window.ownedContexts.push(this);
              }
            };
            // Never call the original getUserMedia or acquire a physical device.
            navigator.mediaDevices.getUserMedia = async (constraints) => {
              ++window.permissionRequests;
              if (!constraints.audio || constraints.video !== false)
                throw new Error('Synthetic request mismatch');
              if (mode === 'denied')
                throw new Error('Synthetic permission denial');
              const context = window.ownedContexts.at(-1);
              const destination = context.createMediaStreamDestination();
              const tone = context.createConstantSource();
              tone.offset.value = -0.5;
              tone.connect(destination);
              tone.start();
              window.ownedStreams.push(destination.stream);
              if (mode === 'pending-detach')
                await new Promise((done) => {
                  window.releasePermission = done;
                });
              return destination.stream;
            };
          },
          { mode },
        );
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
            media: { microphone: 'pcm' },
          },
        });
        assert.equal(response.statusCode, 202);
        const created = response.json();
        sessionId = created.sessionId;
        await page.evaluate(
          (created) =>
            window.bridgeViewer.attach(created, {
              codecs: ['jpeg'],
              microphone: 'pcm',
            }),
          created,
        );
        await page.waitForFunction(
          () =>
            window.bridgeViewer.stats.frames > 0 &&
            window.bridgeViewer.stats.microphone?.source?.availability ===
              'waiting',
        );
        assert.deepEqual(
          await page.evaluate(() => ({
            contexts: window.ownedContexts.length,
            requests: window.permissionRequests,
            hidden: document.querySelector('#microphone-start').hidden,
            disabled: document.querySelector('#microphone-start').disabled,
          })),
          { contexts: 0, requests: 0, hidden: false, disabled: true },
        );
        worker.ready();
        await page.waitForFunction(
          () => !document.querySelector('#microphone-start').disabled,
        );
        assert.equal(await page.evaluate(() => window.permissionRequests), 0);
        await page.click('#microphone-start');
        await page.waitForFunction(() => window.permissionRequests === 1);
        if (mode === 'denied') {
          await page.waitForFunction(
            () =>
              window.ownedContexts[0].state === 'closed' &&
              !document.querySelector('#microphone-start').disabled,
          );
          assert.equal(worker.samples, 0);
          assert.equal(worker.resets, 0);
          assert.equal(
            (await page.evaluate(() => window.bridgeViewer.stats)).closed,
            false,
          );
        } else if (mode === 'pending-detach') {
          await page.evaluate(() => window.bridgeViewer.detach());
          await page.waitForFunction(
            () =>
              window.ownedContexts[0].state === 'closed' &&
              window.bridgeViewer.stats.microphone?.cleanupFailed,
          );
          const attach = {};
          for (const channel of ['control', 'media']) {
            const replacement = await server.inject({
              method: 'POST',
              url: `/v1/sessions/${sessionId}/attach-token`,
              payload: {
                channel,
                ...(channel === 'control' ? { role: 'controller' } : {}),
              },
            });
            assert.equal(replacement.statusCode, 200);
            attach[channel] = replacement.json();
          }
          await page.evaluate(
            (created) =>
              window.bridgeViewer.attach(created, {
                codecs: ['jpeg'],
                microphone: 'pcm',
              }),
            { sessionId, attach },
          );
          await page.waitForFunction(
            () =>
              window.bridgeViewer.stats.frames > 0 &&
              window.bridgeViewer.stats.microphone?.source?.availability ===
                'ready',
          );
          assert.equal(
            await page.evaluate(
              () => document.querySelector('#microphone-start').disabled,
            ),
            true,
          );
          await page.evaluate(() => window.releasePermission());
          await page.waitForFunction(() =>
            window.ownedStreams.every((stream) =>
              stream.getTracks().every((track) => track.readyState === 'ended'),
            ),
          );
          assert.equal(await page.evaluate(() => window.permissionRequests), 1);
          assert.equal(worker.samples, 0);
          assert.equal(worker.resets, 0);
        } else {
          await eventually(() => worker.samples >= 3 && worker.signal);
          await page.waitForFunction(
            () => window.bridgeViewer.stats.microphone?.owner.active,
          );
          if (mode === 'source-loss') worker.ready();
          else await page.click('#microphone-stop');
          if (mode !== 'source-loss')
            await eventually(() => worker.resets === 1);
          await page.waitForFunction(
            () =>
              window.ownedContexts.every(
                (context) => context.state === 'closed',
              ) &&
              window.ownedStreams.every((stream) =>
                stream
                  .getTracks()
                  .every((track) => track.readyState === 'ended'),
              ) &&
              !document.querySelector('#microphone-start').disabled,
          );
          const stopped = await page.evaluate(() => window.bridgeViewer.stats);
          assert.equal(stopped.closed, false);
          assert.equal(stopped.microphone.owner.failed, false);
          assert.equal(worker.resets, mode === 'source-loss' ? 0 : 1);
          assert.equal(stopped.frames, 1);
          if (mode === 'stop-restart-detach') {
            const previous = worker.samples;
            await page.click('#microphone-start');
            await eventually(() => worker.samples >= previous + 3);
            await page.evaluate(() => window.bridgeViewer.detach());
            await eventually(() => worker.resets === 2);
            await page.waitForFunction(
              () =>
                window.bridgeViewer.stats.microphone?.owner.closed &&
                !window.bridgeViewer.stats.microphone.retiring &&
                window.ownedContexts.every(
                  (context) => context.state === 'closed',
                ),
            );
          }
        }
        const count = worker.samples;
        await page.evaluate(() => new Promise((done) => setTimeout(done, 80)));
        assert.equal(worker.samples, count);
        await page.evaluate(() => window.bridgeViewer.detach());
        await page.waitForFunction(() =>
          window.ownedContexts.every((context) => context.state === 'closed'),
        );
      } finally {
        await page
          ?.evaluate(() => {
            window.releasePermission?.();
            window.bridgeViewer?.detach();
            for (const stream of window.ownedStreams ?? [])
              for (const track of stream.getTracks()) track.stop();
          })
          .catch(() => {});
        await page?.close();
        await browser?.close();
        if (sessionId)
          await server.inject({
            method: 'DELETE',
            url: `/v1/sessions/${sessionId}`,
          });
        await server.close();
      }
      assert.equal(worker.listenerCount('microphone'), 0);
    },
  );
