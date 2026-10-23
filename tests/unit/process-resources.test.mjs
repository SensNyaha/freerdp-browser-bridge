import test from 'node:test';
import assert from 'node:assert/strict';
import { ProcessSampleError } from '../../packages/node-bridge/dist/index.js';
import {
  processResourcesReceipt,
  windowsProcessResources,
} from '../../packages/node-bridge/dist/process-resources.js';

test('combined process receipt admits only bounded exact CPU/RSS scalars with unique literal keys', () => {
  assert.deepEqual(
    processResourcesReceipt('{"v":1,"bytes":1,"micros":0,"error":0}'),
    { bytes: 1, micros: 0 },
  );
  assert.deepEqual(
    processResourcesReceipt(
      '{"error":0,"bytes":9007199254740991,"v":1,"micros":9007199254740991}\n',
    ),
    { bytes: Number.MAX_SAFE_INTEGER, micros: Number.MAX_SAFE_INTEGER },
  );
  for (const text of [
    undefined,
    null,
    [],
    'x'.repeat(129),
    '{}',
    'null',
    '{"v":1,"bytes":0,"micros":0,"error":0}',
    '{"v":1,"bytes":1.5,"micros":0,"error":0}',
    '{"v":1,"bytes":9007199254740992,"micros":0,"error":0}',
    '{"v":1,"bytes":1,"micros":-0,"error":0}',
    '{"v":1,"bytes":1,"micros":-1,"error":0}',
    '{"v":1,"bytes":1,"micros":9007199254740992,"error":0}',
    '{"v":1,"bytes":1,"micros":"private","error":0}',
    '{"v":1,"bytes":1,"micros":0,"error":5}',
    '{"v":2,"bytes":1,"micros":0,"error":0}',
    '{"v":1,"bytes":1,"micros":0,"error":0,"bytes":2}',
    '{"v":1,"bytes":1,"micros":0,"error":0,"\\u0076":1}',
    '{"v":1,"bytes":1,"micros":0,"error":0,"extra":"private"}',
  ])
    assert.throws(
      () => processResourcesReceipt(text),
      (error) => {
        assert.ok(error instanceof ProcessSampleError);
        assert.equal(error.message, 'PROCESS_SAMPLE_INVALID');
        assert.equal(error.cause, undefined);
        return true;
      },
    );
});

test('combined process reader validates PID and pre-cancellation before any helper acquisition', async () => {
  const abort = new AbortController();
  abort.abort('private-reason');
  for (const pid of [0, -1, 1.5, NaN, Infinity, 0x100000000, '1'])
    await assert.rejects(windowsProcessResources(pid, 'unused', abort.signal), {
      code: 'PROCESS_SAMPLE_INVALID',
    });
  await assert.rejects(
    windowsProcessResources(1, 'unused', abort.signal),
    (error) => {
      assert.equal(error.message, 'PROCESS_SAMPLE_CANCELLED');
      assert.equal(error.cause, undefined);
      return true;
    },
  );
  await assert.rejects(windowsProcessResources(1, ''), {
    code: 'PROCESS_SAMPLE_UNAVAILABLE',
  });
});
