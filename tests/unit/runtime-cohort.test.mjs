import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtemp,
  writeFile,
  rm,
  symlink,
  truncate,
  realpath,
  readdir,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseRuntimeCohort,
  selectRuntimeCohort,
} from '../../packages/node-bridge/dist/runtime-cohort.js';
import {
  parseRuntimeRecoveryReceipt,
  recoverRuntimeSessions,
} from '../../packages/node-bridge/dist/runtime-recovery.js';
import { WorkerProcess } from '../../packages/node-bridge/dist/index.js';
const suffix = process.platform === 'win32' ? '.exe' : '';
const digest = (value) => createHash('sha256').update(value).digest('hex');
const profile = () => ({
  v: 1,
  directorySchema: 1,
  worker: 'rdp-worker' + suffix,
  helper: 'rdp-runtime-recovery' + suffix,
  workerSha256: digest('worker'),
  helperSha256: digest('helper'),
});
async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'bridge-cohort-'));
  const metadata = join(root, 'rdp-worker.runtime.json');
  const worker = join(root, profile().worker);
  try {
    await writeFile(worker, 'worker');
    await writeFile(join(root, profile().helper), 'helper');
    await run(root, worker, metadata);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
test('runtime cohort: schema binds exact platform names, lowercase hashes and no extra fields', () => {
  const original = profile();
  const parsed = parseRuntimeCohort(original);
  assert.deepEqual(parsed, original);
  assert.notEqual(parsed, original);
  for (const change of [
    { v: 2 },
    { directorySchema: 2 },
    { worker: '../rdp-worker' },
    { helper: '/tmp/helper' },
    { workerSha256: 'A'.repeat(64) },
    { helperSha256: 'x'.repeat(64) },
    { extra: true },
    { workerSha256: null },
  ])
    assert.throws(() => parseRuntimeCohort({ ...original, ...change }), {
      code: 'RUNTIME_RECOVERY_INVALID',
    });
  for (const input of [null, undefined, [], {}, 'text'])
    assert.throws(() => parseRuntimeCohort(input), {
      code: 'RUNTIME_RECOVERY_INVALID',
    });
});
test('runtime cohort: absent manifest preserves legacy; verified pair returns immutable canonical paths', async () => {
  await fixture(async (root, worker, metadata) => {
    assert.equal(await selectRuntimeCohort(worker), undefined);
    await writeFile(metadata, JSON.stringify(profile()));
    const cohort = await selectRuntimeCohort(worker);
    assert.equal(cohort.workerPath, await realpath(worker));
    assert.equal(
      cohort.helperPath,
      await realpath(join(root, profile().helper)),
    );
    assert.equal(Object.isFrozen(cohort), true);
    const fixtureWorker = join(root, 'fixture-worker' + suffix);
    await writeFile(fixtureWorker, 'synthetic');
    assert.equal(await selectRuntimeCohort(fixtureWorker), undefined);
  });
});
test('runtime cohort: changed worker/helper bytes and missing helper never fall back to legacy', async () => {
  await fixture(async (root, worker, metadata) => {
    await writeFile(metadata, JSON.stringify(profile()));
    await writeFile(worker, 'changed');
    await assert.rejects(selectRuntimeCohort(worker), {
      code: 'RUNTIME_RECOVERY_MISMATCH',
    });
    await writeFile(worker, 'worker');
    await writeFile(join(root, profile().helper), 'changed');
    await assert.rejects(selectRuntimeCohort(worker), {
      code: 'RUNTIME_RECOVERY_MISMATCH',
    });
    await rm(join(root, profile().helper));
    await assert.rejects(selectRuntimeCohort(worker), {
      code: 'RUNTIME_RECOVERY_INVALID',
    });
  });
});
test('runtime cohort: malformed oversized empty and growing-size metadata are refused before hashing', async () => {
  await fixture(async (_root, worker, metadata) => {
    for (const value of [
      '',
      'invalid',
      'x'.repeat(8193),
      JSON.stringify({ ...profile(), directorySchema: 2 }),
    ]) {
      await writeFile(metadata, value);
      await assert.rejects(selectRuntimeCohort(worker), {
        code: 'RUNTIME_RECOVERY_INVALID',
      });
    }
    await writeFile(metadata, JSON.stringify(profile()));
    await truncate(worker, 64 * 1024 * 1024 + 1);
    await assert.rejects(selectRuntimeCohort(worker), {
      code: 'RUNTIME_RECOVERY_INVALID',
    });
  });
});
test(
  'runtime cohort: symlinked manifest and helper are refused without following',
  { skip: process.platform !== 'linux' },
  async () =>
    fixture(async (root, worker, metadata) => {
      const actual = join(root, 'metadata');
      await writeFile(actual, JSON.stringify(profile()));
      await symlink(actual, metadata);
      await assert.rejects(selectRuntimeCohort(worker), {
        code: 'RUNTIME_RECOVERY_INVALID',
      });
      await rm(metadata);
      await writeFile(metadata, JSON.stringify(profile()));
      const helper = join(root, profile().helper);
      await rm(helper);
      await symlink(worker, helper);
      await assert.rejects(selectRuntimeCohort(worker), {
        code: 'RUNTIME_RECOVERY_INVALID',
      });
    }),
);
test('runtime recovery: cancelled and expired budgets refuse without echoing a caller abort reason', async () => {
  const controller = new AbortController();
  controller.abort('secret-sentinel');
  await assert.rejects(
    selectRuntimeCohort(process.execPath, {
      due: performance.now() + 1000,
      signal: controller.signal,
    }),
    {
      code: 'RUNTIME_RECOVERY_CANCELLED',
      message: 'RUNTIME_RECOVERY_CANCELLED',
    },
  );
  await assert.rejects(
    selectRuntimeCohort(process.execPath, { due: performance.now() - 1 }),
    { code: 'RUNTIME_RECOVERY_TIMEOUT' },
  );
  await assert.rejects(
    recoverRuntimeSessions({
      workerPath: process.execPath,
      runtimeRoot: tmpdir(),
      signal: controller.signal,
    }),
    {
      code: 'RUNTIME_RECOVERY_CANCELLED',
      message: 'RUNTIME_RECOVERY_CANCELLED',
    },
  );
});
test('runtime recovery: validate paths and finite scan budgets before filesystem/process work', async () => {
  const valid = { workerPath: process.execPath, runtimeRoot: tmpdir() };
  for (const change of [
    { workerPath: 'relative' },
    { runtimeRoot: 'relative' },
    { runtimeRoot: 'a\0b' },
    { maxEntries: 0 },
    { maxEntries: 1025 },
    { maxEntries: 1.5 },
    { timeoutMs: 0 },
    { timeoutMs: 60001 },
    { timeoutMs: NaN },
    { signal: {} },
  ])
    await assert.rejects(recoverRuntimeSessions({ ...valid, ...change }), {
      code: 'RUNTIME_RECOVERY_INVALID',
    });
  assert.deepEqual(await recoverRuntimeSessions(valid), {
    supported: false,
    complete: false,
    scanned: 0,
    removed: 0,
    active: 0,
    retained: 0,
  });
});
test('runtime recovery helper receipt: exact bounded UTF8 schema; no arbitrary content or unknown result', () => {
  for (const status of ['removed', 'busy', 'retained'])
    assert.equal(
      parseRuntimeRecoveryReceipt(
        Buffer.from(JSON.stringify({ v: 1, status })),
      ),
      status,
    );
  for (const value of [
    '',
    'x'.repeat(129),
    'null',
    '[]',
    '{}',
    JSON.stringify({ v: 2, status: 'removed' }),
    JSON.stringify({ v: 1, status: 'other' }),
    JSON.stringify({ v: 1, status: 'removed', secret: 'sentinel' }),
  ])
    assert.throws(() => parseRuntimeRecoveryReceipt(Buffer.from(value)), {
      code: 'RUNTIME_RECOVERY_UNAVAILABLE',
      message: 'RUNTIME_RECOVERY_UNAVAILABLE',
    });
  assert.throws(() => parseRuntimeRecoveryReceipt(Buffer.from([0xff])), {
    code: 'RUNTIME_RECOVERY_UNAVAILABLE',
  });
});

test('SDK runtime cohort: mismatched build refuses before root/session creation or worker spawn', async () => {
  await fixture(async (root, workerPath, metadata) => {
    await writeFile(
      metadata,
      JSON.stringify({ ...profile(), workerSha256: digest('different') }),
    );
    class ObservedWorker extends WorkerProcess {
      attempts = 0;
      spawnWorker() {
        ++this.attempts;
        throw new Error('synthetic-sentinel');
      }
    }
    const runtimeRoot = join(root, 'missing-runtime');
    const worker = new ObservedWorker({ workerPath, runtimeRoot });
    try {
      await assert.rejects(worker.start(), {
        code: 'RUNTIME_RECOVERY_MISMATCH',
        message: 'Worker operation failed (RUNTIME_RECOVERY_MISMATCH)',
      });
      assert.equal(worker.attempts, 0);
      await assert.rejects(readdir(runtimeRoot), { code: 'ENOENT' });
    } finally {
      await worker.close();
    }
  });
});
