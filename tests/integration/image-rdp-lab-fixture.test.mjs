import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';
import {
  imageLabDocument,
  imageLabPixels,
  parseImageLabReceipt,
} from '../../scripts/image-rdp-lab-fixture.mjs';
import { listenBrowserHttp } from '../fixtures/browser-port.mjs';
import { randomInt } from 'node:crypto';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { Writable } from 'node:stream';
import { createSessionServer } from '../../apps/bridge-api/dist/session-server.js';
import { ImageSessionWorker } from '../fixtures/image-session-worker.mjs';
import { eventually } from '../fixtures/session-worker.mjs';
import { listenBrowserLoopback } from '../fixtures/browser-port.mjs';
test(
  'owned image application hotkeys and PNG paste semantics with synthetic OS APIs, no RDP',
  { skip: process.platform !== 'win32', timeout: 25000 },
  async () => {
    const id = 'c'.repeat(32),
      { html } = await imageLabDocument(id);
    const server = createServer((_request, response) => {
      response.setHeader('content-type', 'text/html');
      response.end(html);
    });
    let browser;
    try {
      const port = await listenBrowserHttp(server);
      browser = await chromium.launch({ channel: 'msedge', headless: true });
      const page = await browser.newPage(),
        errors = [];
      page.on('pageerror', () => errors.push('pageerror'));
      await page.addInitScript(() => {
        window.osCalls = 0;
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: {
            async write(items) {
              ++window.osCalls;
              window.lastBlob = await items[0].getType('image/png');
            },
          },
        });
      });
      await page.goto('http://127.0.0.1:' + port);
      const receipt = async () =>
        parseImageLabReceipt(await page.locator('#r').inputValue(), id);
      assert.equal((await receipt()).ready, true);
      for (const number of [1, 2]) {
        await page.keyboard.press('F8');
        await page.waitForFunction(
          (n) => JSON.parse(document.querySelector('#r').value).copies === n,
          number,
        );
        const hash = await page.evaluate(async () => {
          const bitmap = await createImageBitmap(window.lastBlob),
            canvas = new OffscreenCanvas(32, 32),
            ctx = canvas.getContext('2d');
          ctx.drawImage(bitmap, 0, 0);
          const rgba = ctx.getImageData(0, 0, 32, 32).data,
            digest = await crypto.subtle.digest('SHA-256', rgba);
          rgba.fill(0);
          bitmap.close();
          canvas.width = canvas.height = 0;
          return Array.from(new Uint8Array(digest), (v) =>
            v.toString(16).padStart(2, '0'),
          ).join('');
        });
        const expected = imageLabPixels(id, 'remote', number);
        assert.equal(hash, createHash('sha256').update(expected).digest('hex'));
        expected.fill(0);
      }
      await page.keyboard.press('F2');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'r');
      const paste = async (bytes, oversize = false) => {
        await page.keyboard.press('F9');
        await page.evaluate(
          async ({ bytes, oversize }) => {
            let blob;
            if (oversize)
              blob = new Blob([new Uint8Array(16385)], { type: 'image/png' });
            else {
              const canvas = new OffscreenCanvas(32, 32);
              canvas
                .getContext('2d')
                .putImageData(
                  new ImageData(new Uint8ClampedArray(bytes), 32, 32),
                  0,
                  0,
                );
              blob = await canvas.convertToBlob({ type: 'image/png' });
              canvas.width = canvas.height = 0;
            }
            const transfer = new DataTransfer();
            transfer.items.add(
              new File([blob], 'owned.png', { type: 'image/png' }),
            );
            document.querySelector('#t').dispatchEvent(
              new ClipboardEvent('paste', {
                clipboardData: transfer,
                cancelable: true,
              }),
            );
          },
          { bytes, oversize },
        );
        await page.waitForFunction(
          () => !JSON.parse(document.querySelector('#r').value).pending,
        );
        return receipt();
      };
      const local = imageLabPixels(id, 'browser', 0);
      assert.equal((await paste(Array.from(local))).ok, true);
      local.fill(0);
      const wrong = imageLabPixels(id, 'remote', 0),
        refused = await paste(Array.from(wrong));
      wrong.fill(0);
      assert.equal(refused.png, true);
      assert.equal(refused.ok, false);
      await page.reload();
      await page.evaluate(() => {
        const original = createImageBitmap;
        window.decodes = 0;
        window.createImageBitmap = (...args) => {
          ++window.decodes;
          return original(...args);
        };
      });
      const quota = await paste([], true);
      assert.equal(quota.png, false);
      assert.equal(await page.evaluate(() => window.decodes), 0);
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);

