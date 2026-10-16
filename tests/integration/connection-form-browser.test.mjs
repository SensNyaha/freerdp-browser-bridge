import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { validateSessionConfig } from '../../packages/config/dist/index.js';

test(
  'Edge manual form / HTTP fixture: schema, auth refusal, secret clearing, disconnect and late-create cancellation',
  { skip: process.platform !== 'win32', timeout: 30000 },
  async () => {
    const files = new Map();
    for (const name of [
      'index.html',
      'session-form.js',
      'connection-config.js',
      'connection-owner.js',
    ])
      files.set(
        '/harness/' + (name === 'index.html' ? '' : name),
        await readFile(resolve('apps/reference-harness', name)),
      );
    files.set(
      '/harness/viewer.js',
      Buffer.from(
        `window.fixtureAttachments=[];window.bridgeViewer={attach:(a,o)=>window.fixtureAttachments.push({id:a.sessionId,options:o}),detach:()=>{}};`,
      ),
    );
    let creates = 0,
      deletes = 0,
      delayCreate = false,
      releaseCreate;
    let payload;
    const server = createServer(async (req, res) => {
      if (files.has(req.url)) {
        res.setHeader(
          'content-type',
          req.url.endsWith('.js') ? 'text/javascript' : 'text/html',
        );
        res.end(files.get(req.url));
        return;
      }
      res.setHeader('content-type', 'application/json');
      if (req.url === '/v1/capabilities') {
        res.end(
          JSON.stringify({
            connectCore: true,
            jpegCapture: true,
            h264Capture: false,
            displayControl: true,
            clipboardText: true,
            clipboardRevoke: true,
          }),
        );
        return;
      }
      if (req.headers.authorization !== 'Bearer synthetic-form-fixture') {
        res.writeHead(401);
        res.end('{}');
        return;
      }
      if (req.method === 'POST' && req.url === '/v1/sessions') {
        let bytes = '';
        for await (const chunk of req) {
          bytes += chunk;
          if (bytes.length > 8192) {
            req.destroy();
            return;
          }
        }
        payload = validateSessionConfig(JSON.parse(bytes));
        creates++;
        if (delayCreate)
          await new Promise((done) => {
            releaseCreate = done;
          });
        res.end(
          JSON.stringify({
            sessionId: (creates === 1 ? 'a' : 'b').repeat(32),
            attach: {},
          }),
        );
        return;
      }
      if (
        req.method === 'DELETE' &&
        /^\/v1\/sessions\/[ab]{32}$/.test(req.url)
      ) {
        deletes++;
        res.end('{}');
        return;
      }
      res.writeHead(404);
      res.end('{}');
    });
    let browser;
    try {
      await new Promise((done) => server.listen(0, '127.0.0.1', done));
      browser = await chromium.launch({ channel: 'msedge', headless: true });
      const page = await browser.newPage({
        viewport: { width: 1280, height: 1100 },
      });
      page.setDefaultTimeout(5000);
      await page.goto(
        'http://127.0.0.1:' + server.address().port + '/harness/',
      );
      await page.waitForFunction(
        () =>
          window.bridgeConnection &&
          !document.querySelector('#connect-session').disabled,
      );
      assert.equal(await page.locator('[name=video]').inputValue(), 'jpeg');
      assert.equal(await page.locator('[name=clipboard]').inputValue(), 'off');
      await page.locator('details:has([name=clipboard]) > summary').click();
      await page.locator('[name=clipboard]').selectOption('bidirectional');
      await page.locator('[name=clipboardMax]').fill('65536');
      assert.equal(
        await page.locator('[name=certificatePolicy]').inputValue(),
        'strict',
      );
      assert.equal(
        await page
          .locator('[name=audio] option[value=opus]')
          .evaluate((option) => option.disabled),
        true,
      );
      await page.locator('[name=host]').fill('rdp.example.test');
      await page.locator('[name=username]').fill('test-user');
      await page.locator('[name=password]').fill('synthetic-form-password');
      await page.click('#connect-session');
      await page.waitForFunction(() =>
        document
          .querySelector('#connection-status')
          .textContent.includes('выполните вход'),
      );
      assert.equal(await page.locator('[name=password]').inputValue(), '');
      assert.equal(creates, 0);
      await page.evaluate(() =>
        window.bridgeConnection.configure({
          authorize: () => ({ authorization: 'Bearer synthetic-form-fixture' }),
        }),
      );
      await page.locator('[name=password]').fill('synthetic-form-password');
      await page.click('#connect-session');
      await page.waitForFunction(() => window.fixtureAttachments.length === 1);
      assert.equal(payload.auth.password, 'synthetic-form-password');
      assert.equal(payload.media.videoCodec, undefined);
      assert.equal(payload.target.port, 3389);
      assert.deepEqual(payload.clipboard, {
        mode: 'bidirectional',
        text: true,
        maxItemBytes: 65536,
      });
      assert.equal(await page.locator('[name=password]').inputValue(), '');
      await page.click('#disconnect-session');
      await page.waitForFunction(
        () =>
          !window.bridgeConnection.state.pending &&
          !window.bridgeConnection.state.connected,
      );
      assert.equal(deletes, 1);
      await page.locator('[name=clipboardMax]').fill('');
      await page.locator('[name=clipboard]').selectOption('off');
      assert.equal(
        await page.locator('[name=clipboardMax]').isDisabled(),
        true,
      );
      delayCreate = true;
      await page.locator('[name=password]').fill('synthetic-form-password');
      await page.click('#connect-session');
      for (let i = 0; !releaseCreate && i < 100; i++)
        await new Promise((done) => setTimeout(done, 10));
      assert.equal(typeof releaseCreate, 'function');
      assert.equal(payload.clipboard, undefined);
      await page.click('#disconnect-session');
      releaseCreate();
      await page.waitForFunction(
        () =>
          !window.bridgeConnection.state.pending &&
          !window.bridgeConnection.state.connected,
      );
      assert.equal(deletes, 2);
      assert.equal(creates, 2);
      assert.equal(
        await page.evaluate(() => window.fixtureAttachments.length),
        1,
      );
      assert.equal(
        await page.evaluate(() => localStorage.length + sessionStorage.length),
        0,
      );
      await mkdir(resolve('build'), { recursive: true });
      await page.screenshot({ path: resolve('build/iteration-204-form.png') });
    } finally {
      releaseCreate?.();
      await browser?.close();
      await new Promise((done) => {
        server.close(done);
        server.closeAllConnections();
      });
    }
  },
);
