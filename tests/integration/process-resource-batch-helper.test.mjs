import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { processResourceBatchReceipt } from '../../packages/node-bridge/dist/process-resource-batch-codec.js';

// Explicit prepared-helper profile; this does not activate production batching.
const batchProfile =
  process.platform === 'win32' &&
  process.env.BRIDGE_TEST_RESOURCE_BATCH_HELPER === '1';
const helper = resolve(
  process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
  'rdp-runtime-directory.exe',
);
const execute = promisify(execFile);
async function run(args) {
  const execution = execute(helper, args, {
    windowsHide: true,
    timeout: 2000,
    maxBuffer: 2048,
    encoding: 'utf8',
    env: {
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.SystemRoot,
      PATH: '',
    },
  });
  const closed = new Promise((done) => execution.child.once('close', done));
  try {
    return { ...(await execution), code: 0 };
  } catch (error) {
    assert.ok(Number.isInteger(error.code));
    return { stdout: error.stdout, stderr: error.stderr, code: error.code };
  } finally {
    await closed;
  }
}

test(
  'prepared native batch helper: one through sixteen owned-process samples retire before receipt',
  { skip: !batchProfile, timeout: 15000 },
  async () => {
    for (const count of [1, 16]) {
      const result = await run([
        '--process-resources-batch',
        Array(count).fill(process.pid).join(','),
      ]);
      assert.equal(result.code, 0);
      assert.equal(result.stderr, '');
      assert.ok(Buffer.byteLength(result.stdout) <= 2048);
      const values = processResourceBatchReceipt(result.stdout, count);
      let preceding = 0;
      for (const value of values) {
        assert.equal(value.error, 0);
        assert.ok(value.bytes > 0);
        assert.ok(value.micros >= preceding);
        preceding = value.micros;
      }
    }
  },
);

test(
  'prepared native batch helper: target refusal stays positional and preserves sibling samples',
  { skip: !batchProfile, timeout: 15000 },
  async () => {
    const result = await run([
      '--process-resources-batch',
      [process.pid, 0xffffffff, process.pid].join(','),
    ]);
    assert.equal(result.code, 0);
    assert.equal(result.stderr, '');
    const values = processResourceBatchReceipt(result.stdout, 3);
    assert.equal(values[0].error, 0);
    assert.ok(values[0].bytes > 0);
    assert.equal(values[1].bytes, 0);
    assert.equal(values[1].micros, 0);
    assert.ok(values[1].error > 0);
    assert.equal(values[2].error, 0);
    assert.ok(values[2].bytes > 0);
    assert.ok(values[2].micros >= values[0].micros);
    const all = await run([
      '--process-resources-batch',
      Array(16).fill(0xffffffff).join(','),
    ]);
    assert.equal(all.code, 0);
    assert.equal(all.stderr, '');
    for (const value of processResourceBatchReceipt(all.stdout, 16))
      assert.ok(value.error > 0 && value.bytes === 0 && value.micros === 0);
  },
);

test(
  'prepared native batch helper: invalid complete grammar and arity produce no receipt',
  { skip: !batchProfile, timeout: 15000 },
  async () => {
    for (const value of [
      '',
      '0',
      '-1',
      '+1',
      '1,0',
      '1,,2',
      '1,',
      ',1',
      '1;2',
      '1,4294967296',
      '1,00000000001',
      '\uff11',
      '1'.repeat(176),
      Array(17).fill(1).join(','),
    ])
      assert.deepEqual(await run(['--process-resources-batch', value]), {
        stdout: '',
        stderr: '',
        code: 2,
      });
    for (const args of [
      ['--process-resources-batch'],
      ['--process-resources-batch', String(process.pid), 'extra'],
    ])
      assert.deepEqual(await run(args), { stdout: '', stderr: '', code: 2 });
  },
);
