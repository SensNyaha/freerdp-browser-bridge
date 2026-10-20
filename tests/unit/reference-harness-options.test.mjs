import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReferenceHarnessOptions } from '../../scripts/reference-harness-options.mjs';

test('reference harness keeps bundled default and accepts explicit smoke/profile options', () => {
  assert.deepEqual(parseReferenceHarnessOptions([]), {
    smoke: false,
    receipt: undefined,
  });
  assert.deepEqual(parseReferenceHarnessOptions(['--smoke']), {
    smoke: true,
    receipt: undefined,
  });
  assert.deepEqual(
    parseReferenceHarnessOptions([
      '--smoke',
      '--native-receipt',
      'build/native-clean-7dEHpn/receipt.json',
    ]),
    {
      smoke: true,
      receipt: 'build/native-clean-7dEHpn/receipt.json',
    },
  );
  assert.deepEqual(
    parseReferenceHarnessOptions([
      '--native-receipt',
      'build\\native-clean-7dEHpn\\receipt.json',
    ]),
    {
      smoke: false,
      receipt: 'build\\native-clean-7dEHpn\\receipt.json',
    },
  );
  assert.deepEqual(
    parseReferenceHarnessOptions([
      '--native-receipt',
      'build/native-clean-7dEHpn/receipt.json',
      '--smoke',
    ]),
    {
      smoke: true,
      receipt: 'build/native-clean-7dEHpn/receipt.json',
    },
  );
});

test('reference harness rejects duplicate, unknown and traversing options', () => {
  for (const args of [
    null,
    ['--smoke', '--smoke'],
    ['--native-receipt'],
    ['--native-receipt', 'build/bundled/receipt.json'],
    ['--native-receipt', 'build/native-clean-x/../receipt.json'],
    [
      '--native-receipt',
      'build/native-clean-x/receipt.json',
      '--native-receipt',
      'build/native-clean-y/receipt.json',
    ],
    ['--unknown'],
  ])
    assert.throws(() => parseReferenceHarnessOptions(args), {
      message:
        'Run the local Windows reference harness with optional --smoke and --native-receipt build/native-clean-ID/receipt.json',
    });
});
