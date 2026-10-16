import { listenBrowserHttp } from '../fixtures/browser-port.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { encodeCursorShape } from '../../packages/protocol/dist/index.js';
import { cursorState } from '../fixtures/cursor.mjs';

test(
  'Edge cursor fixture: local motion, scaled hotspot, RGBA alpha, visibility, bad records and detach cleanup',
  // Includes graceful Windows browser-process cleanup, separate from API/transport deadlines.
  { skip: process.platform !== 'win32', timeout: 45000 },
  async (context) => {
    const module = await readFile('apps/reference-harness/cursor.js');
    const server = createServer((request, response) => {
      response.setHeader(
        'Content-Type',
        request.url === '/cursor.js' ? 'text/javascript' : 'text/html',
      );
      response.end(
        request.url === '/cursor.js'
          ? module
          : '<canvas id="desktop" width="640" height="480" style="width:320px;height:240px"></canvas>',
      );
    });
    await listenBrowserHttp(server);
    let browser, page;
    let phase = 'launch';
    const aborted = () =>
      context.diagnostic('Cursor fixture timeout phase: ' + phase);
    context.signal.addEventListener('abort', aborted, { once: true });
    try {
      browser = await chromium.launch({
        channel: 'msedge',
        headless: true,
        timeout: 5000,
      });
      phase = 'page';
      page = await browser.newPage();
      page.setDefaultTimeout(3000);
      page.setDefaultNavigationTimeout(5000);
      phase = 'navigation';
      await page.goto('http://127.0.0.1:' + server.address().port);
      phase = 'overlay';
      await page.evaluate(async () => {
        const { installCursor } = await import('/cursor.js');
        window.cursor = installCursor(document.querySelector('#desktop'));
      });
      const record = Array.from(encodeCursorShape(cursorState(), 0));
      await page.evaluate((bytes) => {
        window.cursor.visibility({
          visible: true,
          default: false,
          shapeId: '7',
        });
        window.cursor.shape(new Uint8Array(bytes).buffer);
      }, record);
      const bounds = await page.locator('#desktop').boundingBox();
      await page.mouse.move(bounds.x + 100, bounds.y + 50);
      const overlay = await page.locator('#cursor-overlay').boundingBox();
      assert.equal(overlay.width, 1);
      assert.equal(overlay.height, 1);
      assert.equal(overlay.x, bounds.x + 99.5);
      assert.equal(overlay.y, bounds.y + 49.5);
      await page.evaluate(() => {
        const desktop = document.querySelector('#desktop');
        desktop.width = 320;
        desktop.height = 240;
        window.cursor.displayReset();
      });
      const resized = await page.locator('#cursor-overlay').boundingBox();
      assert.equal(resized.x, bounds.x + 99);
      assert.equal(resized.y, bounds.y + 49);
      assert.equal(resized.width, 2);
      await page.evaluate(() => {
        const desktop = document.querySelector('#desktop');
        desktop.width = 640;
        desktop.height = 480;
        window.cursor.displayReset();
      });
      assert.deepEqual(
        await page.evaluate(() =>
          Array.from(
            document
              .querySelector('#cursor-overlay')
              .getContext('2d')
              .getImageData(0, 0, 2, 2).data,
          ),
        ),
        [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0],
      );
      await page.evaluate(() =>
        window.cursor.visibility({
          visible: false,
          default: false,
          shapeId: '7',
        }),
      );
      assert.equal(await page.locator('#cursor-overlay').isVisible(), false);
      await page.evaluate(() =>
        window.cursor.visibility({
          visible: true,
          default: false,
          shapeId: '7',
        }),
      );
      assert.equal(await page.locator('#cursor-overlay').isVisible(), true);
      assert.equal(
        await page.evaluate((bytes) => {
          try {
            window.cursor.shape(new Uint8Array(bytes).buffer);
            return false;
          } catch {
            return true;
          }
        }, record),
        true,
      );
      await page.evaluate(() =>
        window.cursor.visibility({
          visible: true,
          default: true,
          shapeId: '0',
        }),
      );
      assert.equal(
        await page
          .locator('#desktop')
          .evaluate((canvas) => canvas.style.cursor),
        'default',
      );
      await page.evaluate(() => window.cursor.dispose());
      assert.equal(await page.locator('#cursor-overlay').count(), 0);
      assert.equal(
        await page
          .locator('#desktop')
          .evaluate((canvas) => canvas.style.cursor),
        '',
      );
    } catch (error) {
      context.diagnostic('Cursor fixture phase: ' + phase);
      throw error;
    } finally {
      phase = 'page-close';
      await page?.close();
      server.closeAllConnections();
      phase = 'browser-close';
      await browser?.close();
      phase = 'server-close';
      await new Promise((resolve) => server.close(resolve));
      context.signal.removeEventListener('abort', aborted);
    }
  },
);
