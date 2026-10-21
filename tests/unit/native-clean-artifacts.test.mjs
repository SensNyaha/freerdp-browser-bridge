import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, open, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { nativeCleanArtifactHashes } from '../../scripts/native-clean-artifacts.mjs';

const abc = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const empty =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
async function fixture(run) {
  const root = await mkdtemp(resolve('build/native-artifact-test-'));
  assert.equal(dirname(root), resolve('build'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
test('clean native artifact receipt binds Windows foundation worker/helper to independent known digests', async () =>
  fixture(async (root) => {
    await writeFile(join(root, 'rdp-worker.exe'), 'abc');
    await writeFile(join(root, 'rdp-runtime-directory.exe'), '');
    assert.deepEqual(await nativeCleanArtifactHashes(root, false, 'win32'), {
      'rdp-worker.exe': abc,
      'rdp-runtime-directory.exe': empty,
    });
    assert.deepEqual(await nativeCleanArtifactHashes(root, true, 'win32'), {
      'rdp-worker.exe': abc,
      'rdp-runtime-directory.exe': empty,
    });
  }));
test('clean native artifact receipt preserves Linux linked inventory and includes the foundation query helper', async () =>
  fixture(async (root) => {
    for (const name of [
      'rdp-worker',
      'rdp-process-query',
      'rdp-ipc.node',
      'rdp-worker.ipc.json',
    ])
      await writeFile(join(root, name), name === 'rdp-worker' ? 'abc' : '');
    assert.deepEqual(await nativeCleanArtifactHashes(root, false, 'linux'), {
      'rdp-worker': abc,
      'rdp-process-query': empty,
    });
    assert.deepEqual(await nativeCleanArtifactHashes(root, true, 'linux'), {
      'rdp-worker': abc,
      'rdp-ipc.node': empty,
      'rdp-worker.ipc.json': empty,
    });
  }));
test('clean native artifact receipt refuses a missing output and an oversized output without leaving streams open', async () =>
  fixture(async (root) => {
    await writeFile(join(root, 'rdp-worker.exe'), 'abc');
    await assert.rejects(nativeCleanArtifactHashes(root, false, 'win32'), {
      code: 'ENOENT',
    });
    const target = join(root, 'rdp-runtime-directory.exe');
    const handle = await open(target, 'wx');
    try {
      await handle.truncate(67108865);
    } finally {
      await handle.close();
    }
    await assert.rejects(nativeCleanArtifactHashes(root, false, 'win32'), {
      message: 'Build artifact exceeded',
    });
    const exact = await open(target, 'r+');
    try {
      await exact.truncate(67108864);
    } finally {
      await exact.close();
    }
    assert.equal(
      (await nativeCleanArtifactHashes(root, false, 'win32'))[
        'rdp-runtime-directory.exe'
      ],
      '3b6a07d0d404fab4e23b6d34bc6696a6a312dd92821332385e5af7c01c421351',
    );
    await rm(target);
    await writeFile(target, '');
    assert.equal(
      (await nativeCleanArtifactHashes(root, false, 'win32'))[
        'rdp-runtime-directory.exe'
      ],
      empty,
    );
  }));
test('clean native artifact receipt refuses unsupported profiles before reading outputs', async () => {
  for (const [linked, platform] of [
    [undefined, 'win32'],
    [0, 'linux'],
    [false, 'darwin'],
  ])
    await assert.rejects(
      nativeCleanArtifactHashes('absent', linked, platform),
      { message: 'Unsupported native artifact profile' },
    );
});
