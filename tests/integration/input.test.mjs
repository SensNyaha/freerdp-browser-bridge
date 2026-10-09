import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { createSessionServer } from '../../apps/bridge-api/dist/session-server.js';
import { FakeSessionWorker, eventually } from '../fixtures/session-worker.mjs';
import { SessionError } from '../../packages/node-bridge/dist/index.js';
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
  const modifiers = await readFile(
    'apps/reference-harness/modifiers.js',
    'utf8',
  );
  server.get('/modifiers.js', (_req, reply) =>
    reply.type('text/javascript').send(modifiers),
  );
  server.get('/input.js', (_req, reply) =>
    reply.type('text/javascript').send(module),
  );
  const textModule = await readFile('apps/reference-harness/text.js', 'utf8');
  server.get('/text.js', (_req, reply) =>
    reply.type('text/javascript').send(textModule),
  );
  server.get('/text-fixture', (_req, reply) =>
    reply
      .type('text/html')
      .send(
        '<form><textarea maxlength="256"></textarea><button>Send</button><span role="status"></span></form>',
      ),
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
test('Unicode control: correlated text completion, unavailable backend stays connected and invalid data is rejected', async () => {
  await fixture(async ({ ws, sent, worker }) => {
    let sequence = 0;
    async function request(text) {
      const seq = sequence++;
      const reply = once(ws, 'message');
      ws.send(
        JSON.stringify({
          v: 1,
          type: 'input.text',
          seq,
          ts: Date.now(),
          data: { text },
        }),
      );
      return JSON.parse((await reply)[0]);
    }
    const received = await request('Ж中😀');
    assert.equal(received.type, 'input.text.result');
    assert.deepEqual(received.data, { requestSeq: 0, status: 'sent' });
    assert.deepEqual(sent, [{ type: 'text', text: 'Ж中😀' }]);
    const send = worker.sendInput;
    worker.sendInput = async (event) => {
      if (event.type === 'text')
        throw new SessionError('INPUT_NOT_IMPLEMENTED');
      return send(event);
    };
    assert.deepEqual((await request('next')).data, {
      requestSeq: 1,
      status: 'unavailable',
    });
    worker.sendInput = send;
    assert.deepEqual((await request('still connected')).data, {
      requestSeq: 2,
      status: 'sent',
    });
    const close = once(ws, 'close');
    const error = await request('\ud800');
    assert.equal(error.data.code, 'CONTROL_PROTOCOL_ERROR');
    assert.equal((await close)[0], 1008);
    assert.ok(!JSON.stringify(error).includes('text'));
  });
});
test('Unicode control batches share the bounded 32-command budget', async () => {
  await fixture(async ({ ws }) => {
    const close = once(ws, 'close');
    for (let seq = 0; seq < 33; seq++)
      ws.send(
        JSON.stringify({
          v: 1,
          type: 'input.text',
          seq,
          ts: Date.now(),
          data: { text: 'bounded' },
        }),
      );
    const [code, reason] = await close;
    assert.equal(code, 1008);
    assert.equal(reason.toString(), 'message rate limit');
  });
});
test(
  'Edge Unicode form: preedit stays local, explicit commit is sent once, bounded drafts survive unavailable/pause and reset removes text',
  { skip: process.platform !== 'win32', timeout: 45000 },
  async () => {
    await fixture(async ({ ws, sent, origin, worker }) => {
      const browser = await chromium.launch({
        channel: 'msedge',
        headless: true,
      });
      try {
        const page = await browser.newPage();
        await page.goto(origin + '/text-fixture');
        let sequence = 0;
        await page.exposeFunction('sendText', async (text) => {
          const reply = once(ws, 'message');
          ws.send(
            JSON.stringify({
              v: 1,
              type: 'input.text',
              seq: sequence++,
              ts: Date.now(),
              data: { text },
            }),
          );
          return JSON.parse((await reply)[0]).data.status;
        });
        await page.evaluate(async () => {
          const { installText } = await import('/text.js');
          window.ready = true;
          window.text = installText(
            document.querySelector('form'),
            window.sendText,
            () => window.ready,
          );
          const field = document.querySelector('textarea');
          field.dispatchEvent(
            new CompositionEvent('compositionstart', { bubbles: true }),
          );
          field.value = 'に';
          field.dispatchEvent(
            new InputEvent('input', { bubbles: true, isComposing: true }),
          );
          document.querySelector('form').requestSubmit();
        });
        assert.equal(sent.length, 0);
        assert.equal(await page.locator('button').isDisabled(), true);
        let release;
        const deliver = worker.sendInput;
        worker.sendInput = async (event) => {
          await deliver(event);
          if (event.type === 'text')
            await new Promise((resolve) => {
              release = resolve;
            });
        };
        await page.evaluate(() => {
          const field = document.querySelector('textarea');
          field.value = '日本語 Ж😀';
          field.dispatchEvent(
            new CompositionEvent('compositionend', { bubbles: true }),
          );
          document.querySelector('form').requestSubmit();
          document.querySelector('form').requestSubmit();
        });
        await eventually(() => Boolean(release));
        assert.deepEqual(sent, [{ type: 'text', text: '日本語 Ж😀' }]);
        assert.equal(await page.locator('textarea').isDisabled(), true);
        release();
        await page.waitForFunction(
          () => document.querySelector('textarea').value === '',
        );
        assert.equal(
          await page.locator('[role="status"]').textContent(),
          'Текст отправлен',
        );
        worker.sendInput = async (event) => {
          if (event.type === 'text')
            throw new SessionError('INPUT_NOT_IMPLEMENTED');
          return deliver(event);
        };
        await page.locator('textarea').fill('сохранить черновик');
        await page.locator('button').click();
        await page.waitForFunction(() =>
          document
            .querySelector('[role="status"]')
            .textContent.includes('не поддерживает'),
        );
        assert.equal(
          await page.locator('textarea').inputValue(),
          'сохранить черновик',
        );
        worker.sendInput = async (event) => {
          if (event.type === 'text')
            throw new SessionError('INPUT_DISPLAY_TRANSITION');
          return deliver(event);
        };
        await page.locator('button').click();
        await page.waitForFunction(() =>
          document
            .querySelector('[role="status"]')
            .textContent.includes('окончания'),
        );
        assert.equal(
          await page.locator('textarea').inputValue(),
          'сохранить черновик',
        );
        await page.evaluate(() => {
          window.ready = false;
          window.text.refresh();
          document.querySelector('form').requestSubmit();
        });
        assert.equal(sent.length, 1);
        await page.evaluate(() => {
          window.ready = true;
          const field = document.querySelector('textarea');
          field.value = 'x'.repeat(257);
          field.dispatchEvent(new Event('input', { bubbles: true }));
          document.querySelector('form').requestSubmit();
        });
        assert.equal(sent.length, 1);
        assert.equal(await page.locator('button').isDisabled(), true);
        await page.evaluate(() => {
          const field = document.querySelector('textarea');
          field.value = 'cancelled';
          field.dispatchEvent(new Event('input', { bubbles: true }));
          document.querySelector('form').requestSubmit();
          window.text.reset();
        });
        assert.equal(sent.length, 1);
        await page.evaluate(() => {
          window.text.dispose();
        });
        assert.equal(await page.locator('textarea').inputValue(), '');
        assert.equal(ws.readyState, WebSocket.OPEN);
      } finally {
        await browser.close();
      }
    });
  },
);
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
  'Edge modifier fixture: held right-side entry, missed keyup, lock order, composition and resize pause/reset',
  { skip: process.platform !== 'win32', timeout: 45000 },
  async () => {
    await fixture(async ({ sent, ws, origin }) => {
      const browser = await chromium.launch({
        channel: 'msedge',
        headless: true,
      });
      try {
        const page = await browser.newPage();
        await page.goto(origin + '/fixture');
        let sequence = 0;
        await page.exposeFunction('sendInput', (type, data) =>
          ws.send(
            JSON.stringify({
              v: 1,
              type,
              seq: sequence++,
              ts: Date.now(),
              data,
            }),
          ),
        );
        await page.evaluate(async () => {
          const { installInput } = await import('/input.js');
          window.ready = true;
          window.disposeInput = installInput(
            document.querySelector('canvas'),
            (type, data) => {
              void window.sendInput(type, data);
              return true;
            },
            () => window.ready,
            () => {
              throw new Error('Fixture send failure');
            },
            () => true,
          );
        });
        await page.locator('button').focus();
        await page.keyboard.down('ControlRight');
        assert.equal(sent.length, 0); // Observation alone cannot forward input outside canvas focus.
        await page.locator('canvas').focus();
        await page.keyboard.press('a');
        await eventually(() => sent.length === 4);
        assert.deepEqual(sent, [
          { type: 'key', scancode: 0x11d, down: true, repeat: false },
          { type: 'sync', toggles: 0 },
          { type: 'key', scancode: 30, down: true, repeat: false },
          { type: 'key', scancode: 30, down: false, repeat: false },
        ]);
        await page.keyboard.up('ControlRight');
        await eventually(() => sent.length === 5);
        assert.deepEqual(sent.at(-1), {
          type: 'key',
          scancode: 0x11d,
          down: false,
          repeat: false,
        });
        const before = sent.length;
        await page.evaluate(() => {
          const canvas = document.querySelector('canvas');
          const dispatch = (type, init) =>
            canvas.dispatchEvent(new KeyboardEvent(type, init));
          dispatch('keydown', {
            code: 'ShiftRight',
            shiftKey: true,
            isComposing: true,
          });
          dispatch('keydown', {
            code: 'KeyQ',
            key: 'й',
            shiftKey: true,
            isComposing: true,
          });
          dispatch('keyup', { code: 'ShiftRight', isComposing: true });
          dispatch('keydown', { code: 'ControlLeft', ctrlKey: true });
          // Missing ControlLeft keyup: repair its release before the next physical letter.
          dispatch('keydown', { code: 'KeyQ', key: 'й' });
          dispatch('keyup', { code: 'KeyQ', key: 'й' });
          dispatch('keydown', { code: 'CapsLock', modifierCapsLock: true });
          dispatch('keyup', { code: 'CapsLock', modifierCapsLock: true });
        });
        await eventually(() => sent.length === before + 10);
        assert.deepEqual(sent.slice(before), [
          { type: 'key', scancode: 54, down: true, repeat: false },
          { type: 'key', scancode: 54, down: false, repeat: false },
          { type: 'key', scancode: 29, down: true, repeat: false },
          { type: 'key', scancode: 29, down: false, repeat: false },
          { type: 'key', scancode: 16, down: true, repeat: false },
          { type: 'key', scancode: 16, down: false, repeat: false },
          { type: 'key', scancode: 58, down: true, repeat: false },
          { type: 'sync', toggles: 4 },
          { type: 'key', scancode: 58, down: false, repeat: false },
          { type: 'sync', toggles: 4 },
        ]);
        await page.evaluate(() => {
          const canvas = document.querySelector('canvas');
          canvas.dispatchEvent(
            new KeyboardEvent('keydown', {
              code: 'AltRight',
              altKey: true,
              modifierAltGraph: true,
              modifierCapsLock: true,
            }),
          );
          window.ready = false;
          window.disposeInput.reset();
          canvas.dispatchEvent(
            new KeyboardEvent('keydown', { code: 'KeyB', altKey: true }),
          );
          canvas.dispatchEvent(
            new KeyboardEvent('keyup', { code: 'AltRight' }),
          );
          window.ready = true;
          canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB' }));
          canvas.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyB' }));
        });
        await eventually(() => sent.length === before + 15);
        assert.deepEqual(sent.slice(-5), [
          { type: 'key', scancode: 0x138, down: true, repeat: false },
          { type: 'reset' },
          { type: 'sync', toggles: 0 },
          { type: 'key', scancode: 48, down: true, repeat: false },
          { type: 'key', scancode: 48, down: false, repeat: false },
        ]);
        await page.evaluate(() => window.disposeInput());
        await eventually(() => sent.at(-1)?.type === 'reset');
        assert.equal(ws.readyState, WebSocket.OPEN);
      } finally {
        await browser.close();
      }
    });
  },
);
test(
  'Edge input fixture scales coordinates, coalesces moves and releases on blur and disposal',
  { skip: process.platform !== 'win32' },
  async () => {
    await fixture(async ({ sent, ws, origin }) => {
      const events = () => sent.filter((event) => event.type !== 'sync');
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
        await eventually(() => events().length === 1);
        assert.deepEqual(sent[0], { type: 'move', x: 200, y: 400 });
        await page.locator('canvas').focus();
        await page.keyboard.down('Control');
        await page.keyboard.down('a');
        await page.locator('button').focus();
        await eventually(() => sent.some((e) => e.type === 'reset'));
        assert.deepEqual(
          events()
            .slice(1, 4)
            .map((e) => (e.type === 'key' ? [e.scancode, e.down] : e.type)),
          [[29, true], [30, true], 'reset'],
        );
        await page.keyboard.up('a');
        await page.keyboard.up('Control');
        await page.locator('canvas').focus();
        await page.keyboard.down('Shift');
        await page.evaluate(() => window.disposeInput());
        await eventually(() => events().length === 6);
        assert.equal(sent.at(-1).type, 'reset');
        await page.keyboard.up('Shift');
        await page.keyboard.press('b');
        await new Promise((done) => setTimeout(done, 30));
        assert.equal(events().length, 6);
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
        const before = events().length;
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
        await eventually(() => events().length >= before + 3);
        assert.deepEqual(events().slice(before, before + 3), [
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
