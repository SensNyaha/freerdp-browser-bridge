import test from 'node:test';
import assert from 'node:assert/strict';
import {
  processCpuReceipt,
  windowsWorkerCpuMicros,
  linuxWorkerCpuMicros,
  ProcessSampleError,
} from '../../packages/node-bridge/dist/index.js';

test('typed CPU receipt preserves zero and the exact integer ceiling', () => {
  assert.equal(processCpuReceipt('{"v":1,"micros":0,"error":0}\n'), 0);
  assert.equal(
    processCpuReceipt(' { "micros": 9007199254740991, "error": 0, "v": 1 } '),
    Number.MAX_SAFE_INTEGER,
  );
  assert.equal(processCpuReceipt('{"error":0,"v":1,"micros":12345}'), 12345);
  for (const text of [
    undefined,
    null,
    [],
    'x'.repeat(129),
    '{}',
    'null',
    '{"v":1,"micros":-1,"error":0}',
    '{"v":1,"micros":-0,"error":0}',
    '{"v":1,"micros":0.5,"error":0}',
    '{"v":1,"micros":9007199254740992,"error":0}',
    '{"v":1,"micros":"1","error":0}',
    '{"v":1,"micros":1,"error":5}',
    '{"v":2,"micros":1,"error":0}',
    '{"v":1,"micros":1,"error":0,"extra":"private-diagnostic"}',
    '{"v":1,"v":1,"micros":0,"error":0}',
    '{"v":1,"micros":0,"micros":1,"error":0}',
    '{"v":1,"micros":0,"error":0,"error":1}',
    '{"v":1,"micros":0,"error":0,"\\u0076":1}',
    '{"v":1,"micros":0,"error":0,"\\u006dicro\\u0073":1}',
    '{"v":1,"micros":0,"error":0,"\\u0065rror":0}',
    '{"v":1,"micros":0}',
  ])
    assert.throws(
      () => processCpuReceipt(text),
      (error) => {
        assert.ok(error instanceof ProcessSampleError);
        assert.equal(error.code, 'PROCESS_SAMPLE_INVALID');
        assert.equal(error.message, 'PROCESS_SAMPLE_INVALID');
        assert.equal(error.cause, undefined);
        return true;
      },
    );
});

test('typed CPU query validates PID before platform/helper/cancellation work', async () => {
  const abort = new AbortController();
  abort.abort('private-reason');
  for (const pid of [0, -1, 1.5, NaN, Infinity, 0x100000000, '1', undefined])
    await assert.rejects(windowsWorkerCpuMicros(pid, 'unused', abort.signal), {
      code: 'PROCESS_SAMPLE_INVALID',
      message: 'PROCESS_SAMPLE_INVALID',
    });
});

test('typed CPU pre-cancellation never acquires a helper or exposes its reason', async () => {
  const abort = new AbortController();
  abort.abort('private-reason');
  await assert.rejects(
    windowsWorkerCpuMicros(1, 'unused', abort.signal),
    (error) => {
      assert.ok(error instanceof ProcessSampleError);
      assert.equal(error.code, 'PROCESS_SAMPLE_CANCELLED');
      assert.equal(error.message, 'PROCESS_SAMPLE_CANCELLED');
      assert.equal(error.cause, undefined);
      return true;
    },
  );
  await assert.rejects(windowsWorkerCpuMicros(1, ''), {
    code: 'PROCESS_SAMPLE_UNAVAILABLE',
  });
});

test('typed Linux CPU query validates PID before platform/helper work and hides cancellation reasons', async () => {
  const abort = new AbortController();
  abort.abort('private-reason');
  for (const pid of [0, -1, 1.5, NaN, Infinity, 0x80000000, '1', undefined])
    await assert.rejects(linuxWorkerCpuMicros(pid, 'unused', abort.signal), {
      code: 'PROCESS_SAMPLE_INVALID',
    });
  await assert.rejects(linuxWorkerCpuMicros(1, 'unused', abort.signal), {
    code: 'PROCESS_SAMPLE_CANCELLED',
    message: 'PROCESS_SAMPLE_CANCELLED',
  });
  await assert.rejects(linuxWorkerCpuMicros(1, ''), {
    code: 'PROCESS_SAMPLE_UNAVAILABLE',
  });
});
