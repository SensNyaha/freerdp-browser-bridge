import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { resourceApiLabRequest } from '../../scripts/resource-lab-profile.mjs';

test('public resource lab keeps RSS as default and requires exclusive CPU opt-in with unchanged native selection', () => {
  const args = [
    'sha256:' + 'a'.repeat(64),
    'build/native-clean-example/receipt.json',
  ];
  const rss = resourceApiLabRequest(args),
    cpu = resourceApiLabRequest(['--cpu-breach', ...args]);
  assert.equal(rss.memoryBreach, true);
  assert.equal(rss.cpuBreach, false);
  assert.equal(rss.limits.maxResidentBytes, 1);
  assert.equal(rss.limits.maxCpuPercent, 100);
  assert.equal(cpu.cpuBreach, true);
  assert.equal(cpu.memoryBreach, false);
  assert.equal(cpu.limits.maxCpuPercent, 1);
  assert.equal(cpu.limits.maxResidentBytes, 256 * 1024 * 1024);
  assert.equal(cpu.limits.cpuPollIntervalMs, 5000);
  assert.equal(cpu.limits.residentPollIntervalMs, 5000);
  assert.equal(cpu.limits.cpuWindowMs, 1000);
  assert.deepEqual(cpu.nativeArgs, args);
  for (const invalid of [
    undefined,
    {},
    [],
    ['--cpu-breach'],
    ['--memory-breach', ...args],
    ['--cpu-breach', '--memory-breach', ...args],
    ['--cpu-breach', ...args, 'extra'],
  ])
    assert.throws(() => resourceApiLabRequest(invalid));
});

test('public resource lab refuses invalid/unsupported native selection before private credentials or loopback listener acquisition', () => {
  const fingerprint = 'sha256:' + 'a'.repeat(64);
  for (const args of [
    [],
    ['--memory-breach', fingerprint, 'build/native-clean-example/receipt.json'],
    [fingerprint, 'build/bundled/receipt.json'],
    [fingerprint, `build/native-clean-missing-${process.pid}/receipt.json`],
    [
      '--cpu-breach',
      fingerprint,
      `build/native-clean-missing-${process.pid}/receipt.json`,
    ],
  ]) {
    const result = spawnSync(
      process.execPath,
      ['scripts/test-rdp-resource-api-lab.mjs', ...args],
      { encoding: 'utf8', timeout: 10000, maxBuffer: 65536, windowsHide: true },
    );
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(
      result.stderr,
      /Use verified sha256 fingerprint and isolated native receipt|LAB_NATIVE_PROFILE_INVALID|LAB_NATIVE_PROFILE_UNSUPPORTED/,
    );
    assert.equal(result.stderr.includes('xrdp-lab.secrets'), false);
    assert.equal(result.stderr.includes('Server listening'), false);
  }
});

test('resource lab rejects arguments and missing profiles before requiring built runtime modules', async () => {
  await mkdir('build', { recursive: true });
  const root = await mkdtemp(resolve('build/resource-lab-bootstrap-'));
  try {
    await mkdir(join(root, 'scripts'));
    for (const name of [
      'test-rdp-resource-api-lab.mjs',
      'resource-lab-profile.mjs',
      'connected-cpu-load.mjs',
      'viewer-lab-files.mjs',
    ])
      await copyFile(join('scripts', name), join(root, 'scripts', name));
    for (const args of [
      [],
      ['sha256:' + 'a'.repeat(64), 'build/native-clean-missing/receipt.json'],
    ]) {
      const result = spawnSync(
        process.execPath,
        ['scripts/test-rdp-resource-api-lab.mjs', ...args],
        {
          cwd: root,
          encoding: 'utf8',
          timeout: 10000,
          maxBuffer: 65536,
          windowsHide: true,
        },
      );
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.match(
        result.stderr,
        /Use verified sha256 fingerprint and isolated native receipt|LAB_NATIVE_PROFILE_INVALID|LAB_NATIVE_PROFILE_UNSUPPORTED/,
      );
      assert.doesNotMatch(
        result.stderr,
        /ERR_MODULE_NOT_FOUND|xrdp-lab\.secrets|Server listening/,
      );
      assert.deepEqual(await readdir(root), ['scripts']);
    }
  } finally {
    assert.equal(dirname(root), resolve('build'));
    await rm(root, { recursive: true, force: true });
  }
});
