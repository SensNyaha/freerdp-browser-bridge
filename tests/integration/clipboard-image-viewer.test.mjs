import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomInt } from 'node:crypto';
import { resolve, join, sep } from 'node:path';
import { Writable } from 'node:stream';
import { chromium } from 'playwright-core';
import { createSessionServer } from '../../apps/bridge-api/dist/session-server.js';
import { ImageSessionWorker } from '../fixtures/image-session-worker.mjs';
import { eventually } from '../fixtures/session-worker.mjs';
import { listenBrowserLoopback } from '../fixtures/browser-port.mjs';

class ImageViewerWorker extends ImageSessionWorker {
  async resetInput() {}
  async sendInput() {}
  supportsCodec(codec) {
    return codec === 'jpeg';
  }
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

for (const mode of ['bidirectional', 'server-to-browser', 'browser-to-server'])
  test(
    `Edge image reference viewer / actual WS / synthetic RDP: ${mode} PNG gestures and cleanup`,
    { skip: process.platform !== 'win32', timeout: 60000 },
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'rdp-image-viewer-')),
        worker = new ImageViewerWorker(),
        ports = Array.from({ length: 8 }, () => randomInt(49152, 65536));
      worker.image.rgba.fill(0);
      worker.image = { width: 100, height: 100, rgba: Buffer.alloc(40000) };
      for (let n = 0; n < 10000; n++)
        worker.image.rgba.set(
          [n % 251, (n * 3) % 251, (n * 7) % 251, 255],
          n * 4,
        );
      const server = await createSessionServer({
        worker: {
          workerPath: resolve(
            process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/bundled',
            'rdp-worker.exe',
          ),
          runtimeRoot: root,
        },
        authenticate: () => ({ id: 'synthetic-image-viewer' }),
        allowedOrigins: ports.map((port) => 'http://127.0.0.1:' + port),
        sessions: { workerFactory: () => worker },
        logDestination: new Writable({
          write(_bytes, _encoding, done) {
            done();
          },
        }),
      });
      for (const name of await readdir('apps/reference-harness')) {
        const bytes = await readFile('apps/reference-harness/' + name);
        server.get(
          name === 'index.html' ? '/harness/' : '/harness/' + name,
          (_request, reply) =>
            reply
              .header(
                'Content-Security-Policy',
                "default-src 'none'; script-src 'self'; worker-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src blob:",
              )
              .type(name.endsWith('.js') ? 'text/javascript' : 'text/html')
              .send(bytes),
        );
      }
      server.get('/fixture-hang.js', (_request, reply) =>
        reply.type('text/javascript').send('self.onmessage=()=>{};'),
      );
      let browser,
        portIndex = 0;
      try {
        const port = await listenBrowserLoopback(
          (port) => server.listen({ host: '127.0.0.1', port }),
          () => ports[portIndex++],
        );
        browser = await chromium.launch({ channel: 'msedge', headless: true });
        const page = await browser.newPage(),
          errors = [];
        page.setDefaultTimeout(7000);
        page.on('pageerror', () => errors.push('pageerror'));
        await page.addInitScript(() => {
          window.imageReads =
            window.imageWrites =
            window.imageTypeReads =
            window.imageWorkerStarts =
            window.imageWorkerStops =
              0;
          window.imageMode = 'normal';
          window.imageWorkerMode = 'normal';
          window.activations = [];
          const OriginalWorker = window.Worker;
          window.Worker = class extends OriginalWorker {
            constructor(...args) {
              ++window.imageWorkerStarts;
              if (window.imageWorkerMode === 'hang')
                args[0] = new URL('/fixture-hang.js', location.href);
              super(...args);
            }
            terminate() {
              ++window.imageWorkerStops;
              return super.terminate();
            }
          };
          window.imageItem = () => ({
            types:
              window.imageMode === 'wrong-type'
                ? ['text/plain']
                : ['image/png'],
            getType() {
              ++window.imageTypeReads;
              if (window.imageMode === 'pending-type')
                return new Promise((resolve) => {
                  window.releaseType = resolve;
                });
              if (window.imageMode === 'oversize')
                return Promise.resolve(
                  new Blob([new Uint8Array(16777217)], { type: 'image/png' }),
                );
              return Promise.resolve(window.ownedPng);
            },
          });
          Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
              read() {
                ++window.imageReads;
                window.activations.push(navigator.userActivation.isActive);
                if (window.imageMode === 'denied')
                  return Promise.reject(new Error('private synthetic denial'));
                if (window.imageMode === 'pending-read')
                  return new Promise((resolve) => {
                    window.releaseRead = resolve;
                  });
                return Promise.resolve([window.imageItem()]);
              },
              async write(items) {
                ++window.imageWrites;
                window.activations.push(navigator.userActivation.isActive);
                const blob = await items[0].getType('image/png');
                const bitmap = await createImageBitmap(blob),
                  canvas = new OffscreenCanvas(bitmap.width, bitmap.height),
                  ctx = canvas.getContext('2d');
                try {
                  ctx.drawImage(bitmap, 0, 0);
                  const pixels = ctx.getImageData(
                    0,
                    0,
                    bitmap.width,
                    bitmap.height,
                  ).data;
                  window.copiedExact =
                    bitmap.width === 100 && bitmap.height === 100;
                  for (let n = 0; n < 10000; n++)
                    window.copiedExact &&=
                      pixels[n * 4] === n % 251 &&
                      pixels[n * 4 + 1] === (n * 3) % 251 &&
                      pixels[n * 4 + 2] === (n * 7) % 251 &&
                      pixels[n * 4 + 3] === 255;
                  pixels.fill(0);
                } finally {
                  bitmap.close();
                  canvas.width = canvas.height = 0;
                }
              },
              readText() {
                throw new Error('Unexpected text read');
              },
              writeText() {
                throw new Error('Unexpected text write');
              },
            },
          });
        });
        await page.goto('http://127.0.0.1:' + port + '/harness/');
        await page.waitForFunction(() => Boolean(window.bridgeViewer));
        worker.jpeg = Buffer.from(
          await page.evaluate(async () => {
            const canvas = document.createElement('canvas');
            canvas.width = 640;
            canvas.height = 480;
            canvas.getContext('2d').fillRect(0, 0, 640, 480);
            const jpeg = canvas.toDataURL('image/jpeg').split(',')[1];
            canvas.width = canvas.height = 0;
            const pngCanvas = new OffscreenCanvas(100, 100),
              ctx = pngCanvas.getContext('2d'),
              pixels = new ImageData(100, 100);
            for (let n = 0; n < 10000; n++)
              pixels.data.set(
                [n % 251, (n * 3) % 251, (n * 7) % 251, 255],
                n * 4,
              );
            ctx.putImageData(pixels, 0, 0);
            pixels.data.fill(0);
            window.ownedPng = await pngCanvas.convertToBlob({
              type: 'image/png',
            });
            pngCanvas.width = pngCanvas.height = 0;
            return jpeg;
          }),
          'base64',
        );
        const response = await server.inject({
          method: 'POST',
          url: '/v1/sessions',
          payload: {
            target: { host: 'synthetic' },
            auth: {},
            clipboard: {
              mode,
              images: true,
              ...(mode === 'bidirectional' ? { html: true } : {}),
              maxItemBytes: 1048576,
            },
          },
        });
        assert.equal(response.statusCode, 202);
        const created = response.json();
        await page.evaluate(
          (created) =>
            window.bridgeViewer.attach(created, { codecs: ['jpeg'] }),
          created,
        );
        await page.waitForFunction(
          () =>
            window.bridgeViewer.stats.frames === 1 &&
            !document.querySelector('#clipboard-image').hidden,
        );
        const button = (name) =>
            page.locator('[data-image-clipboard=' + name + ']'),
          status = () =>
            page.locator('#clipboard-image [role=status]').textContent(),
          preview = (name) =>
            page.locator('[data-image-clipboard-' + name + ']');
        assert.equal(
          await page.evaluate(
            () =>
              window.imageReads + window.imageWrites + window.imageWorkerStarts,
          ),
          0,
        );
        assert.equal(worker.reads + worker.writes, 0);
        assert.equal(
          await button('paste').isDisabled(),
          mode === 'server-to-browser',
        );
        assert.equal(
          await button('read').isDisabled(),
          mode === 'browser-to-server',
        );
        if (mode !== 'server-to-browser') {
          await button('paste').click();
          await page.waitForFunction(
            () =>
              document.querySelector('[data-image-clipboard-draft]').width ===
              100,
          );
          assert.equal(worker.writes, 0);
          await button('send').click();
          await eventually(() => worker.writes === 1);
          await page.waitForFunction(
            () =>
              !document.querySelector('[data-image-clipboard=paste]').disabled,
          );
          assert.deepEqual(worker.written, worker.image);
          assert.equal(
            await preview('draft').evaluate((canvas) => canvas.width),
            0,
          );
          await page.evaluate(() => {
            window.imageMode = 'denied';
          });
          await button('paste').click();
          await page.waitForFunction(() =>
            document
              .querySelector('#clipboard-image [role=status]')
              .textContent.includes('отказал'),
          );
          assert.equal(
            await preview('draft').evaluate((canvas) => canvas.width),
            0,
          );
          assert.ok(!(await status()).includes('private'));
        }
        if (mode !== 'browser-to-server') {
          await button('read').click();
          await page.waitForFunction(
            () =>
              document.querySelector('[data-image-clipboard-received]')
                .width === 100,
          );
          assert.equal(await page.evaluate(() => window.imageWrites), 0);
          await button('copy').click();
          await page.waitForFunction(
            () =>
              document.querySelector('#clipboard-image [role=status]')
                .textContent === 'Изображение скопировано',
          );
          assert.equal(await page.evaluate(() => window.copiedExact), true);
          assert.ok(worker.returned[0].rgba.every((byte) => !byte));
        }
        if (mode === 'bidirectional') {
          await button('clear').click();
          for (const refusal of ['wrong-type', 'oversize']) {
            const starts = await page.evaluate(() => window.imageWorkerStarts);
            await page.evaluate((mode) => {
              window.imageMode = mode;
            }, refusal);
            await button('paste').click();
            await page.waitForFunction(() =>
              document
                .querySelector('#clipboard-image [role=status]')
                .textContent.includes('превышает лимит'),
            );
            assert.equal(
              await page.evaluate(() => window.imageWorkerStarts),
              starts,
            );
          }
          await page.evaluate(() => {
            window.imageMode = 'pending-read';
          });
          await button('paste').click();
          assert.equal(
            await page.locator('[data-clipboard=paste]').isDisabled(),
            true,
          );
          assert.equal(
            await page.locator('[data-html-clipboard=paste]').isDisabled(),
            true,
          );
          const types = await page.evaluate(() => window.imageTypeReads);
          await button('clear').click();
          await page.evaluate(() => window.releaseRead([window.imageItem()]));
          await page.evaluate(() => Promise.resolve());
          assert.equal(await page.evaluate(() => window.imageTypeReads), types);
          await button('paste').click();
          await page.waitForFunction(
            () =>
              document.querySelector('#clipboard-image [role=status]')
                .textContent === 'Ожидание разрешения завершено',
          );
          await page.evaluate(() => window.releaseRead([window.imageItem()]));
          assert.equal(
            await preview('draft').evaluate((canvas) => canvas.width),
            0,
          );
          await page.evaluate(() => {
            window.imageMode = 'pending-type';
          });
          await button('paste').click();
          await page.waitForFunction(() => Boolean(window.releaseType));
          const before = await page.evaluate(() => window.imageWorkerStarts);
          await button('clear').click();
          await page.evaluate(() => window.releaseType(window.ownedPng));
          await page.evaluate(() => Promise.resolve());
          assert.equal(
            await page.evaluate(() => window.imageWorkerStarts),
            before,
          );
          await page.evaluate(() => {
            window.imageMode = 'normal';
            window.imageWorkerMode = 'hang';
          });
          await button('paste').click();
          await page.waitForFunction(
            (n) => window.imageWorkerStarts > n,
            before,
          );
          const stops = await page.evaluate(() => window.imageWorkerStops);
          await button('clear').click();
          assert.ok(
            await page.evaluate((n) => window.imageWorkerStops > n, stops),
          );
          await page.evaluate(() => {
            window.imageWorkerMode = 'normal';
          });
          await button('paste').click();
          await page.waitForFunction(
            () =>
              document.querySelector('[data-image-clipboard-draft]').width ===
              100,
          );
          await button('clear').click();
          let release;
          worker.readGate = new Promise((resolve) => {
            release = resolve;
          });
          await button('read').click();
          await eventually(() => worker.reads === 2);
          await button('clear').click();
          release();
          await page.waitForFunction(
            () =>
              !document.querySelector('[data-image-clipboard=read]').disabled,
          );
          assert.equal(
            await preview('received').evaluate((canvas) => canvas.width),
            0,
          );
          await eventually(() => worker.returned.length === 2);
          assert.ok(worker.returned[1].rgba.every((byte) => !byte));
          await page.evaluate(() => {
            window.imageMode = 'pending-read';
          });
          await button('paste').click();
        }
        const types = await page.evaluate(() => window.imageTypeReads);
        await page.evaluate(() => window.bridgeViewer.detach());
        if (mode === 'bidirectional')
          await page.evaluate(() => window.releaseRead([window.imageItem()]));
        assert.equal(await page.evaluate(() => window.imageTypeReads), types);
        assert.equal(await page.locator('#clipboard-image').isHidden(), true);
        assert.equal(
          await preview('draft').evaluate((canvas) => canvas.width),
          0,
        );
        assert.equal(
          await preview('received').evaluate((canvas) => canvas.width),
          0,
        );
        assert.ok(
          (await page.evaluate(() => window.activations)).every(Boolean),
        );
        assert.equal(
          await page.evaluate(
            () => window.imageWorkerStarts === window.imageWorkerStops,
          ),
          true,
        );
        await eventually(
          () => worker.revokes === (mode === 'server-to-browser' ? 0 : 1),
        );
        assert.deepEqual(errors, []);
      } finally {
        await browser?.close();
        await server.close();
        worker.image.rgba.fill(0);
        worker.written?.rgba.fill(0);
        assert.deepEqual(await readdir(root), []);
        const absolute = resolve(root);
        if (!absolute.startsWith(resolve(tmpdir()) + sep + 'rdp-image-viewer-'))
          throw new Error('Invalid owned fixture directory');
        await rm(absolute, { recursive: true, force: true, maxRetries: 3 });
      }
    },
  );
