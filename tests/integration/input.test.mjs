import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { createSessionServer } from '../../apps/bridge-api/dist/session-server.js';
import { FakeSessionWorker, eventually } from '../fixtures/session-worker.mjs';
const { WebSocket } = createRequire(
  new URL('../../apps/bridge-api/package.json', import.meta.url),
)('ws');

async function fixture(run) {
  const worker = new FakeSessionWorker();
  const sent = [];
  worker.sendInput = async (e) => {
    sent.push(e);
  };
  const server = await createSessionServer({
    worker: {
      workerPath: resolve(
        process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
        'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
      ),
      runtimeRoot: resolve('.runtime/input-fixture'),
    },
    authenticate: () => ({ id: 'input-fixture' }),
    allowedOrigins: ['http://input.test'],
    sessions: { workerFactory: () => worker },
  });
  const module = await readFile('apps/reference-harness/input.js', 'utf8');
  server.get('/input.js', (_req, reply) =>
    reply.type('text/javascript').send(module),
  );
  server.get('/fixture', (_req, reply) =>
    reply
      .type('text/html')
      .send(
        '<canvas tabindex="0" width="1920" height="1080" style="width:960px;height:540px"></canvas><button>Other focus</button>',
      ),
  );
  let ws;
  try {
    await server.listen({ host: '127.0.0.1', port: 0 });
    const origin = 'http://127.0.0.1:' + server.server.address().port;
    const created = (
      await server.inject({
        method: 'POST',
        url: '/v1/sessions',
        payload: {
          target: { host: 'fake.test' },
          auth: { username: 'fixture' },
        },
      })
    ).json();
    await eventually(() => worker.started === 1);
    ws = new WebSocket(
      origin.replace('http:', 'ws:') +
        '/v1/sessions/' +
        created.sessionId +
        '/control?token=' +
        created.attach.control.token,
      ['freerdp-bridge-v1'],
      { origin: 'http://input.test' },
    );
    ws.on('error', () => {});
    const state = once(ws, 'message');
    await once(ws, 'open');
    assert.equal(JSON.parse((await state)[0]).data.state, 'connected');
    await run({ sent, worker, ws, origin });
  } finally {
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      const closed = once(ws, 'close');
      ws.terminate();
      await closed;
    }
    await server.close();
  }
}
test('control WS validates input, sends it in order and releases on transport loss', async () => {
  await fixture(async ({ ws, sent }) => {
    let seq = 0;
    const send = (type, data) =>
      ws.send(JSON.stringify({ v: 1, type, seq: seq++, ts: Date.now(), data }));
    send('input.key', { code: 'ControlRight', down: true, repeat: false });
    send('input.key', { code: 'KeyA', down: true, repeat: false });
    send('input.pointer', {
      action: 'button',
      x: 100,
      y: 200,
      button: 4,
      down: true,
    });
    send('input.wheel', { delta: -120, horizontal: false });
    send('input.sync', { toggles: 6 });
    await eventually(() => sent.length === 5);
    assert.deepEqual(sent[0], {
      type: 'key',
      scancode: 0x11d,
      down: true,
      repeat: false,
    });
    assert.deepEqual(sent[2], {
      type: 'button',
      x: 100,
      y: 200,
      button: 4,
      down: true,
    });
    const error = once(ws, 'message');
    const closed = once(ws, 'close');
    send('input.pointer', { action: 'move', x: 9000, y: 0 });
    assert.equal(
      JSON.parse((await error)[0]).data.code,
      'CONTROL_PROTOCOL_ERROR',
    );
    assert.equal((await closed)[0], 1008);
    await eventually(() => sent.length === 6);
    assert.deepEqual(sent.at(-1), { type: 'reset' });
  });
});
test(
  'Edge input fixture scales coordinates, coalesces moves and releases on blur and disposal',
  { skip: process.platform !== 'win32' },
  async () => {
    await fixture(async ({ sent, ws, origin }) => {
      const browser = await chromium.launch({
        channel: 'msedge',
        headless: true,
      });
      try {
        const page = await browser.newPage({
          viewport: { width: 1200, height: 800 },
        });
        await page.goto(origin + '/fixture');
        let sequence = 0;
        await page.exposeFunction('sendInput', (type, data) => {
          ws.send(
            JSON.stringify({
              v: 1,
              type,
              seq: sequence++,
              ts: Date.now(),
              data,
            }),
          );
        });
        await page.evaluate(async () => {
          const { installInput } = await import('/input.js');
          window.disposeInput = installInput(
            document.querySelector('canvas'),
            (type, data) => {
              void window.sendInput(type, data);
              return true;
            },
            () => true,
            () => {
              throw new Error('fixture send failed');
            },
          );
        });
        await page.evaluate(() => {
          const c = document.querySelector('canvas');
          const rect = c.getBoundingClientRect();
          for (const [x, y] of [
            [5, 5],
            [25, 30],
            [100, 200],
          ])
            c.dispatchEvent(
              new PointerEvent('pointermove', {
                pointerType: 'mouse',
                clientX: rect.left + x,
                clientY: rect.top + y,
              }),
            );
        });
        await eventually(() => sent.length === 1);
        assert.deepEqual(sent[0], { type: 'move', x: 200, y: 400 });
        await page.locator('canvas').focus();
        await page.keyboard.down('Control');
        await page.keyboard.down('a');
        await page.locator('button').focus();
        await eventually(() => sent.some((e) => e.type === 'reset'));
        assert.deepEqual(
          sent
            .slice(1, 4)
            .map((e) => (e.type === 'key' ? [e.scancode, e.down] : e.type)),
          [[29, true], [30, true], 'reset'],
        );
        await page.keyboard.up('a');
        await page.keyboard.up('Control');
        await page.locator('canvas').focus();
        await page.keyboard.down('Shift');
        await page.evaluate(() => window.disposeInput());
        await eventually(() => sent.length === 6);
        assert.equal(sent.at(-1).type, 'reset');
        await page.keyboard.up('Shift');
        await page.keyboard.press('b');
        await new Promise((done) => setTimeout(done, 30));
        assert.equal(sent.length, 6);
        await page.evaluate(async () => {
          const { installInput } = await import('/input.js');
          window.disposeInput = installInput(
            document.querySelector('canvas'),
            (type, data) => {
              void window.sendInput(type, data);
              return true;
            },
            () => true,
            () => {
              throw new Error('fixture send failed');
            },
          );
        });
        const box = await page.locator('canvas').boundingBox();
        const before = sent.length;
        await page.evaluate(() => {
          const c = document.querySelector('canvas');
          const rect = c.getBoundingClientRect();
          c.dispatchEvent(
            new PointerEvent('pointermove', {
              pointerType: 'mouse',
              clientX: rect.left + 10,
              clientY: rect.top + 20,
            }),
          );
          c.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
          c.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
        });
        await eventually(() => sent.length >= before + 3);
        assert.deepEqual(sent.slice(before, before + 3), [
          { type: 'move', x: 20, y: 40 },
          { type: 'key', scancode: 18, down: true, repeat: false },
          { type: 'key', scancode: 18, down: false, repeat: false },
        ]);
        await page.mouse.move(box.x + 40, box.y + 50);
        await page.mouse.down({ button: 'right' });
        await page.mouse.move(box.x + box.width + 80, box.y + 60);
        await page.mouse.up({ button: 'right' });
        await eventually(() =>
          sent.some((e) => e.type === 'button' && !e.down),
        );
        const buttons = sent.filter((e) => e.type === 'button');
        assert.deepEqual(buttons, [
          { type: 'button', x: 80, y: 100, button: 2, down: true },
          { type: 'button', x: 1919, y: 120, button: 2, down: false },
        ]);
        await page.mouse.move(box.x + 50, box.y + 60);
        await page.mouse.wheel(20, 30);
        await eventually(
          () => sent.filter((e) => e.type === 'wheel').length === 2,
        );
        assert.deepEqual(
          sent.filter((e) => e.type === 'wheel'),
          [
            { type: 'wheel', delta: -120, horizontal: false },
            { type: 'wheel', delta: 120, horizontal: true },
          ],
        );
        await page.evaluate(() => {
          document
            .querySelector('canvas')
            .dispatchEvent(new KeyboardEvent('keydown', { code: 'IntlYen' }));
          window.disposeInput();
        });
        await new Promise((done) => setTimeout(done, 30));
        assert.equal(ws.readyState, WebSocket.OPEN);
      } finally {
        await browser.close();
      }
    });
  },
);
