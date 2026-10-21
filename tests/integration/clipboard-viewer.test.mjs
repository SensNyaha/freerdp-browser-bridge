import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Writable } from 'node:stream';
import { randomInt, createHash } from 'node:crypto';
import { chromium } from 'playwright-core';
import { createSessionServer } from '../../apps/bridge-api/dist/session-server.js';
import { FakeSessionWorker, eventually } from '../fixtures/session-worker.mjs';
import { listenBrowserLoopback } from '../fixtures/browser-port.mjs';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

class ClipboardViewerWorker extends FakeSessionWorker {
  source = {
    ready: true,
    generation: 1n,
    revision: 1n,
    maximum: 1048576,
    toServer: true,
    fromServer: true,
    remoteText: true,
    localAccepted: false,
    localPending: false,
    remotePending: false,
  };
  reads = 0;
  writes = 0;
  revokes = 0;
  inputs = 0;
  inputResets = 0;
  text = Buffer.from('\ufeffsynthetic remote Ж😀\n'.repeat(6000));
  onClipboard(listener) {
    this.on('clipboard', listener);
    return () => this.off('clipboard', listener);
  }
  publish(patch = {}) {
    Object.assign(this.source, patch);
    this.emit('clipboard', this.source);
  }
  async start(config, signal) {
    await super.start(config, signal);
    this.publish({
      toServer: config.clipboard.mode !== 'server-to-browser',
      fromServer: config.clipboard.mode !== 'browser-to-server',
      remoteText: config.clipboard.mode !== 'browser-to-server',
    });
  }
  async readClipboardText() {
    ++this.reads;
    this.returned = Buffer.from(this.text);
    return { status: 'accepted', text: this.returned };
  }
  writeClipboardText(bytes) {
    ++this.writes;
    this.written = Buffer.from(bytes);
    this.publish({ localAccepted: true });
    return Promise.resolve('accepted');
  }
  async revokeClipboardText() {
    ++this.revokes;
    this.publish({ localAccepted: false });
    return 'accepted';
  }
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
  async sendInput(event) {
    if (event.type === 'reset') ++this.inputResets;
    else ++this.inputs;
  }
  async resetInput() {}
}

