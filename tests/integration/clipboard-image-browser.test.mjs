import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { randomInt } from 'node:crypto';
import { Writable } from 'node:stream';
import { chromium } from 'playwright-core';
import { createSessionServer } from '../../apps/bridge-api/dist/session-server.js';
import { ImageSessionWorker } from '../fixtures/image-session-worker.mjs';
import { eventually } from '../fixtures/session-worker.mjs';
import { listenBrowserLoopback } from '../fixtures/browser-port.mjs';

for (const mode of ['bidirectional', 'server-to-browser', 'browser-to-server'])
  test(
    `Edge image client / actual WS / synthetic RDP: ${mode} explicit RGBA and retirement`,
    { skip: process.platform !== 'win32', timeout: 30000 },
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'rdp-image-browser-'));
      const worker = new ImageSessionWorker(),
        logs = [],
        ports = Array.from({ length: 8 }, () => randomInt(49152, 65536));
      worker.image.rgba.fill(0);
      worker.image = { width: 100, height: 100, rgba: Buffer.alloc(40000) };
      for (let n = 0; n < 40000; n++) worker.image.rgba[n] = n % 251;
      const server = await createSessionServer({
        worker: {
          runtimeRoot: root,
          workerPath: resolve(
            process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/bundled',
            'rdp-worker.exe',
          ),
        },
        authenticate: () => ({ id: 'synthetic-image-browser' }),
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
        'clipboard-image.js',
        'clipboard-text.js',
        'clipboard-wire.js',
      ]) {
        const bytes = await readFile('apps/reference-harness/' + name);
        server.get('/' + name, (_request, reply) =>
          reply.type('text/javascript').send(bytes),
        );
      }
      const html = await readFile(
        'tests/fixtures/clipboard-image-browser.html',
      );
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
            clipboard: { mode, images: true, maxItemBytes: 1048576 },
          },
        });
        assert.equal(response.statusCode, 202);
        const created = response.json();
        browser = await chromium.launch({ channel: 'msedge', headless: true });
        const page = await browser.newPage(),
          errors = [];
        page.setDefaultTimeout(7000);
        page.on('pageerror', () => errors.push('pageerror'));
        await page.goto('http://127.0.0.1:' + port);
        await page.waitForFunction(() => Boolean(window.fixture));
        await page.evaluate(
          (created) => window.fixture.attach(created),
          created,
        );
        await page.waitForFunction(() => window.fixture.snapshot?.available);
        assert.equal(
          await page.evaluate(() => window.fixture.snapshot.image),
          true,
        );
        assert.equal(
          await page.evaluate(() => window.fixture.snapshot.html),
          false,
        );
        assert.equal(await page.evaluate(() => window.fixture.commands), 0);
        assert.equal(worker.reads + worker.writes, 0);
        assert.equal(await page.evaluate(() => window.localClipboardCalls), 0);
        const invalid = await page.evaluate(() => window.fixture.invalid());
        assert.equal(
          invalid.status,
          mode === 'server-to-browser' ? 'refused' : 'invalid',
        );
        assert.equal(await page.evaluate(() => window.fixture.commands), 0);
        const upload = await page.evaluate(() => window.fixture.upload());
        assert.equal(
          upload.status,
          mode === 'server-to-browser' ? 'refused' : 'accepted',
        );
        assert.equal(worker.writes, mode === 'server-to-browser' ? 0 : 1);
        if (mode !== 'server-to-browser')
          assert.deepEqual(worker.written, worker.image);
        const read = await page.evaluate(() => window.fixture.read());
        assert.equal(
          read.status,
          mode === 'browser-to-server' ? 'refused' : 'accepted',
        );
        if (mode !== 'browser-to-server') {
          assert.equal(read.exact, true);
          assert.ok(worker.returned[0].rgba.every((byte) => !byte));
          assert.equal(await page.evaluate(() => window.fixture.clear()), true);
        }
        assert.equal(await page.evaluate(() => window.localClipboardCalls), 0);
        assert.equal(await page.evaluate(() => window.fixture.failures), 0);
        assert.equal(await page.locator('canvas,img').count(), 0);
        await page.evaluate(() => window.fixture.dispose());
        await eventually(
          () => worker.revokes === (mode === 'server-to-browser' ? 0 : 1),
        );
        assert.ok(
          !worker.written || worker.written.rgba.every((byte) => !byte),
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
        assert.ok(
          !logs.join('').includes(worker.image.rgba.toString('base64')),
        );
        assert.deepEqual(errors, []);
      } finally {
        await browser?.close();
        await server.close();
        worker.image.rgba.fill(0);
        worker.written?.rgba.fill(0);
        assert.deepEqual(await readdir(root), []);
        const absolute = resolve(root);
        if (
          !absolute.startsWith(resolve(tmpdir()) + sep + 'rdp-image-browser-')
        )
          throw new Error('Invalid owned fixture directory');
        await rm(absolute, { recursive: true, force: true, maxRetries: 3 });
      }
    },
  );
