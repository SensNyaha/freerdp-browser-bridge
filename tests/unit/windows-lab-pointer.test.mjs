import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePointerReceipt } from '../../scripts/windows-lab-pointer.mjs';

const valid = () => ({
  v: 1,
  fixture: 'bridge-pointer-v1',
  down: [0, 1, 65535],
  up: [0, 1, 65535],
  moves: 65535,
  dragX: 300,
  dragY: 200,
  wheel: { left: 1, right: 1, up: 1, down: 1 },
  buttons: 0,
});
test('pointer lab receipt admits only the fixed bounded scalar schema', () => {
  const value = valid();
  assert.deepEqual(parsePointerReceipt(JSON.stringify(value)), value);
});
test('pointer lab receipt refuses unknown application content and invalid boundaries without echo', () => {
  const canary = 'unrelated-application-content';
  const values = [
    undefined,
    null,
    canary,
    canary.repeat(50),
    'null',
    '{}',
    JSON.stringify({ ...valid(), fixture: canary }),
    JSON.stringify({ ...valid(), text: canary }),
    JSON.stringify({ ...valid(), down: [1, 2] }),
    JSON.stringify({ ...valid(), up: [1, 2, 65536] }),
    JSON.stringify({ ...valid(), moves: -1 }),
    JSON.stringify({ ...valid(), dragY: 0.5 }),
    JSON.stringify({ ...valid(), buttons: 8 }),
    JSON.stringify({ ...valid(), wheel: { ...valid().wheel, text: canary } }),
    JSON.stringify({ ...valid(), wheel: null }),
  ];
  for (const value of values)
    assert.throws(
      () => parsePointerReceipt(value),
      (error) =>
        error.message === 'LAB_POINTER_RECEIPT_REFUSED' &&
        !error.message.includes(canary),
    );
});