for (const mode of ['bidirectional', 'server-to-browser', 'browser-to-server'])
  test(
    `Edge reference clipboard / actual WS / fake RDP: ${mode} explicit actions and retirement`,
    { skip: process.platform !== 'win32', timeout: 35000 },
    async () => {
      const worker = new ClipboardViewerWorker(),
        ports = Array.from({ length: 8 }, () => randomInt(49152, 65536));
      worker.source.localPending = mode === 'browser-to-server';
      const server = await createSessionServer({
        worker: {
          workerPath: resolve(
            process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/bundled',
            'rdp-worker.exe',
          ),
          runtimeRoot: resolve('.runtime/clipboard-viewer-fixture'),
        },
        authenticate: () => ({ id: 'synthetic-clipboard-viewer' }),
        allowedOrigins: ports.map((port) => 'http://127.0.0.1:' + port),
        sessions: { workerFactory: () => worker },
        logDestination: new Writable({
          write(_bytes, _encoding, done) {
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
      let browser,
        sessionId,
        portIndex = 0;
      try {
        const port = await listenBrowserLoopback(
          (port) => server.listen({ host: '127.0.0.1', port }),
          () => ports[portIndex++],
        );
        browser = await chromium.launch({ channel: 'msedge', headless: true });
        const page = await browser.newPage();
        page.setDefaultTimeout(7000);
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.addInitScript(() => {
          window.localReads = 0;
          window.localWrites = 0;
          window.localMode = 'normal';
          window.localText = '';
          Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
              readText() {
                ++window.localReads;
                if (window.localMode === 'denied')
                  return Promise.reject(new Error('synthetic hidden denial'));
                if (window.localMode === 'pending')
                  return new Promise((resolve) => {
                    window.releaseClipboard = resolve;
                  });
                return Promise.resolve(window.localText);
              },
              writeText(text) {
                ++window.localWrites;
                window.copiedText = text;
                return Promise.resolve();
              },
            },
          });
        });
        await page.goto('http://127.0.0.1:' + port + '/harness/');
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
            target: { host: 'synthetic' },
            auth: {},
            clipboard: { mode, text: true, maxItemBytes: 1048576 },
          },
        });
        assert.equal(response.statusCode, 202);
        const created = response.json();
        sessionId = created.sessionId;
        await page.evaluate(
          (created) =>
            window.bridgeViewer.attach(created, { codecs: ['jpeg'] }),
          created,
        );
        await page.waitForFunction(
          () => window.bridgeViewer.stats.frames === 1,
        );
        await eventually(() => worker.inputResets === 1);
        assert.equal(worker.inputs, 0);
        const send = page.locator('[data-clipboard=send]'),
          read = page.locator('[data-clipboard=read]'),
          paste = page.locator('[data-clipboard=paste]'),
          copy = page.locator('[data-clipboard=copy]'),
          clear = page.locator('[data-clipboard=clear]');
        const draft = page.locator('[data-clipboard-draft]'),
          received = page.locator('[data-clipboard-received]');
        if (mode === 'browser-to-server') {
          assert.equal(await send.isDisabled(), true);
          assert.equal(worker.writes, 0);
          worker.publish({ localPending: false });
        }
        await page.waitForFunction(
          (direction) =>
            !document.querySelector(
              '[data-clipboard=' +
                (direction === 'server-to-browser' ? 'read' : 'send') +
                ']',
            )?.disabled,
          mode,
        );
        assert.equal(await send.isDisabled(), mode === 'server-to-browser');
        assert.equal(await read.isDisabled(), mode === 'browser-to-server');
        assert.equal(
          await page.evaluate(() => window.localReads + window.localWrites),
          0,
        );
        assert.equal(worker.reads + worker.writes, 0);
        if (mode !== 'server-to-browser') {
          const text = '\ufeff界😀\n'.repeat(10000);
          await page.evaluate((text) => {
            window.localText = text;
          }, text);
          await paste.click();
          await page.waitForFunction(
            () =>
              document.querySelector('[data-clipboard-draft]').value.length >
              10000,
          );
          assert.equal(worker.writes, 0);
          await send.click();
          await eventually(() => worker.writes === 1);
          await page.waitForFunction(
            () => !document.querySelector('[data-clipboard=send]').disabled,
          );
          assert.equal(hash(worker.written), hash(Buffer.from(text)));
          assert.equal(await draft.inputValue(), '');
          await page.click('#desktop');
          await page.keyboard.press('a');
          await eventually(() => worker.inputs > 0);
          await page.evaluate(() => {
            window.localMode = 'denied';
          });
          await paste.click();
          await page.waitForFunction(() =>
            document
              .querySelector('#clipboard-text [role=status]')
              .textContent.includes('отказал'),
          );
          assert.equal(await draft.inputValue(), '');
          assert.equal(worker.writes, 1);
          await page.evaluate(() => {
            window.localMode = 'pending';
          });
          await paste.click();
          await clear.click();
          await page.evaluate(() =>
            window.releaseClipboard('discarded late synthetic text'),
          );
          await page.evaluate(() => Promise.resolve());
          assert.equal(await draft.inputValue(), '');
          await paste.click();
          await page.waitForFunction(() =>
            document
              .querySelector('#clipboard-text [role=status]')
              .textContent.includes('Ожидание разрешения завершено'),
          );
          await page.evaluate(() =>
            window.releaseClipboard('discarded expired synthetic text'),
          );
          assert.equal(await draft.inputValue(), '');
        }
        if (mode !== 'browser-to-server') {
          await read.click();
          await page.waitForFunction(
            () =>
              document.querySelector('[data-clipboard-received]').value.length >
              10000,
          );
          assert.equal(await received.inputValue(), worker.text.toString());
          assert.equal(await page.evaluate(() => window.localWrites), 0);
          await copy.click();
          await page.waitForFunction(() => window.localWrites === 1);
          assert.equal(
            await page.evaluate(() => window.copiedText),
            worker.text.toString(),
          );
          assert.ok(worker.returned.every((byte) => !byte));
          if (mode === 'bidirectional')
            await page.locator('#clipboard-text').screenshot({
              path: resolve('build/iteration-238-clipboard-panel.png'),
            });
          worker.text.fill(0);
          worker.text = Buffer.alloc(0);
          await read.click();
          await page.waitForFunction(
            () =>
              document.querySelector('[data-clipboard-received]').value ===
                '' && !document.querySelector('[data-clipboard=copy]').disabled,
          );
          await copy.click();
          await page.waitForFunction(() => window.localWrites === 2);
          assert.equal(await page.evaluate(() => window.copiedText), '');
        }
        if (mode !== 'server-to-browser') {
          await paste.click();
          await page.waitForFunction(() => Boolean(window.releaseClipboard));
        }
        await page.evaluate(() => window.bridgeViewer.detach());
        if (mode !== 'server-to-browser')
          await page.evaluate(() =>
            window.releaseClipboard('discarded after detach'),
          );
        assert.equal(await draft.inputValue(), '');
        assert.equal(await received.inputValue(), '');
        assert.equal(await send.isDisabled(), true);
        await eventually(
          () => worker.revokes === (mode === 'server-to-browser' ? 0 : 1),
        );
        assert.equal(
          (
            await server.inject({
              method: 'GET',
              url: '/v1/sessions/' + sessionId,
            })
          ).json().state,
          'connected',
        );
        assert.deepEqual(errors, []);
      } finally {
        await browser?.close();
        await server.close();
        worker.text.fill(0);
        worker.written?.fill(0);
        worker.returned?.fill(0);
      }
    },
  );
