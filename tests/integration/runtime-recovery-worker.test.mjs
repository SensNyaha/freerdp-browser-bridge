import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  readFile,
  readdir,
  writeFile,
  mkdir,
  rm,
  stat,
} from 'node:fs/promises';
import { join, basename, dirname, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { RuntimeOwner } from '../../packages/node-bridge/dist/runtime-owner.js';
import { recoverRuntimeSessions } from '../../packages/node-bridge/dist/index.js';
import { eventually } from '../fixtures/session-worker.mjs';
import {
  binaryDir,
  runtimeFixture,
  launchRuntimeWorker,
} from '../fixtures/runtime-ownership.mjs';

const exec = promisify(execFile);
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
};
const helper = join(
  binaryDir,
  'rdp-runtime-recovery' + (process.platform === 'win32' ? '.exe' : ''),
);
async function recover(root, name) {
  const result = await exec(helper, [root, name], {
    windowsHide: true,
    timeout: 5000,
    maxBuffer: 4096,
  });
  assert.equal(result.stderr, '');
  const receipt = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(receipt).sort(), ['status', 'v']);
  assert.equal(receipt.v, 1);
  assert.ok(['removed', 'busy', 'retained'].includes(receipt.status));
  return receipt.status;
}
test(
  'native recovery: Node ownership preserves a session before worker startup; closed owner allows cleanup',
  { timeout: 20000 },
  async () => {
    const owner = await RuntimeOwner.open();
    try {
      await runtimeFixture(
        async (root, directory) => {
          assert.equal(await recover(root, basename(directory)), 'busy');
          assert.equal(
            await readFile(join(directory, '.rdp-worker-owned'), 'utf8'),
            'runtime-v1',
          );
          await owner.close();
          assert.equal(await recover(root, basename(directory)), 'removed');
          assert.deepEqual(await readdir(root), []);
        },
        { ownerId: owner.id },
      );
    } finally {
      await owner.close();
    }
  },
);
test(
  'native recovery: a live worker with absent Node endpoint is preserved; hard kill permits cleanup',
  { timeout: 20000 },
  async () =>
    runtimeFixture(async (root, directory) => {
      const worker = launchRuntimeWorker(directory);
      try {
        assert.equal(await worker.ready, true, worker.diagnostic());
        assert.equal(await recover(root, basename(directory)), 'busy');
        assert.deepEqual(await readdir(directory), ['.rdp-worker-owned']);
      } finally {
        await worker.kill();
      }
      assert.equal(await recover(root, basename(directory)), 'removed');
      assert.deepEqual(await readdir(root), []);
    }),
);
test(
  'native recovery: concurrent helpers remove one owned directory once and preserve an active sibling',
  { timeout: 20000 },
  async () => {
    const owner = await RuntimeOwner.open();
    try {
      await runtimeFixture(
        async (activeRoot, activeDirectory) => {
          await runtimeFixture(async (root, directory) => {
            const results = await Promise.all([
              recover(root, basename(directory)),
              recover(root, basename(directory)),
            ]);
            assert.equal(
              results.filter((status) => status === 'removed').length,
              1,
            );
            assert.deepEqual(await readdir(root), []);
            assert.equal(
              await recover(activeRoot, basename(activeDirectory)),
              'busy',
            );
            assert.equal(
              await readFile(
                join(activeDirectory, '.rdp-worker-owned'),
                'utf8',
              ),
              'runtime-v1',
            );
          });
        },
        { ownerId: owner.id },
      );
    } finally {
      await owner.close();
    }
  },
);
test(
  'native recovery: unknown file and nested directory retain all content and the owned marker',
  { timeout: 20000 },
  async () => {
    for (const nested of [false, true])
      await runtimeFixture(async (root, directory) => {
        const unknown = join(directory, 'unknown');
        if (nested) await mkdir(unknown);
        else await writeFile(unknown, 'preserve');
        assert.equal(await recover(root, basename(directory)), 'retained');
        assert.equal(
          await readFile(join(directory, '.rdp-worker-owned'), 'utf8'),
          'runtime-v1',
        );
        if (nested) assert.equal((await stat(unknown)).isDirectory(), true);
        else assert.equal(await readFile(unknown, 'utf8'), 'preserve');
      });
  },
);
test(
  'native recovery: missing and startup-prefix markers are recoverable; invalid bytes are retained',
  { timeout: 20000 },
  async () => {
    for (const marker of [undefined, '', 'runtime-v', 'Runtime-v1'])
      await runtimeFixture(async (root, directory) => {
        const path = join(directory, '.rdp-worker-owned');
        if (marker === undefined) await rm(path);
        else await writeFile(path, marker);
        const expected = marker === 'Runtime-v1' ? 'retained' : 'removed';
        assert.equal(await recover(root, basename(directory)), expected);
        if (expected === 'retained')
          assert.equal(await readFile(path, 'utf8'), marker);
        else assert.deepEqual(await readdir(root), []);
      });
  },
);
test(
  'native recovery: real foreign UID root remains untouched',
  {
    skip:
      process.platform !== 'linux' ||
      !process.env.BRIDGE_TEST_FOREIGN_RUNTIME_ROOT,
  },
  async () => {
    const root = process.env.BRIDGE_TEST_FOREIGN_RUNTIME_ROOT;
    const before = await stat(root);
    assert.notEqual(before.uid, process.getuid());
    assert.equal(
      await recover(root, 'worker-' + 'a'.repeat(32) + '-1-' + 'b'.repeat(32)),
      'retained',
    );
    const after = await stat(root);
    assert.equal(after.uid, before.uid);
    assert.equal(after.mode, before.mode);
    assert.equal(after.ino, before.ino);
  },
);

