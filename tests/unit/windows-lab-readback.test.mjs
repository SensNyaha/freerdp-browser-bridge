import test from 'node:test';
import assert from 'node:assert/strict';
import { requireWindowsLabReadback } from '../../scripts/windows-lab-readback.mjs';

test('Windows lab readback accepts only exact acknowledged UTF8 and wipes its owned result', () => {
  const expected = 'Bridge — Привет 日本語 😀';
  const text = Buffer.from(expected);
  requireWindowsLabReadback({ status: 'accepted', text }, expected);
  assert.ok(text.every((byte) => byte === 0));
});

test('Windows lab readback wipes mismatches/refusals and reports no remote contents', () => {
  for (const status of ['accepted', 'refused', 'stale', 'unavailable']) {
    const text = Buffer.from('synthetic-unexpected-remote-content');
    assert.throws(
      () => requireWindowsLabReadback({ status, text }, 'known-test-value'),
      { message: 'LAB_APPLICATION_READBACK_MISMATCH' },
    );
    assert.ok(text.every((byte) => byte === 0));
  }
});

test('Windows lab readback refuses missing/oversized expectations with fixed errors and retires bytes', () => {
  for (const expected of [null, 'x'.repeat(1025)]) {
    const text = Buffer.from('fixture');
    assert.throws(
      () => requireWindowsLabReadback({ status: 'accepted', text }, expected),
      {
        message: 'LAB_APPLICATION_READBACK_MISMATCH',
      },
    );
    assert.ok(text.every((byte) => byte === 0));
  }
  assert.throws(() => requireWindowsLabReadback(undefined, 'fixture'), {
    message: 'LAB_APPLICATION_READBACK_MISMATCH',
  });
});
