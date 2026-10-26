import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { randomInt } from 'node:crypto';
import { Writable } from 'node:stream';
import { chromium } from 'playwright-core';
import { createSessionServer } from '../../apps/bridge-api/dist/session-server.js';
import { HtmlSessionWorker } from '../fixtures/html-session-worker.mjs';
import { eventually } from '../fixtures/session-worker.mjs';
import { listenBrowserLoopback } from '../fixtures/browser-port.mjs';

class ContextualHtmlWorker extends HtmlSessionWorker {
  htmlBody = Buffer.from(
    '<table><tr><td><b>selected \u0416\ud83d\ude00</b></td></tr><tr><td>unselected synthetic</td></tr></table>',
  );
  plain = Buffer.from('selected \u0416\ud83d\ude00');
  async readClipboardHtml(revision) {
    const result = await super.readClipboardHtml(revision);
    const fragmentOffset = this.htmlBody.indexOf('<b>');
    Object.assign(result.item, {
      context: true,
      selection: true,
      fragmentOffset,
      fragmentBytes: Buffer.byteLength('<b>selected \u0416\ud83d\ude00</b>'),
      selectionOffset: fragmentOffset + 3,
      selectionBytes: this.plain.length,
    });
    return result;
  }
}

for (const mode of ['bidirectional', 'server-to-browser', 'browser-to-server'])
  test(
    `Edge HTML client / actual WS / synthetic RDP: ${mode} bounded item and retirement`,
    { skip: process.platform !== 'win32', timeout: 25000 },
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'rdp-html-browser-'));
      const worker = new ContextualHtmlWorker(),
        logs = [],
        ports = Array.from({ length: 8 }, () => randomInt(49152, 65536));
      const server = await createSessionServer({
        worker: {
          runtimeRoot: root,
          workerPath: resolve(
            process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/bundled',
            'rdp-worker.exe',
          ),
        },
        authenticate: () => ({ id: 'synthetic-html-browser' }),
        allowedOrigins: ports.map((port) => 'http://127.0.0.1:' + port),
        sessions: { workerFactory: () => worker },
        logDestination: new Writable({
          write(bytes, _encoding, done) {
            logs.push(bytes.toString());
            done();
          },
        }),
      });
      for (const name of [
        'clipboard-client.js',
        'clipboard-html.js',
        'clipboard-text.js',
        'clipboard-wire.js',
      ]) {
        const bytes = await readFile('apps/reference-harness/' + name);
        server.get('/' + name, (_request, reply) =>
          reply.type('text/javascript').send(bytes),
        );
      }
      const html = await readFile('tests/fixtures/clipboard-html-browser.html');
      server.get('/', (_request, reply) => reply.type('text/html').send(html));
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
            clipboard: { mode, html: true, maxItemBytes: 1048576 },
          },
        });
        assert.equal(response.statusCode, 202);
        const created = response.json();
        browser = await chromium.launch({ channel: 'msedge', headless: true });
        const page = await browser.newPage(),
          errors = [];
        page.setDefaultTimeout(7000);
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto('http://127.0.0.1:' + port);
        await page.waitForFunction(() => Boolean(window.fixture));
        await page.evaluate(
          (created) => window.fixture.attach(created),
          created,
        );
        await page.waitForFunction(() => window.fixture.snapshot?.available);
        assert.equal(await page.evaluate(() => window.fixture.commands), 0);
        assert.equal(worker.reads + worker.writes, 0);
        assert.equal(await page.evaluate(() => window.localClipboardCalls), 0);
        const value = '<p><b>synthetic \u754c\ud83d\ude00</b></p>'.repeat(5000),
          plain = 'synthetic \u754c\ud83d\ude00\n'.repeat(5000);
        const upload = await page.evaluate(
          ({ value, plain }) => window.fixture.upload(value, plain),
          { value, plain },
        );
        assert.equal(
          upload.status,
          mode === 'server-to-browser' ? 'refused' : 'accepted',
        );
        assert.equal(worker.writes, mode === 'server-to-browser' ? 0 : 1);
        if (mode !== 'server-to-browser') {
          assert.equal(worker.written.body.toString(), value);
          assert.equal(worker.written.text.toString(), plain);
        }
        const read = await page.evaluate(() => window.fixture.read());
        assert.equal(
          read.status,
          mode === 'browser-to-server' ? 'refused' : 'accepted',
        );
        if (mode !== 'browser-to-server') {
          assert.equal(read.body, worker.htmlBody.toString());
          assert.equal(read.text, worker.plain.toString());
          assert.equal(read.context, true);
          assert.equal(read.selection, true);
          assert.equal(
            Buffer.from(read.body)
              .subarray(
                read.selectionOffset,
                read.selectionOffset + read.selectionBytes,
              )
              .toString(),
            read.text,
          );
          assert.ok(worker.returned[0].body.every((byte) => !byte));
          assert.ok(worker.returned[0].text.every((byte) => !byte));
          assert.equal(await page.evaluate(() => window.fixture.clear()), true);
        }
        assert.equal(await page.evaluate(() => window.localClipboardCalls), 0);
        assert.equal(await page.evaluate(() => window.fixture.failures), 0);
        assert.equal(await page.locator('table').count(), 0);
        await page.evaluate(() => window.fixture.dispose());
        await eventually(
          () => worker.revokes === (mode === 'server-to-browser' ? 0 : 1),
        );
        assert.equal(
          (
            await server.inject({
              method: 'GET',
              url: '/v1/sessions/' + created.sessionId,
            })
          ).json().state,
          'connected',
        );
        assert.equal(logs.join('').includes('selected \u0416'), false);
        assert.equal(logs.join('').includes('<p><b>synthetic'), false);
        assert.deepEqual(errors, []);
      } finally {
        await browser?.close();
        await server.close();
        worker.htmlBody.fill(0);
        worker.plain.fill(0);
        worker.written?.body.fill(0);
        worker.written?.text?.fill(0);
        assert.deepEqual(await readdir(root), []);
        const absolute = resolve(root);
        if (!absolute.startsWith(resolve(tmpdir()) + sep + 'rdp-html-browser-'))
          throw new Error('Invalid owned fixture directory');
        await rm(absolute, { recursive: true, force: true, maxRetries: 3 });
      }
    },
  );
