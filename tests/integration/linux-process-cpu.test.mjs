import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { linuxWorkerCpuMicros } from '../../packages/node-bridge/dist/index.js';

const binary = resolve(
  process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
);
const workerPath = join(binary, 'rdp-worker');
const linux = { skip: process.platform !== 'linux', timeout: 15000 };

test(
  'actual Linux host CPU primitive: owned test-process counter grows across bounded local work',
  linux,
  async () => {
    const before = await linuxWorkerCpuMicros(process.pid, workerPath);
    const until = performance.now() + 200;
    while (performance.now() < until) {
      /* Bounded own-process CPU control; no RDP in Node. */
    }
    const after = await linuxWorkerCpuMicros(process.pid, workerPath);
    assert.ok(Number.isSafeInteger(before) && before >= 0);
    assert.ok(Number.isSafeInteger(after) && after > before);
  },
);

test(
  'actual Linux CPU helper: invalid command/PID grammar refuses before producing any receipt',
  linux,
  async () => {
    for (const args of [
      [],
      ['--unknown', '1'],
      ['--process-cpu-micros'],
      ['--process-cpu-micros', '0'],
      ['--process-cpu-micros', '-1'],
      ['--process-cpu-micros', '1x'],
      ['--process-cpu-micros', '2147483648'],
      ['--process-cpu-micros', '1', 'extra'],
    ])
      await assert.rejects(
        promisify(execFile)(join(binary, 'rdp-process-query'), args, {
          timeout: 2000,
          maxBuffer: 128,
          encoding: 'utf8',
          env: { PATH: '' },
        }),
        (error) => {
          assert.equal(error.code, 2);
          assert.equal(error.stdout, '');
          assert.equal(error.stderr, '');
          return true;
        },
      );
  },
);
