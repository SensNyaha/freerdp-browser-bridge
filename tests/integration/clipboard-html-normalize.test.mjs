import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { listenBrowserHttp } from '../fixtures/browser-port.mjs';

async function fixture(run) {
  const assets = new Map();
  for (const name of [
    'clipboard-html-normalize.js',
    'clipboard-html.js',
    'clipboard-text.js',
  ])
    assets.set('/' + name, await readFile('apps/reference-harness/' + name));
  const html =
    '<!doctype html><meta charset="utf-8"><div id="output"></div><script type="module">import {normalizeClipboardHtmlItem} from "/clipboard-html-normalize.js";window.normalize=normalizeClipboardHtmlItem;window.execution=0;customElements.define("clipboard-test-element",class extends HTMLElement{constructor(){super();++window.execution;}});</script>';
  const server = createServer((request, response) => {
    const bytes = assets.get(request.url);
    response.setHeader('Content-Type', bytes ? 'text/javascript' : 'text/html');
    response.end(bytes ?? html);
  });
  let browser;
  const unexpected = [],
    errors = [];
  try {
    const port = await listenBrowserHttp(server),
      origin = 'http://127.0.0.1:' + port;
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(7000);
    page.on('pageerror', () => errors.push('pageerror'));
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (
        url.origin === origin &&
        (url.pathname === '/' ||
          url.pathname === '/favicon.ico' ||
          assets.has(url.pathname))
      )
        return route.continue();
      unexpected.push(url.pathname);
      return route.abort();
    });
    await page.goto(origin);
    await page.waitForFunction(() => Boolean(window.normalize));
    await run(page);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.deepEqual(unexpected, []);
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => window.execution), 0);
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

test(
  'Edge HTML normalization: repaired contextual markup never imports unselected sibling text or attributes',
  { skip: process.platform !== 'win32', timeout: 20000 },
  async () => {
    await fixture(async (page) => {
      const result = await page.evaluate(() => {
        const utf8 = (text) => new TextEncoder().encode(text);
        const contexts = [
          ['<div>', '</div>'],
          ['<table><tbody><tr><td>', '</td></tr></tbody></table>'],
          ['<ol start="3"><li>', '</li></ol>'],
          ['<b><i>', '</b></i>'],
          ['<table><tr>', '</tr></table>'],
          ['<div><p><b>', '</p></b></div>'],
          ['<table><b>', '</b></table>'],
          ['<span data-secret="PRIVATE-ATTRIBUTE">', '</span>'],
        ];
        const wrappers = [
          ['', ''],
          ['<b>', '</b>'],
          ['<p>', '</p>'],
          ['<tr><td>', '</td></tr>'],
        ];
        const selections = [
          'selected',
          '<strong>selected</strong>',
          'selected</td><td>selected2',
          '<li>selected</li>',
        ];
        let accepted = 0,
          refused = 0,
          leaks = 0,
          lost = 0;
        for (const [head, tail] of contexts)
          for (const [open, close] of wrappers)
            for (const selected of selections) {
              const before = head + 'PRIVATE-BEFORE' + open,
                after = close + 'PRIVATE-AFTER' + tail;
              const body = utf8(before + selected + after);
              try {
                const output = window.normalize(
                  {
                    body,
                    context: true,
                    selection: false,
                    fragmentOffset: utf8(before).length,
                    fragmentBytes: utf8(selected).length,
                    selectionOffset: 0,
                    selectionBytes: 0,
                  },
                  65536,
                );
                ++accepted;
                if (output.html.includes('PRIVATE-')) ++leaks;
                if (!output.html.includes('selected')) ++lost;
              } catch {
                ++refused;
              }
            }
        return { accepted, refused, leaks, lost };
      });
      assert.equal(result.accepted + result.refused, 128);
      assert.ok(result.accepted >= 16);
      assert.ok(result.refused > 0);
      assert.equal(result.leaks, 0);
      assert.equal(result.lost, 0);
    });
  },
);

