import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  readdir,
} from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { viewerWorkerOptions } from '../../scripts/viewer-worker-options.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function fixture(run) {
  const root = await mkdtemp(resolve('build/viewer-profile-'));
  try {
    await run(root);
  } finally {
    assert.equal(dirname(root), resolve('build'));
    await rm(root, { recursive: true, force: true });
  }
}

test('viewer worker options preserve bundled defaults without reading receipts or creating runtime directories', async () => {
  await fixture(async (root) => {
    for (const [platform, suffix] of [
      ['win32', '.exe'],
      ['linux', ''],
    ]) {
      const value = await viewerWorkerOptions(undefined, root, platform);
      assert.equal(value.profile, undefined);
      assert.deepEqual(value.options, {
        workerPath: join(root, 'build/bundled/rdp-worker' + suffix),
        runtimeRoot: join(root, '.runtime/viewer-lab'),
      });
    }
    assert.deepEqual(await readdir(root), []);
  });
});

test('viewer worker options bind selected Debug/Release worker and colocated helper hashes with the existing receipt guard', async () => {
  await fixture(async (root) => {
    const receipt = 'build/native-clean-viewer/receipt.json';
    const out = join(root, 'build/native-clean-viewer/out');
    const worker = Buffer.from('synthetic selected worker'),
      helper = Buffer.from('synthetic colocated helper');
    await mkdir(out, { recursive: true });
    await writeFile(join(out, 'rdp-worker.exe'), worker);
    await writeFile(join(out, 'rdp-runtime-directory.exe'), helper);
    const body = {
      cleanNativeSource: true,
      prebuiltOutput: false,
      linked: true,
      sourceUnchanged: true,
      platform: 'win32',
      fixture: 'build/native-clean-viewer',
      sdkSourceCommit: 'bf217a504e54cc719880c228e82353382cd7d4fa',
      sourceHash: 'b'.repeat(64),
      artifacts: {
        'rdp-worker.exe': hash(worker),
        'rdp-runtime-directory.exe': hash(helper),
      },
    };
    for (const buildType of ['Debug', 'Release']) {
      await writeFile(
        join(root, receipt),
        JSON.stringify({ ...body, buildProfile: { buildType } }),
      );
      const value = await viewerWorkerOptions(receipt, root, 'win32');
      assert.equal(value.options.workerPath, join(out, 'rdp-worker.exe'));
      assert.equal(
        value.options.runtimeRoot,
        join(root, '.runtime/viewer-lab'),
      );
      assert.equal(value.profile.buildType, buildType);
      assert.equal(value.profile.workerHash, hash(worker));
      assert.equal(value.profile.helperHash, hash(helper));
    }
    await writeFile(join(out, 'rdp-runtime-directory.exe'), 'changed helper');
    await assert.rejects(viewerWorkerOptions(receipt, root, 'win32'), {
      message: 'LAB_NATIVE_PROFILE_INVALID',
    });
    assert.equal(
      (await readFile(join(out, 'rdp-worker.exe'))).toString(),
      worker.toString(),
    );
  });
});

test('viewer CLI refuses invalid or unavailable native profiles before private lab configuration and listener acquisition', async () => {
  await fixture(async (root) => {
    const script = resolve('scripts/test-xrdp-viewer.mjs');
    for (const extra of [
      ['../receipt.json'],
      ['build/native-clean-missing/receipt.json'],
      ['build/native-clean-missing/receipt.json', 'extra'],
    ]) {
      const child = spawnSync(
        process.execPath,
        [
          script,
          'sha256:' + 'a'.repeat(64),
          'h264',
          '--audio-opus-compat-tone-listen',
          ...extra,
        ],
        {
          cwd: root,
          encoding: 'utf8',
          windowsHide: true,
          timeout: 5000,
        },
      );
      assert.equal(child.status, 1, child.stderr);
      assert.match(
        child.stderr,
        /Use an isolated native receipt|LAB_NATIVE_PROFILE_(?:INVALID|UNSUPPORTED)|Pass the previously verified certificate fingerprint/,
      );
      assert.doesNotMatch(child.stderr, /xrdp-lab|\.local-tests/);
      assert.deepEqual(await readdir(root), []);
    }
  });
});
