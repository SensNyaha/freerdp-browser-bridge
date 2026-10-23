import test from 'node:test';
import assert from 'node:assert/strict';
import { ProcessSampleError } from '../../packages/node-bridge/dist/index.js';
import {
  processResourceBatchReceipt,
  processResourceBatchLimit,
  processResourceBatchBytes,
} from '../../packages/node-bridge/dist/process-resource-batch-codec.js';

const record = (items) => JSON.stringify({ v: 1, items });
const good = { bytes: 123456, micros: 9, error: 0 };
const refused = { bytes: 0, micros: 0, error: 5 };
const invalid = (text, ...counts) =>
  assert.throws(
    () => processResourceBatchReceipt(text, counts.length ? counts[0] : 1),
    (error) => {
      assert.ok(error instanceof ProcessSampleError);
      assert.equal(error.code, 'PROCESS_SAMPLE_INVALID');
      assert.equal(error.message, 'PROCESS_SAMPLE_INVALID');
      assert.equal(error.cause, undefined);
      return true;
    },
  );

test('batch host receipt preserves positional success and independent refusal scalars', () => {
  const values = [good, refused, good];
  for (const suffix of ['', '\n', '\r\n'])
    assert.deepEqual(
      processResourceBatchReceipt(record(values) + suffix, 3),
      values,
    );
  const copy = processResourceBatchReceipt(record(values), 3);
  copy[0].bytes = 0;
  assert.deepEqual(processResourceBatchReceipt(record(values), 3), values);
});

test('batch host receipt admits sixteen exact maximal scalar records within its byte bound', () => {
  assert.equal(processResourceBatchLimit, 16);
  assert.equal(processResourceBatchBytes, 2048);
  const maximum = {
    bytes: Number.MAX_SAFE_INTEGER,
    micros: Number.MAX_SAFE_INTEGER,
    error: 0,
  };
  const values = Array.from({ length: 16 }, () => maximum);
  const text = record(values) + '\r\n';
  assert.ok(Buffer.byteLength(text) <= processResourceBatchBytes);
  assert.deepEqual(processResourceBatchReceipt(text, 16), values);
  assert.deepEqual(
    processResourceBatchReceipt(
      record([{ bytes: 0, micros: 0, error: 0xffffffff }]),
      1,
    ),
    [{ bytes: 0, micros: 0, error: 0xffffffff }],
  );
  invalid(record([...values, maximum]), 16);
  invalid(record(values), 15);
  invalid(record(values.slice(0, 15)), 16);
});

test('batch host receipt refuses inexact counters and inconsistent per-item errors', () => {
  for (const field of ['bytes', 'micros', 'error'])
    for (const value of [
      -1,
      0.5,
      null,
      'synthetic-private',
      Number.MAX_SAFE_INTEGER + 1,
    ])
      invalid(record([{ ...good, [field]: value }]));
  for (const value of [
    { bytes: 0, micros: 0, error: 0 },
    { bytes: 1, micros: 0, error: 5 },
    { bytes: 0, micros: 1, error: 5 },
    { bytes: 0, micros: 0, error: 0x100000000 },
  ])
    invalid(record([value]));
  invalid(record([good]).replace('123456', '-0'));
  invalid(record([good]).replace('123456', '1e3'));
  invalid(record([good]).replace('123456', '0123456'));
});

test('batch host receipt refuses malformed duplicate escaped and foreign structure without raw data', () => {
  const text = record([good]);
  for (const value of [
    undefined,
    null,
    [],
    '',
    '{}',
    'null',
    'x'.repeat(2049),
    record([]),
    text + '\n\n',
    text + ' ',
    ' ' + text,
    text.replace('"v":1', '"v":2'),
    text.replace('"v":1', '"v":1,"v":1'),
    text.replace('"items":', '"extra":'),
    text.replace('"items":', '"\\u0069tems":'),
    text.replace('"bytes":', '"\\u0062ytes":'),
    text.replace('"bytes":123456', '"bytes":123456,"bytes":1'),
    text.replace(
      '"bytes":123456',
      '"bytes":123456,"private":"synthetic-private"',
    ),
    text.replace('"bytes":123456,"micros":9', '"micros":9,"bytes":123456'),
    text.slice(0, -1),
    text.replace(']}', ',]}'),
    text + '\0',
  ])
    invalid(value);
  for (const count of [0, -1, 1.5, 17, NaN, Infinity, undefined, '1'])
    invalid(text, count);
});