test(
  'Edge HTML normalization: only selected Unicode, table/list ancestors, numbering and optional fallback survive',
  { skip: process.platform !== 'win32', timeout: 20000 },
  async () => {
    await fixture(async (page) => {
      const results = await page.evaluate(() => {
        const make = (
          before,
          selected,
          after,
          text,
          fragmentBefore = '',
          fragmentAfter = '',
        ) => {
          const utf8 = (value) => new TextEncoder().encode(value);
          const body = utf8(
            before + fragmentBefore + selected + fragmentAfter + after,
          );
          return {
            body,
            context: true,
            selection: true,
            fragmentOffset: utf8(before).length,
            fragmentBytes: utf8(fragmentBefore + selected + fragmentAfter)
              .length,
            selectionOffset: utf8(before + fragmentBefore).length,
            selectionBytes: utf8(selected).length,
            ...(text === undefined ? {} : { text: utf8(text) }),
          };
        };
        const table = make(
          '<table data-secret="private-attribute"><tbody><tr><td style="color: red; font-weight: bold">unselected prefix ',
          '<i>\u0416\ud83d\ude00</i>',
          ' unselected suffix</td></tr><tr><td>private sibling</td></tr></tbody></table>',
          '\u0416\ud83d\ude00',
          '<b>unselected fragment prefix</b>',
          '<b>unselected fragment suffix</b>',
        );
        const hash = table.body.slice();
        const result = window.normalize(table, 4096);
        if (!table.body.every((n, i) => n === hash[i]))
          throw Error('Caller bytes changed');
        const list = make(
          '<ol start="4"><li>private first</li><li>before ',
          '<b>selected</b>',
          ' after</li><li>private last</li></ol>',
        );
        const reversed = make(
          '<ol reversed><li>private first</li><li>',
          'selected',
          '</li><li>private last</li></ol>',
          '',
        );
        const override = make(
          '<ol><li value="20">private first</li><li>',
          'selected',
          '</li></ol>',
        );
        const across = make(
          '<table><tr><td>before ',
          'one</td><td>two',
          ' after</td></tr></table>',
        );
        const empty = {
          body: new Uint8Array(),
          context: false,
          selection: false,
          fragmentOffset: 0,
          fragmentBytes: 0,
          selectionOffset: 0,
          selectionBytes: 0,
        };
        return [
          result,
          window.normalize(list),
          window.normalize(reversed),
          window.normalize(override),
          window.normalize(across),
          window.normalize(empty),
        ];
      });
      const [table, list, reversed, override, across, empty] = results;
      assert.equal(
        table.html,
        '<table><tbody><tr><td style="color: red; font-weight: bold;"><i>\u0416\ud83d\ude00</i></td></tr></tbody></table>',
      );
      assert.equal(table.text, '\u0416\ud83d\ude00');
      assert.equal(table.sanitized, true);
      for (const result of results)
        assert.equal(/unselected|private/.test(result.html), false);
      assert.equal(list.html, '<ol start="5"><li><b>selected</b></li></ol>');
      assert.equal(Object.hasOwn(list, 'text'), false);
      assert.equal(
        reversed.html,
        '<ol reversed="" start="2"><li>selected</li></ol>',
      );
      assert.equal(reversed.text, '');
      assert.equal(override.html, '<ol start="21"><li>selected</li></ol>');
      assert.equal(
        across.html,
        '<table><tbody><tr><td>one</td><td>two</td></tr></tbody></table>',
      );
      assert.deepEqual(empty, { html: '', sanitized: false });
    });
  },
);

test(
  'Edge HTML normalization: inert source, active/foreign content, CSS and URL filtering never execute or fetch',
  { skip: process.platform !== 'win32', timeout: 20000 },
  async () => {
    await fixture(async (page) => {
      const results = await page.evaluate(() => {
        const normalize = (html) => {
          const body = new TextEncoder().encode(html);
          return window.normalize({
            body,
            context: false,
            selection: false,
            fragmentOffset: 0,
            fragmentBytes: body.length,
            selectionOffset: 0,
            selectionBytes: 0,
          });
        };
        const attack = location.origin + '/attack';
        const active = normalize(
          '<div id="clobber" onclick="++window.execution"><b>kept</b><img src="' +
            attack +
            '/image" onerror="++window.execution"><script src="' +
            attack +
            '/script"></script><script>++window.execution</script><iframe src="' +
            attack +
            '/frame" srcdoc="<script>parent.execution++</script>"></iframe><object data="' +
            attack +
            '/object"></object><link rel="stylesheet" href="' +
            attack +
            '/style"><style>@import "' +
            attack +
            '/import";@font-face{font-family:x;src:url(' +
            attack +
            '/font)}</style><svg onload="++window.execution"><foreignObject><div>foreign secret</div></foreignObject></svg><math><mi>foreign secret</mi></math><template><img src="' +
            attack +
            '/nested"></template><clipboard-test-element><em>custom text</em></clipboard-test-element></div>',
        );
        const css = normalize(
          '<p style="color:rgb(255,0,0);background-image:u\\72l(' +
            attack +
            '/css);--private:secret;position:fixed;behavior:url(' +
            attack +
            '/behavior);font-weight:bold" onmouseover="++window.execution">style</p>',
        );
        const hrefs = [
          'javascript:window.execution++',
          'java&#x73;cript:window.execution++',
          'data:text/html,x',
          '/private-relative',
          'https://user:secret@example.test/',
          'https://example.test/path?q=1&amp;x=2',
        ];
        const links = hrefs.map((href) =>
          normalize('<a href="' + href + '" target="_blank">link</a>'),
        );
        const escaped = normalize(
          '<p>&lt;img src=x onerror=execution++&gt; &amp; "quote"</p>',
        );
        for (const result of [active, css, ...links, escaped]) {
          const element = document.querySelector('#output');
          element.innerHTML = result.html;
          element.replaceChildren();
        }
        return {
          active,
          css,
          links,
          escaped,
          live: document.querySelectorAll(
            'img,iframe,object,svg,math,clipboard-test-element',
          ).length,
        };
      });
      assert.equal(
        results.active.html,
        '<div><b>kept</b><em>custom text</em></div>',
      );
      assert.equal(results.active.sanitized, true);
      assert.equal(
        results.css.html,
        '<p style="color: rgb(255, 0, 0); font-weight: bold;">style</p>',
      );
      assert.equal(results.css.sanitized, true);
      for (const result of results.links.slice(0, 5)) {
        assert.equal(result.html, '<a>link</a>');
        assert.equal(result.sanitized, true);
      }
      assert.equal(
        results.links[5].html,
        '<a href="https://example.test/path?q=1&amp;x=2">link</a>',
      );
      assert.equal(
        results.escaped.html,
        '<p>&lt;img src=x onerror=execution++&gt; &amp; &quot;quote&quot;</p>',
      );
      assert.equal(results.live, 0);
    });
  },
);

