import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { listenBrowserHttp } from '../fixtures/browser-port.mjs';

test(
  'Edge image view: bounded large previews and clear/source/dispose wipe owned and late RGBA without OS/RDP',
  { skip: process.platform !== 'win32', timeout: 25000 },
  async () => {
    const assets = new Map();
    for (const name of [
      'clipboard-image-view.js',
      'clipboard-image.js',
      'clipboard-image-conversion.js',
      'clipboard-image-worker.js',
    ])
      assets.set('/' + name, await readFile('apps/reference-harness/' + name));
    const index = await readFile('apps/reference-harness/index.html', 'utf8'),
      panel = index.slice(
        index.indexOf('<section id="clipboard-image"'),
        index.indexOf('<section id="clipboard-html"'),
      );
    const server = createServer((request, response) => {
      if (request.url === '/') {
        response.setHeader('content-type', 'text/html');
        response.end('<!doctype html><meta charset="utf-8">' + panel);
      } else {
        response.statusCode = assets.has(request.url) ? 200 : 404;
        response.setHeader('content-type', 'text/javascript');
        response.end(assets.get(request.url) ?? '');
      }
    });
    let browser;
    try {
      const port = await listenBrowserHttp(server);
      browser = await chromium.launch({ channel: 'msedge', headless: true });
      const page = await browser.newPage(),
        errors = [];
      page.setDefaultTimeout(5000);
      page.on('pageerror', () => errors.push('pageerror'));
      await page.goto('http://127.0.0.1:' + port);
      await page.evaluate(async () => {
        window.osCalls = 0;
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: {
            read() {
              ++window.osCalls;
              throw new Error('Unexpected OS read');
            },
            write() {
              ++window.osCalls;
              throw new Error('Unexpected OS write');
            },
          },
        });
        const { installClipboardImageView } = await import(
          '/clipboard-image-view.js'
        );
        window.state = {
          available: true,
          image: true,
          busy: false,
          toServer: false,
          canReadImage: true,
          maximum: 4194304,
        };
        window.readMode = 'normal';
        window.client = {
          get snapshot() {
            return window.state;
          },
          readImage() {
            if (window.readMode === 'pending')
              return new Promise((resolve) => {
                window.releaseRead = resolve;
              });
            return Promise.resolve({ status: 'accepted', item: window.owned });
          },
        };
        window.install = () =>
          installClipboardImageView(
            document.querySelector('#clipboard-image'),
            window.client,
          );
        window.view = window.install();
      });
      for (const [width, height, previewWidth, previewHeight] of [
        [1000, 100, 320, 32],
        [1000, 1000, 240, 240],
      ]) {
        await page.evaluate(
          ({ width, height }) => {
            const rgba = new Uint8Array(width * height * 4);
            for (let y = 0; y < height; y++)
              for (let x = 0; x < width; x++)
                rgba.set([x % 256, y % 256, 17, 255], (y * width + x) * 4);
            window.owned = { width, height, rgba };
          },
          { width, height },
        );
        await page.locator('[data-image-clipboard=read]').click();
        await page.waitForFunction(
          () =>
            document.querySelector('[data-image-clipboard-received]').width > 0,
        );
        const observed = await page
          .locator('[data-image-clipboard-received]')
          .evaluate((canvas) => {
            const ctx = canvas.getContext('2d'),
              first = ctx.getImageData(0, 0, 1, 1).data,
              last = ctx.getImageData(
                canvas.width - 1,
                canvas.height - 1,
                1,
                1,
              ).data;
            return {
              width: canvas.width,
              height: canvas.height,
              first: Array.from(first),
              last: Array.from(last),
            };
          });
        assert.deepEqual(observed, {
          width: previewWidth,
          height: previewHeight,
          first: [
            Math.floor((0.5 * width) / previewWidth) % 256,
            Math.floor((0.5 * height) / previewHeight) % 256,
            17,
            255,
          ],
          last: [
            Math.floor(((previewWidth - 0.5) * width) / previewWidth) % 256,
            Math.floor(((previewHeight - 0.5) * height) / previewHeight) % 256,
            17,
            255,
          ],
        });
        await page.locator('[data-image-clipboard=clear]').click();
        assert.equal(
          await page.evaluate(() => window.owned.rgba.every((v) => !v)),
          true,
        );
        assert.equal(
          await page
            .locator('[data-image-clipboard-received]')
            .evaluate((canvas) => canvas.width + canvas.height),
          0,
        );
      }
      for (const loss of ['clear', 'source', 'dispose']) {
        await page.evaluate(() => {
          window.readMode = 'pending';
          window.releaseRead = undefined;
        });
        await page.locator('[data-image-clipboard=read]').click();
        await page.waitForFunction(() => Boolean(window.releaseRead));
        if (loss === 'clear')
          await page.locator('[data-image-clipboard=clear]').click();
        else
          await page.evaluate((loss) => {
            if (loss === 'dispose') window.view.dispose();
            else {
              window.state.available = false;
              window.view.changed();
            }
          }, loss);
        await page.evaluate(() => {
          window.late = {
            width: 1,
            height: 1,
            rgba: new Uint8Array([1, 2, 3, 255]),
          };
          window.releaseRead({ status: 'accepted', item: window.late });
        });
        await page.waitForFunction(() => window.late.rgba.every((v) => !v));
        assert.equal(
          await page
            .locator('[data-image-clipboard-received]')
            .evaluate((canvas) => canvas.width),
          0,
        );
        if (loss === 'source')
          await page.evaluate(() => {
            window.state.available = true;
            window.view.changed();
          });
      }
      assert.equal(await page.evaluate(() => window.osCalls), 0);
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
