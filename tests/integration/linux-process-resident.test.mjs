import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { linuxWorkerResidentBytes } from '../../scripts/linux-process-resident.mjs';

test(
  'actual Linux proc resident reader samples current process and closes every descriptor',
  { skip: process.platform !== 'linux' },
  async () => {
    await linuxWorkerResidentBytes(process.pid);
    const before = (await readdir('/proc/self/fd')).length;
    for (let i = 0; i < 32; ++i) {
      const bytes = await linuxWorkerResidentBytes(process.pid);
      assert.ok(Number.isSafeInteger(bytes) && bytes > 0);
      assert.equal(bytes % 1024, 0);
    }
    assert.equal((await readdir('/proc/self/fd')).length, before);
  },
);