test(
  'Edge HTML normalization: parser/output quotas, ambiguous boundaries and strict UTF8 fail before delivery',
  { skip: process.platform !== 'win32', timeout: 25000 },
  async () => {
    await fixture(async (page) => {
      const results = await page.evaluate(() => {
        const utf8 = (text) => new TextEncoder().encode(text);
        const item = (body) => ({
          body,
          context: false,
          selection: false,
          fragmentOffset: 0,
          fragmentBytes: body.length,
          selectionOffset: 0,
          selectionBytes: 0,
        });
        const refuses = (value, maximum = 16777216) => {
          try {
            window.normalize(value, maximum);
            return false;
          } catch {
            return true;
          }
        };
        let creations = 0;
        const original = document.createElement;
        document.createElement = function (...args) {
          ++creations;
          return original.apply(this, args);
        };
        const preflight = refuses(item(utf8('<'.repeat(16385))));
        document.createElement = original;
        const values = [
          item(Uint8Array.of(0xc0, 0x80)),
          item(Uint8Array.of(0)),
          item(utf8('<div>'.repeat(130) + 'x' + '</div>'.repeat(130))),
          item(utf8('<p>x'.repeat(16384))),
          item(
            utf8(
              '<b ' +
                Array.from(
                  { length: 65 },
                  (_, n) => 'data-a' + n + '="x"',
                ).join(' ') +
                '>x</b>',
            ),
          ),
          item(utf8('<b title="' + 'A'.repeat(4097) + '">x</b>')),
          item(
            utf8(
              '<b style="' +
                Array.from({ length: 65 }, (_, n) => '--x' + n + ':a;').join(
                  '',
                ) +
                '">x</b>',
            ),
          ),
        ];
        const ambiguous = (body, start, size) => ({
          ...item(utf8(body)),
          context: true,
          fragmentOffset: start,
          fragmentBytes: size,
        });
        values.push(ambiguous('<p title="attribute">selected</p>', 10, 9));
        values.push(ambiguous('<script>script text</script>', 8, 11));
        values.push(ambiguous('<p><!-- comment --></p>', 7, 7));
        // The HTML parser foster-parents these bytes outside the marker range.
        // Refuse rather than silently discarding selected text during repair.
        values.push(
          ambiguous(
            '<table><tr>selected outside cells</tr></table>',
            11,
            'selected outside cells'.length,
          ),
        );
        const bad = values.map((value) => refuses(value));
        const expansion = refuses(item(utf8('&'.repeat(100))), 101);
        const large = new Uint8Array(16777216 - 32);
        large.fill(65);
        const full = window.normalize(item(large));
        const depth = window.normalize(
          item(utf8('<div>'.repeat(128) + 'x' + '</div>'.repeat(128))),
        );
        return {
          preflight,
          creations,
          bad,
          expansion,
          fullBytes: utf8(full.html).length,
          depthBytes: utf8(depth.html).length,
        };
      });
      assert.equal(results.preflight, true);
      assert.equal(results.creations, 0);
      assert.ok(results.bad.every(Boolean), JSON.stringify(results.bad));
      assert.equal(results.expansion, true);
      assert.equal(results.fullBytes, 16777216 - 32);
      assert.equal(results.depthBytes, 128 * 11 + 1);
    });
  },
);
