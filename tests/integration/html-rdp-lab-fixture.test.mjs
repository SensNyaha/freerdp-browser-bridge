import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomInt } from 'node:crypto';
import { Writable } from 'node:stream';
import { chromium } from 'playwright-core';
import { createSessionServer } from '../../apps/bridge-api/dist/session-server.js';
import { HtmlSessionWorker } from '../fixtures/html-session-worker.mjs';
import { eventually } from '../fixtures/session-worker.mjs';
import { listenBrowserLoopback } from '../fixtures/browser-port.mjs';
import {
  htmlLabDocument,
  htmlLabUnicode,
  parseHtmlLabReceipt,
} from '../../scripts/html-rdp-lab-fixture.mjs';

test(
  'owned remote HTML application hotkeys and synthetic paste logic, no RDP or OS clipboard',
  { skip: process.platform !== 'win32', timeout: 20000 },
  async () => {
    const nonce = 'd'.repeat(32),
      { uri } = await htmlLabDocument(nonce);
    const browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
    });
    try {
      const page = await browser.newPage(),
        errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(uri);
      await page.keyboard.press('F2');
      const receipt = async () =>
        parseHtmlLabReceipt(await page.locator('#r').inputValue(), nonce);
      assert.equal((await receipt()).source, 0);
      for (const revision of [1, 2]) {
        await page.keyboard.press('F8');
        assert.equal((await receipt()).source, revision);
        assert.ok(
          await page.evaluate(
            (expected) => getSelection().toString().includes(expected),
            'Bridge app ' + revision + ' ' + nonce + htmlLabUnicode,
          ),
        );
        await page.keyboard.press('F2');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'r');
      }
      const plain = 'Bridge browser ' + nonce + htmlLabUnicode;
      const markup =
        '<table><tr><td><b>' +
        plain +
        '</b></td><td><i>cell 2</i></td></tr></table><ol start=4><li>first</li><li>second</li></ol>';
      const paste = async (text, html) => {
        await page.keyboard.press('F9');
        assert.equal(await page.evaluate(() => document.activeElement.id), 't');
        await page.evaluate(
          ({ text, html }) => {
            const data = new DataTransfer();
            data.setData('text/plain', text);
            data.setData('text/html', html);
            document.querySelector('#t').dispatchEvent(
              new ClipboardEvent('paste', {
                clipboardData: data,
                cancelable: true,
              }),
            );
          },
          { text, html },
        );
        return receipt();
      };
      const accepted = await paste(plain, markup);
      assert.deepEqual(accepted, {
        source: 2,
        pastes: 1,
        ok: true,
        html: true,
        text: true,
      });
      assert.equal((await paste('wrong owned text', markup)).ok, false);
      assert.equal((await paste(plain, 'x'.repeat(65537))).ok, false);
      assert.deepEqual(errors, []);
      // Browser-chrome shortcut dispatch is separate from document reset.
      // The socket fixture below verifies the forwarded physical F5 scancode.
      assert.equal(
        await page.evaluate(() => {
          const event = new KeyboardEvent('keydown', {
            code: 'F5',
            cancelable: true,
          });
          document.dispatchEvent(event);
          return event.defaultPrevented;
        }),
        false,
      );
      await page.reload();
      assert.deepEqual(await receipt(), {
        source: 0,
        pastes: 0,
        ok: false,
        html: false,
        text: false,
      });
    } finally {
      await browser.close();
    }
  },
);

test(
  'actual-RDP helper client composes real control WS, checked key/text input and reference HTML read with a synthetic backend',
  { skip: process.platform !== 'win32', timeout: 25000 },
  async () => {
    const worker = new HtmlSessionWorker(),
      inputs = [],
      ports = Array.from({ length: 8 }, () => randomInt(49152, 65536));
    worker.sendInput = async (event) => {
      inputs.push(event);
    };
    const server = await createSessionServer({
      worker: {
        workerPath: resolve(
          process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/bundled',
          'rdp-worker.exe',
        ),
        runtimeRoot: resolve('.runtime/html-lab-fixture'),
      },
      authenticate: () => ({ id: 'synthetic-html-lab' }),
      allowedOrigins: ports.map((port) => 'http://127.0.0.1:' + port),
      sessions: { workerFactory: () => worker },
      logDestination: new Writable({
        write(_bytes, _encoding, done) {
          done();
        },
      }),
    });
    const index = await readFile('apps/reference-harness/index.html', 'utf8');
    const panel = index.slice(
      index.indexOf('<section id="clipboard-html"'),
      index.indexOf('<section id="clipboard-text"'),
    );
    const fixture = (
      await readFile('tests/fixtures/html-rdp-client.html', 'utf8')
    ).replace('<!--REFERENCE_PANEL-->', panel);
    server.get('/', (_request, reply) => reply.type('text/html').send(fixture));
    for (const name of [
      'clipboard-client.js',
      'clipboard-html-view.js',
      'clipboard-html-normalize.js',
      'clipboard-html.js',
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
          clipboard: { mode: 'bidirectional', html: true },
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
                throw new Error('Unexpected OS access');
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
      await page
        .waitForFunction(() => window.fixture.snapshot?.canReadHtml)
        .catch(async () => {
          assert.fail(
            JSON.stringify({
              errors,
              snapshot: await page.evaluate(() => window.fixture.snapshot),
              failures: await page.evaluate(() => window.fixture.failures),
            }),
          );
        });
      assert.equal(
        await page.evaluate(
          (fp) => window.fixture.accept(fp),
          'sha256:' + 'a'.repeat(64),
        ),
        false,
      );
      await page.evaluate(() => window.fixture.press(['ControlLeft', 'KeyL']));
      await eventually(() => inputs.length === 4);
      assert.deepEqual(
        inputs.map((input) => [input.scancode, input.down]),
        [
          [29, true],
          [38, true],
          [38, false],
          [29, false],
        ],
      );
      assert.equal(
        await page.evaluate(() =>
          window.fixture.text('data:text/html;base64,YQ=='),
        ),
        true,
      );
      assert.equal(inputs[4].text, 'data:text/html;base64,YQ==');
      await assert.rejects(
        page.evaluate(() => window.fixture.text('file:///unowned')),
      );
      await assert.rejects(
        page.evaluate(() => window.fixture.press(['MetaLeft'])),
      );
      const receipt = await page.evaluate(() => window.fixture.receipt());
      assert.equal(receipt, worker.plain.toString());
      await page.locator('[data-html-clipboard=read]').click();
      await page.waitForFunction(() =>
        document
          .querySelector('#clipboard-html [role=status]')
          .textContent.startsWith('HTML получен.'),
      );
      assert.ok(
        (
          await page.locator('[data-html-clipboard-received]').inputValue()
        ).includes('synthetic'),
      );
      assert.equal(worker.reads, 1);
      assert.equal(await page.evaluate(() => window.osCalls), 0);
      assert.equal(await page.evaluate(() => window.fixture.failures), 0);
      await page.evaluate(() => window.fixture.press(['F5']));
      await eventually(() => inputs.length === 7);
      assert.deepEqual(
        inputs.slice(-2).map((input) => [input.scancode, input.down]),
        [
          [63, true],
          [63, false],
        ],
      );
      await page.evaluate(() => window.fixture.dispose());
      assert.equal(
        await page.locator('[data-html-clipboard-received]').inputValue(),
        '',
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await server.close();
      worker.htmlBody.fill(0);
      worker.plain.fill(0);
      for (const item of worker.returned) {
        item.body.fill(0);
        item.text.fill(0);
      }
    }
  },
);
