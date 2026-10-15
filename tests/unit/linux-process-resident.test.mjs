import test from 'node:test';
import assert from 'node:assert/strict';
import {
  linuxResidentReceipt,
  linuxWorkerResidentBytes,
} from '../../scripts/linux-process-resident.mjs';

test('Linux resident receipt accepts one kernel KiB scalar without exposing unrelated process data', () => {
  assert.equal(
    linuxResidentReceipt(
      'Name:\tsynthetic-private-process\nVmRSS:\t 12345 kB\nThreads:\t4\n',
    ),
    12641280,
  );
  for (const value of [
    '',
    'VmRSS: 0 kB\n',
    'VmRSS: -1 kB\n',
    'VmRSS: 1 MB\n',
    'VmRSS: 1 kB\nVmRSS: 2 kB\n',
    'VmRSS: 9999999999999 kB\n',
    'synthetic-secret'.repeat(1200),
    'prefix VmRSS: 1 kB\n',
  ])
    assert.throws(() => linuxResidentReceipt(value), {
      message: 'LAB_PROCESS_SAMPLE_INVALID',
    });
});
test('Linux resident reader refuses invalid process identities before filesystem access', async () => {
  for (const pid of [0, -1, 0x80000000, 1.5, '1', undefined])
    await assert.rejects(linuxWorkerResidentBytes(pid), {
      message: 'LAB_PROCESS_SAMPLE_INVALID',
    });
});
