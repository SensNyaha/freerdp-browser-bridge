import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { listenBrowserHttp } from '../fixtures/browser-port.mjs';

test(
  'Edge actual PNG workers preserve named color/alpha profiles and near-ceiling geometry without OS/RDP',
  { skip: process.platform !== 'win32', timeout: 30000 },
  async (t) => {
    const assets = new Map();
    for (const name of [
      'clipboard-image.js',
      'clipboard-image-conversion.js',
      'clipboard-image-worker.js',
    ])
      assets.set('/' + name, await readFile('apps/reference-harness/' + name));
    const server = createServer((request, response) => {
      if (request.url === '/') {
        response.setHeader('content-type', 'text/html');
        response.end(
          '<!doctype html><title>Owned PNG conversion profiles</title>',
        );
      } else {
        response.statusCode = assets.has(request.url) ? 200 : 404;
        response.setHeader('content-type', 'text/javascript');
        response.end(assets.get(request.url) ?? '');
      }
    });
    let browser;
    try {
      const port = await listenBrowserHttp(server);
      browser = await chromium.launch({ channel: 'msedge', headless: true });
      const page = await browser.newPage(),
        errors = [];
      page.setDefaultTimeout(10000);
      page.on('pageerror', () => errors.push('pageerror'));
      await page.goto('http://127.0.0.1:' + port);
      await page.evaluate(async () => {
        window.osCalls = 0;
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: Object.fromEntries(
            ['read', 'write', 'readText', 'writeText'].map((name) => [
              name,
              () => {
                ++window.osCalls;
                throw new Error('Unexpected OS clipboard access');
              },
            ]),
          ),
        });
        window.Converter = (
          await import('/clipboard-image-conversion.js')
        ).ClipboardImageConversion;
      });
      for (const profile of [
        { name: 'opaque non-square', width: 257, height: 19, alpha: false },
        { name: 'representable alpha', width: 33, height: 17, alpha: true },
        {
          name: 'near-ceiling opaque',
          width: 2048,
          height: 2047,
          alpha: false,
        },
      ])
        await t.test(profile.name, async () => {
          const result = await page.evaluate(async (profile) => {
            let starts = 0,
              stops = 0,
              active = 0,
              peak = 0;
            const maximum = 16777216;
            const converter = new window.Converter(() => {
              const worker = new Worker('/clipboard-image-worker.js', {
                type: 'module',
              });
              ++starts;
              peak = Math.max(peak, ++active);
              const terminate = worker.terminate.bind(worker);
              worker.terminate = () => {
                ++stops;
                --active;
                terminate();
              };
              return worker;
            });
            const rgba = new Uint8Array(profile.width * profile.height * 4),
              alphas = [0, 1, 64, 128, 254, 255];
            // Full-intensity/zero RGB is exactly representable at every selected
            // alpha. Fully transparent pixels have canonical zero canvas RGB.
            const value = (pixel, channel) =>
              profile.alpha
                ? channel === 3
                  ? alphas[pixel % 6]
                  : (pixel + channel) % 3 === 0
                    ? 255
                    : 0
                : channel === 3
                  ? 255
                  : (pixel * (channel * 4 + 3) + channel * 53) & 255;
            for (let pixel = 0; pixel < rgba.length / 4; pixel++)
              for (let channel = 0; channel < 4; channel++)
                rgba[pixel * 4 + channel] = value(pixel, channel);
            let decoded;
            try {
              const encoding = converter.run(
                  'encode',
                  { ...profile, rgba },
                  maximum,
                ),
                busy = await converter.run(
                  'encode',
                  { ...profile, rgba },
                  maximum,
                ),
                encoded = await encoding;
              if (busy.status !== 'busy' || encoded.status !== 'accepted')
                throw new Error('PNG encode profile refused');
              for (let pixel = 0; pixel < rgba.length / 4; pixel++)
                for (let channel = 0; channel < 4; channel++)
                  if (rgba[pixel * 4 + channel] !== value(pixel, channel))
                    throw new Error('PNG encode changed borrowed pixels');
              const header = new Uint8Array(
                await encoded.blob.slice(0, 33).arrayBuffer(),
              );
              try {
                const view = new DataView(header.buffer);
                if (
                  view.getUint32(16) !== profile.width ||
                  view.getUint32(20) !== profile.height
                )
                  throw new Error('PNG encoded geometry changed');
              } finally {
                header.fill(0);
              }
              const refused = await converter.run(
                'decode',
                encoded.blob,
                rgba.length + 123,
              );
              if (refused.status !== 'invalid')
                throw new Error('PNG decode exceeded native DIBV5 quota');
              decoded = await converter.run('decode', encoded.blob, maximum);
              if (
                decoded.status !== 'accepted' ||
                decoded.item.width !== profile.width ||
                decoded.item.height !== profile.height ||
                decoded.item.rgba.length !== rgba.length
              )
                throw new Error('PNG decode profile refused or resized');
              for (let pixel = 0; pixel < rgba.length / 4; pixel++)
                for (let channel = 0; channel < 4; channel++) {
                  const expected =
                    profile.alpha && value(pixel, 3) === 0
                      ? 0
                      : value(pixel, channel);
                  if (decoded.item.rgba[pixel * 4 + channel] !== expected)
                    throw new Error('PNG named profile changed pixels');
                }
              decoded.item.rgba.fill(0);
              rgba.fill(0);
              converter.dispose();
              return {
                starts,
                stops,
                active,
                peak,
                pngBytes: encoded.blob.size,
                cleared:
                  decoded.item.rgba.every((v) => !v) && rgba.every((v) => !v),
              };
            } finally {
              rgba.fill(0);
              decoded?.item?.rgba.fill(0);
              converter.dispose();
            }
          }, profile);
          assert.equal(result.starts, 3);
          assert.equal(result.stops, result.starts);
          assert.equal(result.active, 0);
          assert.equal(result.peak, 1);
          assert.ok(result.pngBytes >= 45 && result.pngBytes <= 16777216);
          assert.equal(result.cleared, true);
          assert.equal(await page.evaluate(() => window.osCalls), 0);
        });
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
