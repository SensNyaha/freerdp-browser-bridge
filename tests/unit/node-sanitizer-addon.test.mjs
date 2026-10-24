import test from 'node:test';
import assert from 'node:assert/strict';
import { assessSanitizerAddonTap } from '../../scripts/test-node-sanitizer-addon.mjs';

const connected =
  'actual packet private settings/secret: local connection refusal leaves heartbeat healthy with no credentials in argv/env';
function tap(entries, pass, skip) {
  return (
    entries.join('\n') +
    `\n# tests ${entries.length}\n# pass ${pass}\n# fail 0\n# skipped ${skip}\n`
  );
}

test('addon gate refuses empty or success-only output without the required actual tests', () => {
  for (const text of ['', '# pass 14\n# fail 0\n# skipped 0\n'])
    assert.throws(() => assessSanitizerAddonTap(text, 14, false), {
      message: 'SANITIZER_ADDON_REQUIRED_TESTS_INCOMPLETE',
    });
  const output = tap(['ok 1 - actual process'], 1, 0);
  assert.deepEqual(assessSanitizerAddonTap(output, 1, false), {
    passed: 1,
    skipped: 0,
  });
  assert.throws(() => assessSanitizerAddonTap(output, 14, false));
});

test('addon gate refuses arbitrary skips, TODO and failure even with a successful summary', () => {
  for (const entry of [
    'ok 1 - actual process # SKIP missing binary',
    'ok 1 - actual process # TODO not implemented',
    'not ok 1 - actual process',
  ])
    assert.throws(() => assessSanitizerAddonTap(tap([entry], 1, 0), 1, false));
});

test('only the named connected-settings case may be skipped by the foundation profile', () => {
  const output = tap(
    [
      'ok 1 - actual addon process',
      'ok 2 - ' + connected + ' # SKIP foundation lacks native settings',
    ],
    1,
    1,
  );
  assert.deepEqual(assessSanitizerAddonTap(output, 2, true), {
    passed: 1,
    skipped: 1,
  });
  assert.throws(() => assessSanitizerAddonTap(output, 2, false));
  assert.throws(() =>
    assessSanitizerAddonTap(
      output.replace('foundation lacks native settings', 'missing binary'),
      2,
      true,
    ),
  );
  assert.throws(() =>
    assessSanitizerAddonTap(
      output.replace(connected, 'required lifecycle'),
      2,
      true,
    ),
  );
});
