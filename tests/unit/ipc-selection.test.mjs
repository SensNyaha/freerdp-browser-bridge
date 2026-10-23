import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  parseIpcManifest,
  selectWorkerIpc,
} from '../../packages/node-bridge/dist/ipc-selection.js';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const profile = () => ({
  v: 1,
  transport: 'unix-seqpacket-rws1',
  worker: 'rdp-worker',
  adapter: 'rdp-ipc.node',
  maxPairs: 32,
  workerSha256: hash('worker'),
  adapterSha256: hash('adapter'),
});
test('IPC pairing schema: exact bounded build identity and no path or unknown-field interpretation', () => {
  const original = profile();
  assert.deepEqual(parseIpcManifest(original), original);
  for (const change of [
    { v: 2 },
    { worker: '../rdp-worker' },
    { adapter: '/evil.node' },
    { transport: 'other' },
    { maxPairs: 33 },
    { workerSha256: 'x'.repeat(64) },
    { adapterSha256: 'A'.repeat(64) },
    { extra: true },
  ])
    assert.throws(() => parseIpcManifest({ ...original, ...change }), {
      code: 'IPC_PAIR_INVALID',
    });
  for (const value of [null, [], {}, 'json'])
    assert.throws(() => parseIpcManifest(value), { code: 'IPC_PAIR_INVALID' });
});
async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'ipc-pair-'));
  try {
    await run(root, join(root, 'rdp-worker'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
test(
  'Linux IPC preference: old executable without pairing metadata preserves framed fallback; matched artifacts select packet',
  { skip: process.platform !== 'linux' },
  async () => {
    await fixture(async (root, worker) => {
      assert.equal(await selectWorkerIpc(worker, 'auto'), 'framed-pipes');
      await writeFile(worker, 'worker');
      assert.equal(await selectWorkerIpc(worker, 'auto'), 'framed-pipes');
      await writeFile(join(root, 'rdp-ipc.node'), 'adapter');
      await writeFile(worker + '.ipc.json', JSON.stringify(profile()));
      assert.equal(
        await selectWorkerIpc(worker, 'auto'),
        'unix-seqpacket-rws1',
      );
      assert.equal(
        await selectWorkerIpc(worker, 'framed-pipes'),
        'framed-pipes',
      );
      const alias = join(root, 'worker-alias');
      await symlink(worker, alias);
      assert.equal(await selectWorkerIpc(alias, 'auto'), 'unix-seqpacket-rws1');
    });
  },
);
test(
  'Linux IPC pairing: incomplete/malformed/oversized/symlinked metadata and changed binaries refuse before addon loading',
  { skip: process.platform !== 'linux' },
  async () => {
    await fixture(async (root, worker) => {
      await writeFile(worker, 'worker');
      await writeFile(join(root, 'rdp-ipc.node'), 'adapter');
      const metadata = worker + '.ipc.json';
      for (const value of [
        'invalid-json',
        'x'.repeat(8193),
        JSON.stringify({ ...profile(), worker: 'other' }),
      ]) {
        await writeFile(metadata, value);
        await assert.rejects(selectWorkerIpc(worker, 'auto'), {
          code: 'IPC_PAIR_INVALID',
        });
      }
      await writeFile(metadata, JSON.stringify(profile()));
      await writeFile(join(root, 'rdp-ipc.node'), 'changed');
      await assert.rejects(selectWorkerIpc(worker, 'auto'), {
        code: 'IPC_PAIR_MISMATCH',
      });
      await writeFile(join(root, 'rdp-ipc.node'), 'adapter');
      await writeFile(worker, 'changed');
      await assert.rejects(selectWorkerIpc(worker, 'auto'), {
        code: 'IPC_PAIR_MISMATCH',
      });
      await writeFile(worker, 'worker');
      await rm(metadata);
      const outside = join(root, 'metadata');
      await writeFile(outside, JSON.stringify(profile()));
      await symlink(outside, metadata);
      await assert.rejects(selectWorkerIpc(worker, 'auto'), {
        code: 'IPC_PAIR_INVALID',
      });
      await rm(metadata);
      await promisify(execFile)('mkfifo', [metadata]);
      await assert.rejects(selectWorkerIpc(worker, 'auto'), {
        code: 'IPC_PAIR_INVALID',
      });
    });
  },
);
