import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomInt } from 'node:crypto';
import { resolve } from 'node:path';
import { Writable } from 'node:stream';
import { chromium } from 'playwright-core';
import { createSessionServer } from '../../apps/bridge-api/dist/session-server.js';
import { HtmlSessionWorker } from '../fixtures/html-session-worker.mjs';
import { eventually } from '../fixtures/session-worker.mjs';
import { listenBrowserLoopback } from '../fixtures/browser-port.mjs';

class HtmlViewerWorker extends HtmlSessionWorker {
  async resetInput() {}
  async sendInput() {}
  htmlBody = Buffer.from(
    '<table><tr><td><b>selected \u0416\ud83d\ude00</b></td></tr><tr><td>unselected private sibling</td></tr></table>',
  );
  plain = Buffer.from('selected \u0416\ud83d\ude00');
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
  async readClipboardHtml(revision) {
    const result = await super.readClipboardHtml(revision),
      start = this.htmlBody.indexOf('<b>') + 3;
    Object.assign(result.item, {
      context: true,
      selection: true,
      fragmentOffset: start - 3,
      fragmentBytes: this.plain.length + 7,
      selectionOffset: start,
      selectionBytes: this.plain.length,
    });
    return result;
  }
}

for (const mode of ['bidirectional', 'server-to-browser', 'browser-to-server'])
  test(
    `Edge HTML reference viewer / actual WS / fake RDP: ${mode} explicit ClipboardItem and cleanup`,
    { skip: process.platform !== 'win32', timeout: 40000 },
    async () => {
      const worker = new HtmlViewerWorker(),
        ports = Array.from({ length: 8 }, () => randomInt(49152, 65536));
      const server = await createSessionServer({
        worker: {
          workerPath: resolve(
            process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/bundled',
            'rdp-worker.exe',
          ),
          runtimeRoot: resolve('.runtime/html-viewer-fixture'),
        },
        authenticate: () => ({ id: 'synthetic-rich-viewer' }),
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
              .type(name.endsWith('.js') ? 'text/javascript' : 'text/html')
              .send(bytes),
        );
      }
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
          window.richReads =
            window.richWrites =
            window.plainReads =
            window.typeReads =
            window.arrayReads =
              0;
          window.richMode = 'normal';
          window.activations = [];
          window.richHtml =
            '<p><strong>local \u754c\ud83d\ude00</strong></p>'.repeat(2000);
          window.richText = 'local \u754c\ud83d\ude00\n'.repeat(2000);
          window.richItem = () => ({
            types:
              window.richMode === 'html-only'
                ? ['text/html']
                : ['text/html', 'text/plain'],
            getType(type) {
              ++window.typeReads;
              if (window.richMode === 'pending-type')
                return new Promise((resolve) => {
                  window.releaseType = resolve;
                });
              const blob = new Blob(
                [
                  type === 'text/html'
                    ? window.richMode === 'oversize'
                      ? 'A'.repeat(1048577)
                      : window.richHtml
                    : window.richText,
                ],
                { type },
              );
              const original = blob.arrayBuffer.bind(blob);
              blob.arrayBuffer = () => {
                ++window.arrayReads;
                if (window.richMode === 'pending-array')
                  return new Promise((resolve) => {
                    window.releaseArray = resolve;
                  });
                return original();
              };
              return Promise.resolve(blob);
            },
          });
          Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
              read() {
                ++window.richReads;
                window.activations.push(navigator.userActivation.isActive);
                if (window.richMode === 'denied')
                  return Promise.reject(new Error('private denial'));
                if (window.richMode === 'pending-read')
                  return new Promise((resolve) => {
                    window.releaseRead = resolve;
                  });
                return Promise.resolve([window.richItem()]);
              },
              write(items) {
                ++window.richWrites;
                window.activations.push(navigator.userActivation.isActive);
                window.copiedRich = Promise.all(
                  items[0].types.map(async (type) => [
                    type,
                    await (await items[0].getType(type)).text(),
                  ]),
                ).then(Object.fromEntries);
                return Promise.resolve();
              },
              readText() {
                ++window.plainReads;
                return Promise.resolve('plain fixture');
              },
              writeText() {
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
            clipboard: { mode, html: true, maxItemBytes: 1048576 },
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
            !document.querySelector('#clipboard-html').hidden,
        );
        const button = (name) =>
            page.locator('[data-html-clipboard=' + name + ']'),
          draft = page.locator('[data-html-clipboard-draft]'),
          received = page.locator('[data-html-clipboard-received]');
        assert.equal(
          await page.evaluate(() => window.richReads + window.richWrites),
          0,
        );
        assert.equal(worker.reads + worker.writes, 0);
        const diagnostics = await page.evaluate(() => ({
          secure: isSecureContext,
          read: typeof navigator.clipboard?.read,
          htmlStatus: document.querySelector('#clipboard-html [role=status]')
            .textContent,
          buttons: Array.from(
            document.querySelectorAll('[data-html-clipboard]'),
            (button) => [button.dataset.htmlClipboard, button.disabled],
          ),
          ancestors: (() => {
            const out = [];
            for (
              let node = document.querySelector('[data-html-clipboard=paste]');
              node;
              node = node.parentElement
            )
              out.push([
                node.tagName,
                node.id,
                node.disabled,
                node.getAttribute('aria-disabled'),
              ]);
            return out;
          })(),
        }));
        assert.equal(
          await button('paste').isDisabled(),
          mode === 'server-to-browser',
          JSON.stringify(diagnostics),
        );
        assert.equal(
          await button('read').isDisabled(),
          mode === 'browser-to-server',
          JSON.stringify(diagnostics),
        );
        if (mode !== 'server-to-browser') {
          await button('paste').click();
          await page.waitForFunction(
            () =>
              document.querySelector('[data-html-clipboard-draft]').value
                .length > 10000,
          );
          assert.equal(worker.writes, 0);
          await button('send').click();
          await eventually(() => worker.writes === 1);
          await page.waitForFunction(
            () =>
              !document.querySelector('[data-html-clipboard=paste]').disabled,
          );
          assert.equal(
            worker.written.body.toString(),
            await page.evaluate(() => window.richHtml),
          );
          assert.equal(
            worker.written.text.toString(),
            await page.evaluate(() => window.richText),
          );
          assert.equal(await draft.inputValue(), '');
          await page.evaluate(() => {
            window.richMode = 'denied';
          });
          await button('paste').click();
          await page.waitForFunction(() =>
            document
              .querySelector('#clipboard-html [role=status]')
              .textContent.includes('отказал'),
          );
          assert.equal(await draft.inputValue(), '');
        }
        if (mode !== 'browser-to-server') {
          await button('read').click();
          await page.waitForFunction(() =>
            document
              .querySelector('[data-html-clipboard-received]')
              .value.includes('selected'),
          );
          const html = await received.inputValue();
          assert.equal(
            html,
            '<table><tbody><tr><td><b>' +
              worker.plain.toString() +
              '</b></td></tr></tbody></table>',
          );
          assert.equal(html.includes('unselected'), false);
          assert.equal(await page.locator('#clipboard-html table').count(), 0);
          assert.equal(await page.evaluate(() => window.richWrites), 0);
          await button('copy').click();
          const copied = await page.evaluate(() => window.copiedRich);
          assert.equal(copied['text/html'], html);
          assert.equal(copied['text/plain'], worker.plain.toString());
          assert.ok(worker.returned[0].body.every((byte) => !byte));
          assert.ok(worker.returned[0].text.every((byte) => !byte));
        }
        if (mode === 'bidirectional') {
          await button('clear').click();
          await page.evaluate(() => {
            window.richMode = 'oversize';
          });
          const beforeArrays = await page.evaluate(() => window.arrayReads);
          await button('paste').click();
          await page.waitForFunction(() =>
            document
              .querySelector('#clipboard-html [role=status]')
              .textContent.includes('превышает лимит'),
          );
          assert.equal(
            await page.evaluate(() => window.arrayReads),
            beforeArrays,
          );
          await page.evaluate(() => {
            window.richMode = 'html-only';
          });
          await button('paste').click();
          await page.waitForFunction(
            () =>
              document.querySelector('[data-html-clipboard-draft]').value
                .length > 10000,
          );
          assert.equal(
            await page.locator('[data-html-clipboard-draft-text]').isHidden(),
            true,
          );
          await button('clear').click();
          await page.evaluate(() => {
            window.richMode = 'normal';
            window.richText = '';
          });
          await button('paste').click();
          await page.waitForFunction(
            () =>
              document.querySelector('[data-html-clipboard-draft]').value
                .length > 10000,
          );
          assert.equal(
            await page.locator('[data-html-clipboard-draft-text]').isVisible(),
            true,
          );
          assert.equal(
            await page.locator('[data-html-clipboard-draft-text]').inputValue(),
            '',
          );
          await button('clear').click();
          await page.evaluate(() => {
            window.richMode = 'pending-read';
          });
          await button('paste').click();
          assert.equal(
            await page.locator('[data-clipboard=paste]').isDisabled(),
            true,
          );
          const typeReads = await page.evaluate(() => window.typeReads);
          await button('clear').click();
          await page.evaluate(() => window.releaseRead([window.richItem()]));
          await page.evaluate(() => Promise.resolve());
          assert.equal(await draft.inputValue(), '');
          assert.equal(await page.evaluate(() => window.typeReads), typeReads);
          await button('paste').click();
          await page.waitForFunction(() =>
            document
              .querySelector('#clipboard-html [role=status]')
              .textContent.includes('Ожидание разрешения завершено'),
          );
          await page.evaluate(() => window.releaseRead([window.richItem()]));
          assert.equal(await draft.inputValue(), '');
          await page.evaluate(() => {
            window.richMode = 'pending-type';
          });
          await button('paste').click();
          await page.waitForFunction(() => Boolean(window.releaseType));
          await button('clear').click();
          const arrays = await page.evaluate(() => window.arrayReads);
          await page.evaluate(() =>
            window.releaseType(new Blob(['late HTML'], { type: 'text/html' })),
          );
          await page.evaluate(() => Promise.resolve());
          assert.equal(await page.evaluate(() => window.arrayReads), arrays);
          await page.evaluate(() => {
            window.richMode = 'pending-array';
          });
          await button('paste').click();
          await page.waitForFunction(() => Boolean(window.releaseArray));
          await button('clear').click();
          await page.evaluate(() => {
            window.lateBytes = new TextEncoder().encode('<b>late</b>');
            window.releaseArray(window.lateBytes.buffer);
          });
          await page.waitForFunction(() =>
            window.lateBytes.every((byte) => !byte),
          );
          assert.equal(await draft.inputValue(), '');
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
              !document.querySelector('[data-html-clipboard=read]').disabled,
          );
          assert.equal(await received.inputValue(), '');
          await eventually(() => worker.returned.length === 2);
          assert.ok(worker.returned[1].body.every((byte) => !byte));
        }
        assert.equal(
          await page.evaluate(() => window.activations.every(Boolean)),
          true,
        );
        await page.evaluate(() => window.bridgeViewer.detach());
        await eventually(
          () => worker.revokes === (mode === 'server-to-browser' ? 0 : 1),
        );
        assert.equal(await draft.inputValue(), '');
        assert.equal(await received.inputValue(), '');
        assert.equal(await page.locator('#clipboard-html').isHidden(), true);
        assert.deepEqual(errors, []);
      } finally {
        await browser?.close();
        await server.close();
        worker.htmlBody.fill(0);
        worker.plain.fill(0);
        worker.written?.body.fill(0);
        worker.written?.text?.fill(0);
      }
    },
  );
