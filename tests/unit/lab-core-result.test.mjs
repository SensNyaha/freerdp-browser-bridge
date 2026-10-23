import test from 'node:test';
import assert from 'node:assert/strict';
import { requireLabCoreResult } from '../../scripts/lab-core-result.mjs';

test('lab strict acceptance requires exact certificate refusal, not another failed connection', () => {
  assert.doesNotThrow(() =>
    requireLabCoreResult('strict', {
      state: 'failed',
      error: 'RDP_CERTIFICATE_REJECTED',
    }),
  );
  for (const result of [
    undefined,
    null,
    {},
    { state: 'failed' },
    { state: 'failed', error: 'RDP_AUTHENTICATION_FAILED' },
    { state: 'failed', error: 'RDP_CONNECT_TIMEOUT' },
    { state: 'connected', error: 'NONE' },
    { state: 'connecting', error: 'RDP_CERTIFICATE_REJECTED' },
    { state: 'inspected', error: 'RDP_CERTIFICATE_REJECTED' },
  ])
    assert.throws(
      () => requireLabCoreResult('strict', result),
      /^Error: LAB_ACTIVATION_MISMATCH$/,
    );
});

test('lab connect and memory acceptance require the connected/no-error result', () => {
  for (const mode of ['connect', 'memory']) {
    assert.doesNotThrow(() =>
      requireLabCoreResult(mode, { state: 'connected', error: 'NONE' }),
    );
    for (const result of [
      { state: 'failed', error: 'RDP_CERTIFICATE_REJECTED' },
      { state: 'connected', error: 'RDP_AUTHENTICATION_FAILED' },
      { state: 'awaiting-user', error: 'NONE' },
      { state: 'connected' },
      null,
    ])
      assert.throws(() => requireLabCoreResult(mode, result), {
        message: 'LAB_ACTIVATION_MISMATCH',
      });
  }
});

test('lab inspection result is separate and unknown modes never accept diagnostics', () => {
  assert.doesNotThrow(() =>
    requireLabCoreResult('inspect', { state: 'inspected' }),
  );
  for (const [mode, result] of [
    ['inspect', { state: 'failed', error: 'RDP_CERTIFICATE_REJECTED' }],
    ['inspect', { state: 'connected', error: 'NONE' }],
    ['ignored', { state: 'connected', error: 'NONE' }],
    [undefined, { state: 'failed', error: 'RDP_CERTIFICATE_REJECTED' }],
    [
      'strict',
      { state: 'failed', error: 'synthetic-diagnostic-not-forwarded' },
    ],
  ])
    assert.throws(() => requireLabCoreResult(mode, result), {
      message: 'LAB_ACTIVATION_MISMATCH',
    });
});
