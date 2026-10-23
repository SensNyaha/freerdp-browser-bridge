import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { listenBrowserHttp } from '../fixtures/browser-port.mjs';

test(
  'Edge actual Clipboard API denial targets the owned context and reaches the reference UI without a transfer',
  { skip: process.platform !== 'win32', timeout: 20000 },
  async () => {
    const assets = new Map();
    for (const name of ['clipboard-view.js', 'clipboard-text.js'])
      assets.set('/' + name, await readFile('apps/reference-harness/' + name));
    const index = await readFile('apps/reference-harness/index.html', 'utf8');
    const panel = index.slice(
      index.indexOf('<section id="clipboard-text"'),
      index.indexOf('<form id="resize">'),
    );
    const html =
      '<!doctype html><meta charset="utf-8">' +
      panel +
      `<script type="module">
      import {installClipboardView} from '/clipboard-view.js';
      window.transfers=0;
      window.view=installClipboardView(document.querySelector('#clipboard-text'), {
        snapshot:{available:true,busy:false,toServer:true,canSet:true,maximum:1024},
        set(){++window.transfers;throw new Error('Unexpected transfer');},
        read(){++window.transfers;throw new Error('Unexpected transfer');}
      });
    </script>`;
    const server = createServer((request, response) => {
      const bytes = assets.get(request.url);
      response.setHeader(
        'Content-Type',
        bytes ? 'text/javascript' : 'text/html',
      );
      response.end(bytes ?? html);
    });
    let browser;
    try {
      const port = await listenBrowserHttp(server);
      const origin = 'http://127.0.0.1:' + port;
      browser = await chromium.launch({ channel: 'msedge', headless: true });
      const context = await browser.newContext();
      await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
        origin,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      await page.goto(origin);
      await page.waitForFunction(() => Boolean(window.view));
      assert.equal(
        await page.evaluate(
          async () =>
            (await navigator.permissions.query({ name: 'clipboard-read' }))
              .state,
        ),
        'granted',
      );
      const cdp = await browser.newBrowserCDPSession();
      const { browserContextIds } = await cdp.send('Target.getBrowserContexts');
      assert.equal(browserContextIds.length, 1);
      await cdp.send('Browser.setPermission', {
        permission: { name: 'clipboard-read' },
        setting: 'denied',
        origin,
        browserContextId: browserContextIds[0],
      });
      assert.equal(
        await page.evaluate(
          async () =>
            (await navigator.permissions.query({ name: 'clipboard-read' }))
              .state,
        ),
        'denied',
      );
      // Real browser denial happens before clipboard data can be acquired.
      // No Clipboard API override, OS write or remote backend is used here.
      await page.locator('[data-clipboard=paste]').click();
      await page.waitForFunction(
        () =>
          document.querySelector('[role=status]').textContent ===
          'Браузер отказал в доступе к буферу обмена',
      );
      assert.equal(
        await page.locator('[data-clipboard-draft]').inputValue(),
        '',
      );
      assert.equal(await page.evaluate(() => window.transfers), 0);
      assert.equal(
        await page.locator('[data-clipboard=paste]').isEnabled(),
        true,
      );
      await page.evaluate(() => window.view.dispose());
      assert.equal(
        await page.locator('[data-clipboard=paste]').isDisabled(),
        true,
      );
      await cdp.detach();
    } finally {
      await browser?.close();
      await new Promise((done) => server.close(done));
    }
  },
);
