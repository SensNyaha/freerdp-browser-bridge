import test from 'node:test';
import assert from 'node:assert/strict';
import {
  linuxResidentReceipt,
  processResidentReceipt,
  linuxWorkerResidentBytes,
  windowsWorkerResidentBytes,
  ProcessSampleError,
} from '../../packages/node-bridge/dist/index.js';

test('typed resident sampling preserves exact byte scalars and fixed error codes', () => {
  assert.equal(linuxResidentReceipt('VmRSS:\t12345 kB\n'), 12641280);
  assert.equal(
    processResidentReceipt('{"v":1,"bytes":12345,"error":0}\n'),
    12345,
  );
  for (const [parse, invalid] of [
    [linuxResidentReceipt, 'VmRSS: 1 kB\nVmRSS: 2 kB\n'],
    [linuxResidentReceipt, 'private-diagnostic'.repeat(1024)],
    [
      processResidentReceipt,
      '{"v":1,"bytes":12345,"error":0,"extra":"private-diagnostic"}',
    ],
    [processResidentReceipt, 'private-diagnostic'.repeat(16)],
  ]) {
    assert.throws(
      () => parse(invalid),
      (error) => {
        assert.ok(error instanceof ProcessSampleError);
        assert.equal(error.code, 'PROCESS_SAMPLE_INVALID');
        assert.equal(error.message, 'PROCESS_SAMPLE_INVALID');
        return true;
      },
    );
  }
});

test('typed platform resident readers reject invalid PID values before platform or helper access', async () => {
  for (const pid of [0, -1, 1.5, NaN, '1', undefined]) {
    await assert.rejects(linuxWorkerResidentBytes(pid), {
      code: 'PROCESS_SAMPLE_INVALID',
    });
    await assert.rejects(windowsWorkerResidentBytes(pid, ''), {
      code: 'PROCESS_SAMPLE_INVALID',
    });
  }
  await assert.rejects(linuxWorkerResidentBytes(0x80000000), {
    code: 'PROCESS_SAMPLE_INVALID',
  });
  await assert.rejects(windowsWorkerResidentBytes(0x100000000, ''), {
    code: 'PROCESS_SAMPLE_INVALID',
  });
});
