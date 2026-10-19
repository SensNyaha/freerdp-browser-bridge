import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import {
  resourceLabArguments,
  loadResourceLabProfile,
  resourceLabRequest,
} from '../../scripts/resource-lab-profile.mjs';

const project = resolve('.');
const fingerprint = 'sha256:' + 'a'.repeat(64);
const commit = 'bf217a504e54cc719880c228e82353382cd7d4fa';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('resource lab CPU-failure mode is explicit and preserves the ordinary healthy profile', () => {
  const args = [fingerprint, 'build/native-clean-example/receipt.json'];
  const healthy = resourceLabRequest(args),
    breach = resourceLabRequest(['--cpu-breach', ...args]);
  assert.equal(healthy.cpuBreach, false);
  assert.equal(healthy.limits.maxCpuPercent, 100);
  assert.equal(healthy.limits.cpuPollIntervalMs, 500);
  assert.equal(breach.cpuBreach, true);
  assert.equal(breach.limits.maxCpuPercent, 1);
  assert.equal(breach.limits.cpuPollIntervalMs, 5000);
  assert.equal(breach.limits.residentPollIntervalMs, 5000);
  assert.equal(breach.limits.cpuWindowMs, 1000);
  assert.equal(breach.limits.maxResidentBytes, healthy.limits.maxResidentBytes);
  assert.deepEqual(breach.nativeArgs, args);
  for (const bad of [
    ['--cpu-breach'],
    ['--other', ...args],
    ['--cpu-breach', ...args, 'extra'],
  ])
    assert.throws(() => resourceLabRequest(bad));
});

test('resource lab selection requires one verified fingerprint and an explicit isolated consumer receipt', async () => {
  const receipt = 'build/native-clean-example/receipt.json';
  assert.deepEqual(resourceLabArguments([fingerprint, receipt]), {
    fingerprint,
    receipt,
  });
  for (const args of [
    undefined,
    null,
    {},
    [],
    [fingerprint],
    ['bad', receipt],
    [fingerprint, receipt, 'extra'],
    [fingerprint, '../receipt.json'],
    [fingerprint, 'build/bundled/receipt.json'],
    [fingerprint, 'build/native-clean-a/../receipt.json'],
  ])
    assert.throws(() => resourceLabArguments(args), {
      message: 'Use verified sha256 fingerprint and isolated native receipt',
    });
  await assert.rejects(
    loadResourceLabProfile([fingerprint, receipt], project, 'unsupported'),
    { message: 'LAB_NATIVE_PROFILE_UNSUPPORTED' },
  );
});

test('resource lab receipt binds linked source profile and both worker/helper bytes before lab credentials', async () => {
  const root = await mkdtemp(resolve('build/native-clean-resource-profile-'));
  const receiptPath = join(root, 'receipt.json');
  const inputPath = relative(project, receiptPath);
  const worker = Buffer.from('unit worker artifact'),
    helper = Buffer.from('unit helper artifact');
  const body = {
    cleanNativeSource: true,
    prebuiltOutput: false,
    linked: true,
    sourceUnchanged: true,
    platform: 'win32',
    buildProfile: { buildType: 'Release' },
    fixture: relative(project, root),
    sdkSourceCommit: commit,
    sourceHash: 'b'.repeat(64),
    artifacts: {
      'rdp-worker.exe': sha(worker),
      'rdp-runtime-directory.exe': sha(helper),
    },
  };
  try {
    await mkdir(join(root, 'out'));
    await writeFile(join(root, 'out/rdp-worker.exe'), worker);
    await writeFile(join(root, 'out/rdp-runtime-directory.exe'), helper);
    const write = (value) => writeFile(receiptPath, JSON.stringify(value));
    await write(body);
    const value = await loadResourceLabProfile(
      [fingerprint, inputPath],
      project,
      'win32',
    );
    assert.equal(value.workerPath, join(root, 'out/rdp-worker.exe'));
    assert.equal(value.workerHash, sha(worker));
    assert.equal(value.helperHash, sha(helper));
    assert.equal(value.buildType, 'Release');
    await write({ ...body, buildProfile: { buildType: 'Debug' } });
    assert.equal(
      (await loadResourceLabProfile([fingerprint, inputPath], project, 'win32'))
        .buildType,
      'Debug',
    );
    for (const patch of [
      { cleanNativeSource: false },
      { prebuiltOutput: true },
      { linked: false },
      { sourceUnchanged: false },
      { platform: 'linux' },
      { buildProfile: { buildType: 'unknown' } },
      { fixture: 'build/other' },
      { sdkSourceCommit: '0'.repeat(40) },
      { sourceHash: 'bad' },
      { artifacts: { 'rdp-worker.exe': sha(worker) } },
      {
        artifacts: {
          ...body.artifacts,
          'rdp-runtime-directory.exe': '0'.repeat(64),
        },
      },
    ]) {
      await write({ ...body, ...patch });
      await assert.rejects(
        loadResourceLabProfile([fingerprint, inputPath], project, 'win32'),
        (error) => {
          assert.equal(error.message, 'LAB_NATIVE_PROFILE_INVALID');
          assert.equal(error.cause, undefined);
          return true;
        },
      );
    }
    await write(body);
    await writeFile(join(root, 'out/rdp-worker.exe'), 'changed');
    await assert.rejects(
      loadResourceLabProfile([fingerprint, inputPath], project, 'win32'),
      { message: 'LAB_NATIVE_PROFILE_INVALID' },
    );
    for (const text of ['private-receipt-content', 'x'.repeat(65537)]) {
      await writeFile(receiptPath, text);
      await assert.rejects(
        loadResourceLabProfile([fingerprint, inputPath], project, 'win32'),
        { message: 'LAB_NATIVE_PROFILE_INVALID' },
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('resource lab CLI invalid arguments refuse before private lab configuration access', () => {
  for (const args of [
    [],
    ['invalid'],
    [fingerprint, 'build/bundled/receipt.json'],
  ]) {
    const result = spawnSync(
      process.execPath,
      ['scripts/test-rdp-resource-lab.mjs', ...args],
      { encoding: 'utf8', timeout: 10000, maxBuffer: 65536, windowsHide: true },
    );
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(
      result.stderr,
      /Use verified sha256 fingerprint and isolated native receipt/,
    );
    assert.equal(result.stderr.includes('xrdp-lab.secrets'), false);
  }
  const missing = spawnSync(
    process.execPath,
    [
      'scripts/test-rdp-resource-lab.mjs',
      fingerprint,
      `build/native-clean-missing-${process.pid}/receipt.json`,
    ],
    { encoding: 'utf8', timeout: 10000, maxBuffer: 65536, windowsHide: true },
  );
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, '');
  assert.match(
    missing.stderr,
    process.platform === 'win32'
      ? /LAB_NATIVE_PROFILE_INVALID/
      : /LAB_NATIVE_PROFILE_UNSUPPORTED/,
  );
  assert.equal(missing.stderr.includes('xrdp-lab.secrets'), false);
});
