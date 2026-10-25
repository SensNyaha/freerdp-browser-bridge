// Real Node/native lifecycle owner, controlled only by this test's private stdin.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import {
  WorkerProcess,
  recoverRuntimeSessions,
} from '../../packages/node-bridge/dist/index.js';

const runtimeRoot = resolve(process.argv[2]);
assert.equal(process.argv.length, 3);
const binaryDir = resolve(process.env.BRIDGE_TEST_BINARY_DIR);
const workerPath = join(
  binaryDir,
  'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
);
const workers = [0, 1].map(
  () => new WorkerProcess({ workerPath, runtimeRoot }),
);
const orphan = `worker-${randomBytes(16).toString('hex')}-1-${randomBytes(16).toString('hex')}`;
const reply = (value) => process.stdout.write(JSON.stringify(value) + '\n');
let pending = '';
let closed = false;
let phase = 'startup';
const timer = setTimeout(() => {
  process.exitCode = 1;
  process.stdin.destroy();
}, 90000);
async function close() {
  if (closed) return;
  closed = true;
  clearTimeout(timer);
  await Promise.all(workers.map((worker) => worker.close()));
}
try {
  await Promise.all(workers.map((worker) => worker.start()));
  phase = 'orphan';
  const active = (await readdir(runtimeRoot)).sort();
  assert.equal(active.length, 2);
  if (process.platform === 'win32')
    await promisify(execFile)(
      join(binaryDir, 'rdp-runtime-directory.exe'),
      ['--create-private-directory', join(runtimeRoot, orphan)],
      { timeout: 5000, maxBuffer: 128, windowsHide: true },
    );
  else await mkdir(join(runtimeRoot, orphan), { mode: 0o700 });
  await writeFile(
    join(runtimeRoot, orphan, '.rdp-worker-owned'),
    'runtime-v1',
    {
      flag: 'wx',
      mode: 0o600,
    },
  );
  const expected = [...active, orphan].sort();
  reply({ v: 1, ready: true, active, orphan });
  phase = 'commands';
  commands: for await (const bytes of process.stdin) {
    assert.ok(bytes.length + pending.length <= 32);
    pending += bytes.toString('ascii');
    let index;
    while ((index = pending.indexOf('\n')) >= 0) {
      const command = pending.slice(0, index);
      pending = pending.slice(index + 1);
      if (command === 'check') {
        await Promise.all(workers.map((worker) => worker.ping()));
        assert.deepEqual((await readdir(runtimeRoot)).sort(), expected);
        assert.equal(
          await readFile(
            join(runtimeRoot, orphan, '.rdp-worker-owned'),
            'utf8',
          ),
          'runtime-v1',
        );
        reply({ v: 1, live: 2, preserved: 3 });
      } else if (command === 'recover') {
        assert.deepEqual(
          await recoverRuntimeSessions({ workerPath, runtimeRoot }),
          {
            supported: true,
            complete: true,
            scanned: 3,
            removed: 1,
            active: 2,
            retained: 0,
          },
        );
        assert.deepEqual((await readdir(runtimeRoot)).sort(), active);
        await Promise.all(workers.map((worker) => worker.ping()));
        reply({ v: 1, recovered: 1, live: 2 });
      } else if (command === 'expose' || command === 'restore') {
        assert.equal(process.platform, 'linux');
        const exposed = command === 'expose';
        await chmod(join(runtimeRoot, orphan), exposed ? 0o755 : 0o700);
        await chmod(
          join(runtimeRoot, orphan, '.rdp-worker-owned'),
          exposed ? 0o644 : 0o600,
        );
        reply({ v: 1, exposed });
      } else if (command === 'close') {
        await close();
        assert.deepEqual(await readdir(runtimeRoot), []);
        assert.ok(workers.every((worker) => worker.state === 'closed'));
        for (const worker of workers)
          assert.throws(() => process.kill(worker.pid, 0), { code: 'ESRCH' });
        reply({ v: 1, closed: true, remaining: 0 });
        break commands;
      } else throw new Error('FIXTURE_COMMAND_REFUSED');
    }
  }
} catch (error) {
  reply({
    v: 1,
    failure: phase,
    code: /^[A-Z_]{2,64}$/.test(error?.code ?? '')
      ? error.code
      : 'FIXTURE_FAILED',
  });
  process.exitCode = 1;
} finally {
  await close();
}
// Runtime names are fixed schema components, never absolute paths in evidence.
assert.equal(basename(runtimeRoot), 'runtime');
