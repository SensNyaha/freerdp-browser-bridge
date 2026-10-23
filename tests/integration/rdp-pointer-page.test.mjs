import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

test(
  'prepared remote pointer page: real Edge button, drag, wheel and bounded selected receipt without clipboard access',
  { skip: process.platform !== 'win32', timeout: 20000 },
  async () => {
    const browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
    });
    try {
      const page = await browser.newPage({
        viewport: { width: 1000, height: 800 },
      });
      await page.setContent(
        await readFile('tests/fixtures/rdp-pointer-page.html', 'utf8'),
      );
      for (const button of ['left', 'middle', 'right'])
        await page.mouse.click(400, 300, { button });
      await page.mouse.move(300, 200);
      await page.mouse.down();
      await page.mouse.move(600, 500, { steps: 5 });
      await page.mouse.up();
      for (const [x, y] of [
        [0, 240],
        [0, -120],
        [240, 0],
        [-120, 0],
      ]) {
        await page.mouse.wheel(x, y);
        await page.waitForTimeout(100);
      }
      await page.keyboard.press('F2');
      const text = await page.locator('#result').inputValue();
      assert.ok(text.length < 512);
      const value = JSON.parse(text);
      assert.deepEqual(value.down, [2, 1, 1]);
      assert.deepEqual(value.up, [2, 1, 1]);
      assert.equal(value.fixture, 'bridge-pointer-v1');
      assert.equal(value.v, 1);
      assert.equal(value.buttons, 0);
      assert.ok(value.dragX >= 300 && value.dragY >= 300);
      for (const key of ['left', 'right', 'up', 'down'])
        assert.ok(value.wheel[key] > 0, key);
      assert.equal(
        await page
          .locator('#result')
          .evaluate((field) => field.selectionEnd - field.selectionStart),
        text.length,
      );
    } finally {
      await browser.close();
    }
  },
);
