import test from 'node:test';
import assert from 'node:assert/strict';
import {
  htmlLabDocument,
  parseHtmlLabReceipt,
} from '../../scripts/html-rdp-lab-fixture.mjs';

test('owned remote HTML document fits the native CF_HTML header profile and rejects arbitrary substitutions', async () => {
  const nonce = 'a'.repeat(32);
  const { document, uri } = await htmlLabDocument(nonce);
  assert.ok(uri.length <= 3500);
  assert.equal(Buffer.from(uri.split(',')[1], 'base64').toString(), document);
  assert.ok(document.includes(nonce));
  assert.equal(document.includes('__BRIDGE_ID__'), false);
  assert.equal(
    /<script[^>]+src=|fetch\(|XMLHttpRequest|navigator\.clipboard/.test(
      document,
    ),
    false,
  );
  for (const value of [
    undefined,
    '',
    'a'.repeat(31),
    '";alert(1);//',
    'A'.repeat(32),
  ])
    await assert.rejects(htmlLabDocument(value), /HTML_LAB_FIXTURE_INVALID/);
});

test('remote HTML receipt accepts only the owned bounded scalar schema', () => {
  const nonce = 'b'.repeat(32);
  const receipt = {
    v: 1,
    id: nonce,
    ready: true,
    source: 2,
    pastes: 1,
    ok: true,
    html: true,
    text: true,
  };
  assert.deepEqual(parseHtmlLabReceipt(JSON.stringify(receipt), nonce), {
    source: 2,
    pastes: 1,
    ok: true,
    html: true,
    text: true,
  });
  for (const value of [
    {},
    [],
    null,
    { ...receipt, content: 'unexpected' },
    { ...receipt, id: 'c'.repeat(32) },
    { ...receipt, source: 5 },
    { ...receipt, pastes: -1 },
    { ...receipt, html: 'true' },
    { ...receipt, ready: false },
    { ...receipt, v: 2 },
  ])
    assert.throws(
      () => parseHtmlLabReceipt(JSON.stringify(value), nonce),
      /HTML_LAB_FIXTURE_INVALID/,
    );
  for (const value of ['{', ' '.repeat(513), undefined])
    assert.throws(
      () => parseHtmlLabReceipt(value, nonce),
      /HTML_LAB_FIXTURE_INVALID/,
    );
});