async function withOwnerProcess(run) {
  const parent = spawn(
    process.execPath,
    [
      fileURLToPath(
        new URL('../fixtures/runtime-recovery-parent.mjs', import.meta.url),
      ),
    ],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  parent.stdin.on('error', () => {});
  const closed = once(parent, 'close');
  let output = '';
  let diagnostic = '';
  let owned;
  const timer = setTimeout(() => parent.kill('SIGKILL'), 10000);
  parent.stdout.on('data', (bytes) => {
    if (output.length + bytes.length > 4096) parent.kill('SIGKILL');
    else output += bytes.toString('utf8');
  });
  parent.stderr.on('data', (bytes) => {
    if (diagnostic.length + bytes.length > 4096) parent.kill('SIGKILL');
    else diagnostic += bytes.toString('utf8');
  });
  try {
    await eventually(
      () =>
        output.includes('\n') ||
        parent.exitCode !== null ||
        parent.signalCode !== null,
      5000,
    );
    assert.equal(parent.exitCode, null, diagnostic);
    assert.equal(parent.signalCode, null, diagnostic);
    const candidate = JSON.parse(output.split('\n')[0]);
    assert.deepEqual(Object.keys(candidate).sort(), ['name', 'pid', 'root']);
    assert.equal(typeof candidate.root, 'string');
    assert.equal(isAbsolute(candidate.root), true);
    assert.equal(dirname(candidate.root), tmpdir());
    assert.match(
      basename(candidate.root),
      /^bridge-native-lease-[a-zA-Z0-9]{6}$/,
    );
    assert.match(candidate.name, /^worker-[a-f0-9]{32}-1-[a-f0-9]{32}$/);
    assert.ok(
      Number.isSafeInteger(candidate.pid) &&
        candidate.pid > 0 &&
        candidate.pid !== process.pid &&
        candidate.pid !== parent.pid,
    );
    owned = candidate;
    await run({ parent, closed, owned, output: () => output });
    assert.equal(diagnostic, '');
  } finally {
    clearTimeout(timer);
    if (parent.exitCode === null && parent.signalCode === null)
      parent.kill('SIGKILL');
    await closed;
    if (owned) {
      if (alive(owned.pid)) process.kill(owned.pid, 'SIGKILL');
      await eventually(() => !alive(owned.pid), 3000);
      await rm(owned.root, { recursive: true, force: true, maxRetries: 3 });
    }
  }
}
test(
  'native recovery: parent-only hard kill preserves the existing managed-worker self-cleanup',
  { timeout: 20000 },
  async () =>
    withOwnerProcess(async ({ parent, closed, owned }) => {
      parent.kill('SIGKILL');
      await closed;
      await eventually(() => !alive(owned.pid), 3000);
      assert.deepEqual(await readdir(owned.root), []);
      assert.equal(await recover(owned.root, owned.name), 'retained');
    }),
);
test(
  'native recovery: simultaneous Node/worker hard kill leaves an orphan that the helper reclaims',
  { timeout: 20000 },
  async () =>
    withOwnerProcess(async ({ parent, closed, owned, output }) => {
      parent.stdin.write('hold\n');
      await eventually(() => output().includes('\nholding\n'), 3000);
      process.kill(owned.pid, 'SIGKILL');
      // Blocked Node cannot perform JS cleanup; its OS endpoint still owns the dir.
      assert.equal(await recover(owned.root, owned.name), 'busy');
      parent.kill('SIGKILL');
      await closed;
      await eventually(() => !alive(owned.pid), 3000);
      assert.equal(
        await readFile(
          join(owned.root, owned.name, '.rdp-worker-owned'),
          'utf8',
        ),
        'runtime-v1',
      );
      const report = await recoverRuntimeSessions({
        workerPath: join(
          binaryDir,
          'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
        ),
        runtimeRoot: owned.root,
      });
      assert.deepEqual(report, {
        supported: true,
        complete: true,
        scanned: 1,
        removed: 1,
        active: 0,
        retained: 0,
      });
      assert.deepEqual(await readdir(owned.root), []);
    }),
);