test(
  'image RDP helper client composes actual WS image/receipt input with a synthetic backend and no OS calls',
  { skip: process.platform !== 'win32', timeout: 25000 },
  async () => {
    const worker = new ImageSessionWorker(),
      inputs = [],
      ports = Array.from({ length: 8 }, () => randomInt(49152, 65536));
    let textReads = 0;
    worker.sendInput = async (event) => {
      inputs.push(event);
    };
    const text = worker.readClipboardText.bind(worker);
    worker.readClipboardText = async () => {
      textReads++;
      return text();
    };
    const server = await createSessionServer({
      worker: {
        workerPath: resolve(
          process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/bundled',
          'rdp-worker.exe',
        ),
        runtimeRoot: resolve('.runtime/image-lab-fixture'),
      },
      authenticate: () => ({ id: 'synthetic-image-lab' }),
      allowedOrigins: ports.map((port) => 'http://127.0.0.1:' + port),
      sessions: { workerFactory: () => worker },
      logDestination: new Writable({
        write(_bytes, _encoding, done) {
          done();
        },
      }),
    });
    const index = await readFile('apps/reference-harness/index.html', 'utf8'),
      panel = index.slice(
        index.indexOf('<section id="clipboard-image"'),
        index.indexOf('<section id="clipboard-html"'),
      );
    const fixture = (
      await readFile('tests/fixtures/image-rdp-client.html', 'utf8')
    ).replace('<!--REFERENCE_PANEL-->', panel);
    server.get('/', (_request, reply) => reply.type('text/html').send(fixture));
    server.get('/image-lab-pixels.js', (_request, reply) =>
      reply.type('text/javascript').send('export ' + imageLabPixels.toString()),
    );
    for (const name of [
      'clipboard-client.js',
      'clipboard-html.js',
      'clipboard-image.js',
      'clipboard-image-view.js',
      'clipboard-image-conversion.js',
      'clipboard-image-worker.js',
      'clipboard-text.js',
      'clipboard-wire.js',
    ]) {
      const bytes = await readFile('apps/reference-harness/' + name);
      server.get('/' + name, (_request, reply) =>
        reply.type('text/javascript').send(bytes),
      );
    }
    let browser,
      portIndex = 0;
    try {
      const port = await listenBrowserLoopback(
        (port) => server.listen({ host: '127.0.0.1', port }),
        () => ports[portIndex++],
      );
      const response = await server.inject({
        method: 'POST',
        url: '/v1/sessions',
        payload: {
          target: { host: 'synthetic' },
          auth: {},
          clipboard: {
            mode: 'bidirectional',
            images: true,
            maxItemBytes: 8192,
          },
        },
      });
      assert.equal(response.statusCode, 202);
      browser = await chromium.launch({ channel: 'msedge', headless: true });
      const page = await browser.newPage(),
        errors = [];
      page.setDefaultTimeout(7000);
      page.on('pageerror', () => errors.push('pageerror'));
      await page.addInitScript(() => {
        window.osCalls = 0;
        Object.defineProperty(navigator, 'clipboard', {
          value: Object.fromEntries(
            ['read', 'write', 'readText', 'writeText'].map((name) => [
              name,
              () => {
                ++window.osCalls;
                throw new Error('Unexpected OS call');
              },
            ]),
          ),
        });
      });
      await page.goto('http://127.0.0.1:' + port + '/?id=' + 'e'.repeat(32));
      await page.waitForFunction(() => Boolean(window.fixture));
      await page.evaluate(
        (created) => window.fixture.attach(created),
        response.json(),
      );
      await page.waitForFunction(() => window.fixture.snapshot?.canReadImage);
      assert.equal(
        await page.evaluate(() => typeof window.fixture.text),
        'undefined',
      );
      assert.equal(
        await page.evaluate(() =>
          window.fixture.accept('sha256:' + 'a'.repeat(64)),
        ),
        false,
      );
      await page.evaluate(() => window.fixture.press(['F8']));
      await eventually(() => inputs.length === 2);
      await page.evaluate(() => window.fixture.press(['ControlLeft', 'KeyV']));
      await eventually(() => inputs.length === 6);
      assert.deepEqual(
        inputs.map((event) => [event.scancode, event.down]),
        [
          [66, true],
          [66, false],
          [29, true],
          [47, true],
          [47, false],
          [29, false],
        ],
      );
      for (const codes of [
        ['MetaLeft'],
        ['KeyL'],
        ['ControlLeft', 'KeyL'],
        ['F8', 'F9'],
        [],
      ])
        await assert.rejects(
          page.evaluate((codes) => window.fixture.press(codes), codes),
        );
      assert.equal(inputs.length, 6);
      for (let n = 0; n < 3; n++)
        assert.equal(await page.evaluate(() => window.fixture.receipt()), 'X');
      await assert.rejects(page.evaluate(() => window.fixture.receipt()));
      assert.equal(textReads, 3);
      await page.locator('[data-image-clipboard=read]').click();
      await page.waitForFunction(
        () =>
          document.querySelector('[data-image-clipboard-received]').width === 2,
      );
      assert.equal(worker.reads, 1);
      assert.equal(await page.evaluate(() => window.osCalls), 0);
      assert.equal(await page.evaluate(() => window.fixture.failures), 0);
      await page.evaluate(() => window.fixture.press(['F5']));
      await eventually(() => inputs.length === 8);
      assert.deepEqual(
        inputs.slice(-2).map((event) => [event.scancode, event.down]),
        [
          [63, true],
          [63, false],
        ],
      );
      await page.evaluate(() => window.fixture.dispose());
      // This fixture only reads: it never dirties a local native offer.
      assert.equal(worker.revokes, 0);
      assert.equal(
        await page
          .locator('[data-image-clipboard-received]')
          .evaluate((canvas) => canvas.width),
        0,
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await server.close();
      assert.equal(worker.revokes, 0);
      worker.image.rgba.fill(0);
      worker.written?.rgba.fill(0);
      for (const result of worker.returned) result.rgba.fill(0);
    }
  },
);
